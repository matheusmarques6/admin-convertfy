/**
 * Estruturador — orquestração (fase 2: SHADOW).
 *
 * Roda dentro da fase 1 do pipeline (chamado pelo generate.service quando
 * `estruturador_mode != 'off'`): carrega o material do vault sincronizado,
 * monta o prompt (SYSTEM cacheável por flow, embrulhado por slug), invoca o
 * LLM com retry 1×, valida por código e grava a run completa — que É a
 * persistência do embasamento (não há tabela própria).
 *
 * Em shadow o resultado NÃO altera o pipeline: a função devolve o output
 * validado (ou null) e o caller decide o que fazer — em 'shadow', nada; em
 * 'on' (fase 3) o generate.service o consome como estrutura (ver
 * estruturador-consume.ts). Falha aqui NUNCA derruba a geração (try/catch
 * no caller + fallback documentado no outline).
 *
 * Telemetria (ocasiões B/C do mapa de dados): input_vars auditável
 * (slugs servidos, vault_commit_sha, capacidade, proibidas, modo),
 * rendered_prompt = user COMPLETO + system_sha8 (o system de ~15-20k
 * tokens é reconstruível pelo commit do vault), parsed_output = embasamento
 * + relatório do validador.
 */

import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  finishGenerationRun,
  resolveCostCents,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import {
  invokeAgent,
  loadActiveAgentConfig,
  extractJson,
  type AgentInvokeConfig,
} from "../architect/llm-invoke"
import { renderImageTemplate } from "../image/template-renderer"
import {
  buildInterpolatedSegments,
  buildSegmentedPrompt,
  concatSegments,
  type InputSummaryItem,
  type PromptSegment,
  type SegmentOrigin,
} from "../shared/prompt-provenance"
import { fieldOrMissing } from "../architect/store-context"
import {
  buildSystemVars,
  DEFAULT_ESTRUTURADOR_SYSTEM,
  DEFAULT_ESTRUTURADOR_USER,
  type EstruturadorOutput,
  type MaterialDoFlow,
} from "./estruturador-prompt"
import {
  validarOutput,
  type CapacidadeBiblioteca,
} from "./estruturador-validator"

const log = logger.child("Estruturador")

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
const MAX_ATTEMPTS = 2
/** Janela do anti-repetição (lote 2: espaço de sequências é pequeno). */
const HISTORICO_N = 2

export type EstruturadorMode = "off" | "shadow" | "on"

// ── Proveniência (plano telemetria 26/08): origem de cada var do prompt ──

const SYSTEM_ORIGINS: Record<string, SegmentOrigin> = {
  intencao_flow: { cls: "vault", rotulo: "Intenção do flow — email_intents (_flow)" },
  progressao: { cls: "vault", rotulo: "Progressão observada — email_intents (progressao)" },
  referencias: { cls: "vault", rotulo: "Referências de estrutura — email_structure_refs" },
  aprendizados: { cls: "vault", rotulo: "Aprendizados — email_learnings" },
}

const USER_ORIGINS: Record<string, SegmentOrigin> = {
  brand_name: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  nicho: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  posicionamento: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  tom_voz: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  persona: { cls: "loja", rotulo: "Dados da loja — client_stores" },
  produtos_count: { cls: "loja", rotulo: "Produtos da loja — store_products" },
  top_products: { cls: "loja", rotulo: "Produtos da loja — store_products" },
  pesquisa: { cls: "loja", rotulo: "Pesquisa & Diagnóstico — client_stores" },
  flow_type: { cls: "sistema", rotulo: "Identidade do email — pipeline" },
  email_number: { cls: "sistema", rotulo: "Identidade do email — pipeline" },
  intencao_email: { cls: "vault", rotulo: "Intenção DESTE email — email_intents" },
  capacidade_biblioteca: { cls: "sistema", rotulo: "Capacidade da biblioteca — contagem por código" },
  estruturas_proibidas: { cls: "sistema", rotulo: "Anti-repetição — runs anteriores deste email" },
}

function resumo(v: string | null | undefined, max = 240): string {
  const t = (v ?? "").trim()
  if (!t) return "(vazio)"
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export interface RunEstruturadorInput {
  storeId: string
  flowId?: string | null
  emailId?: string | null
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  mode: EstruturadorMode
  // Contexto da loja — o generate.service já tem tudo resolvido.
  brandName: string
  nicho: string
  posicionamento: string
  tomVoz: string
  persona: string
  pesquisa: string
  topProductNames: string[]
}

export interface RunEstruturadorResult {
  output: EstruturadorOutput | null
  runId: string | null
  /** 'ok' | 'sem_material' | 'falhou' — o caller loga; nunca lança. */
  status: "ok" | "sem_material" | "falhou"
}

// ── Cargas ──────────────────────────────────────────────────────────────

async function loadMaterial(flowType: string): Promise<{
  material: MaterialDoFlow
  intencaoEmail: string | null
  refsServidas: string[]
  aprendizadosServidos: string[]
  vaultCommitSha: string | null
} | null> {
  const admin = createAdminClient()
  const [intentsRes, refsRes, learningsRes, stateRes] = await Promise.all([
    admin.from("email_intents")
      .select("slug, kind, email_number, body_md")
      .eq("flow_type", flowType).eq("is_active", true),
    admin.from("email_structure_refs")
      .select("slug, body_md")
      .eq("flow_type", flowType).eq("is_active", true),
    // Do flow + _global aplicável (aplica_a contém o flow).
    admin.from("email_learnings")
      .select("slug, flow_type, aplica_a, body_md")
      .eq("is_active", true)
      .or(`flow_type.eq.${flowType},flow_type.is.null`),
    admin.from("vault_sync_state").select("last_commit_sha").eq("id", "default").maybeSingle(),
  ])

  const intents = intentsRes.data ?? []
  const refs = refsRes.data ?? []
  const learnings = (learningsRes.data ?? []).filter(
    (l) => l.flow_type === flowType || (l.aplica_a ?? []).includes(flowType),
  )

  if (refs.length === 0) return null // sem candidatas = sem material p/ decidir

  return {
    material: {
      intencaoFlow: pick(intents, (i) => i.slug === "_flow"),
      progressao: pick(intents, (i) => i.kind === "progressao"),
      referencias: refs.map((r) => ({ slug: r.slug as string, body: r.body_md as string })),
      aprendizados: learnings.map((l) => ({ slug: l.slug as string, body: l.body_md as string })),
    },
    intencaoEmail:
      (intents.find((i) => i.email_number != null) as { body_md?: string } | undefined) == null
        ? null
        : ((intents.find(
            (i) => (i.email_number as number | null) != null,
          ) as { body_md: string } | undefined)?.body_md ?? null),
    refsServidas: refs.map((r) => r.slug as string),
    aprendizadosServidos: learnings.map((l) => l.slug as string),
    vaultCommitSha: (stateRes.data?.last_commit_sha as string | null) ?? null,
  }

  function pick(
    rows: Array<{ slug?: unknown; kind?: unknown; body_md?: unknown }>,
    pred: (r: { slug?: unknown; kind?: unknown }) => boolean,
  ) {
    const r = rows.find(pred)
    return r ? { slug: String(r.slug), body: String(r.body_md) } : null
  }
}

async function loadIntencaoDoEmail(flowType: string, emailNumber: number): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("email_intents")
    .select("body_md")
    .eq("flow_type", flowType).eq("email_number", emailNumber).eq("is_active", true)
    .maybeSingle()
  return (data?.body_md as string | null) ?? null
}

async function loadCapacidade(produtosDaLoja: number): Promise<CapacidadeBiblioteca> {
  const admin = createAdminClient()
  const { data } = await admin.from("email_component_variants")
    .select("block_type").eq("is_active", true)
  const porCategoria: Record<string, number> = {}
  for (const v of data ?? []) {
    const t = v.block_type as string
    porCategoria[t] = (porCategoria[t] ?? 0) + 1
  }
  return { porCategoria, produtosDaLoja }
}

async function loadSequenciasProibidas(
  emailId: string | null,
  storeId: string,
  flowType: string,
  emailNumber: number,
): Promise<string[][]> {
  const admin = createAdminClient()
  // Runs anteriores DESTE loja×flow×email (por email_id quando existe —
  // pós passo 1 sempre existe; fallback por store no batch antigo não é
  // necessário: sem histórico, sem proibição).
  if (!emailId) return []
  const { data } = await admin.from("email_generation_runs")
    .select("parsed_output")
    .eq("agent", "estruturador").eq("email_id", emailId).eq("status", "success")
    .order("created_at", { ascending: false }).limit(HISTORICO_N)
  const out: string[][] = []
  for (const r of data ?? []) {
    const estrutura = (r.parsed_output as { estrutura?: Array<{ section?: string }> } | null)?.estrutura
    if (Array.isArray(estrutura)) {
      const seq = estrutura.map((p) => String(p.section ?? "")).filter(Boolean)
      if (seq.length > 0) out.push(seq)
    }
  }
  void storeId; void flowType; void emailNumber
  return out
}

// ── Run ─────────────────────────────────────────────────────────────────

export async function runEstruturador(
  input: RunEstruturadorInput,
): Promise<RunEstruturadorResult> {
  const t0 = Date.now()

  const carga = await loadMaterial(input.flowType)
  if (!carga) {
    log.info("estruturador.sem_material", { flowType: input.flowType, storeId: input.storeId })
    return { output: null, runId: null, status: "sem_material" }
  }
  const intencaoEmail = await loadIntencaoDoEmail(input.flowType, input.emailNumber)
  if (!intencaoEmail) {
    log.info("estruturador.sem_intencao_do_email", {
      flowType: input.flowType, emailNumber: input.emailNumber,
    })
    return { output: null, runId: null, status: "sem_material" }
  }

  const [capacidade, proibidas] = await Promise.all([
    loadCapacidade(input.topProductNames.length),
    loadSequenciasProibidas(input.emailId ?? null, input.storeId, input.flowType, input.emailNumber),
  ])

  const cfgRow = await loadActiveAgentConfig("estruturador")
  const config: AgentInvokeConfig = {
    model: cfgRow?.model || DEFAULT_MODEL,
    temperature: cfgRow?.temperature ?? 0.4,
    // 4096 truncava: o contrato pede papel + referência + adaptação +
    // porquê por posição, mais diagnóstico, fio, fontes e descartes — tudo
    // prosa. A 1ª tentativa da Innova bateu o teto exato (4.096) e veio
    // cortada no meio do JSON.
    max_tokens: cfgRow?.max_tokens ?? 8192,
    system_prompt: cfgRow?.system_prompt?.trim() || DEFAULT_ESTRUTURADOR_SYSTEM,
    user_template: cfgRow?.user_template?.trim() || DEFAULT_ESTRUTURADOR_USER,
  }

  const systemVars = buildSystemVars(carga.material)
  const systemResolvido = Object.entries(systemVars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, () => v),
    config.system_prompt,
  )
  const systemSha8 = crypto.createHash("sha256").update(systemResolvido).digest("hex").slice(0, 8)

  // Proveniência do SYSTEM: regras = agente, material do vault = vault. O
  // guard byte-igual protege o caso patológico (valor de var contendo outro
  // placeholder, onde o replaceAll sequencial divergiria) — divergiu, os
  // segments saem null e a run degrada pro comportamento atual.
  const sysSeg = buildInterpolatedSegments(
    config.system_prompt,
    systemVars,
    SYSTEM_ORIGINS,
    { parte: "system" },
  )
  const systemSegments: PromptSegment[] | null =
    sysSeg.prompt === systemResolvido ? sysSeg.segments : null

  const capacidadeTexto = Object.entries(capacidade.porCategoria)
    .map(([k, n]) => `${k}: ${n}`).join(" · ") +
    ` · produtos da loja: ${capacidade.produtosDaLoja}`
  const proibidasTexto = proibidas.length
    ? proibidas.map((s) => `- [${s.join(", ")}]`).join("\n")
    : "(nenhuma — primeira geração)"

  const userVars: Record<string, string> = {
    brand_name: input.brandName,
    nicho: fieldOrMissing(input.nicho),
    posicionamento: fieldOrMissing(input.posicionamento),
    tom_voz: fieldOrMissing(input.tomVoz),
    persona: fieldOrMissing(input.persona),
    produtos_count: String(input.topProductNames.length),
    top_products: input.topProductNames.join("; ") || "(sem produtos cadastrados)",
    pesquisa: input.pesquisa || "(sem pesquisa)",
    flow_type: input.flowType,
    email_number: String(input.emailNumber),
    intencao_email: intencaoEmail,
    capacidade_biblioteca: capacidadeTexto,
    estruturas_proibidas: proibidasTexto,
  }

  // Entrada estruturada (aba Entrada do Estúdio) — o que o agente recebeu,
  // com origem. Complementa (não substitui) o input_vars auditável.
  const inputSummary: InputSummaryItem[] = [
    { rotulo: "Loja", cls: "loja", valor: `${input.brandName} — ${input.nicho || "(sem nicho)"}` },
    { rotulo: "Email", cls: "sistema", valor: `${input.flowType} #${input.emailNumber} · modo ${input.mode}` },
    { rotulo: "Pesquisa & Diagnóstico", cls: "loja", valor: `${input.pesquisa.length.toLocaleString("pt-BR")} chars servidos` },
    { rotulo: "Intenção deste email (vault)", cls: "vault", valor: resumo(intencaoEmail) },
    { rotulo: "Referências servidas (vault)", cls: "vault", valor: carga.refsServidas.join(", ") },
    { rotulo: "Aprendizados servidos (vault)", cls: "vault", valor: carga.aprendizadosServidos.join(", ") || "(nenhum)" },
    { rotulo: "Commit do vault", cls: "vault", valor: carga.vaultCommitSha ?? "(desconhecido)" },
    { rotulo: "Capacidade da biblioteca", cls: "sistema", valor: capacidadeTexto },
    { rotulo: "Sequências proibidas (anti-repetição)", cls: "sistema", valor: proibidas.length ? proibidasTexto : "(nenhuma — primeira geração)" },
  ]

  // Segmentos base (1ª tentativa) — no retry as vars mudam e os segments são
  // reconstruídos no loop; aqui é o que a live view mostra enquanto roda.
  const segUserBase = buildSegmentedPrompt(config.user_template, userVars, USER_ORIGINS, { parte: "user" })
  const basePromptSegments = concatSegments(systemSegments, segUserBase.segments)

  const runId = await startGenerationRun({
    storeId: input.storeId,
    flowId: input.flowId ?? undefined,
    emailId: input.emailId ?? undefined,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "estruturador",
    agentConfigId: cfgRow?.id,
    model: config.model,
    inputVars: {
      modo: input.mode,
      refs_servidas: carga.refsServidas,
      aprendizados_servidos: carga.aprendizadosServidos,
      vault_commit_sha: carga.vaultCommitSha,
      capacidade: capacidade.porCategoria,
      produtos_da_loja: capacidade.produtosDaLoja,
      proibidas_count: proibidas.length,
    },
    renderedPrompt: segUserBase.segments
      ? segUserBase.prompt
      : renderImageTemplate(config.user_template, userVars),
    promptSegments: basePromptSegments,
    inputSummary,
  })

  let raw = ""
  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0
  let ultimoErro: string | null = null
  let userPromptFinal = ""
  let promptSegmentsFinal: PromptSegment[] | null = basePromptSegments

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // No retry, o erro do validador volta para o modelo — mesmo padrão
      // dos demais agentes (falha explicada converge melhor que repetição).
      const vars = ultimoErro
        ? { ...userVars, estruturas_proibidas: `${userVars.estruturas_proibidas}\n\nSEU OUTPUT ANTERIOR FOI REPROVADO: ${ultimoErro}` }
        : userVars
      const res = await invokeAgent(config, vars, systemVars)
      raw = res.raw
      tokensIn += res.tokensInput
      tokensOut += res.tokensOutput
      costUsd += res.costUsd
      // O prompt REAL desta tentativa (era JSON.stringify(vars) — 26/08),
      // segmentado por origem. Template custom com {{#if}} → fail-open.
      const segUser = buildSegmentedPrompt(config.user_template, vars, USER_ORIGINS, { parte: "user" })
      userPromptFinal = segUser.segments
        ? segUser.prompt
        : renderImageTemplate(config.user_template, vars)
      promptSegmentsFinal = concatSegments(systemSegments, segUser.segments)

      // `extractJson` devolve STRING — o objeto só existe depois do parse.
      // Sem ele, o validador recebia texto, reprovava no primeiro teste
      // (`typeof !== "object"`) e o agente falhava em 100% das runs, com a
      // mensagem "output não é um objeto JSON" acusando o modelo por um erro
      // nosso. `ValidacaoInput.output` é `unknown`, então o compilador não
      // pegou. Todos os outros agentes fazem `JSON.parse(extractJson(raw))`.
      let parsed: unknown
      try {
        parsed = JSON.parse(extractJson(res.raw))
      } catch {
        // Teto de saída batido = resposta cortada no meio do JSON. Dizer
        // isso em vez de "JSON inválido" é a diferença entre ajustar o
        // `max_tokens` e caçar um bug que não existe.
        throw new Error(
          res.tokensOutput >= config.max_tokens
            ? `resposta truncada no teto de ${config.max_tokens} tokens de saída — o JSON veio incompleto`
            : "resposta não é JSON válido",
        )
      }
      const validado = validarOutput({
        output: parsed,
        refsServidas: carga.refsServidas,
        aprendizadosServidos: carga.aprendizadosServidos,
        capacidade,
        sequenciasProibidas: proibidas,
      })

      if (validado.ok && validado.saida) {
        await finishGenerationRun(runId, {
          storeId: input.storeId,
          flowId: input.flowId ?? undefined,
          emailId: input.emailId ?? undefined,
          triggeredBy: input.triggeredBy,
          batchId: input.batchId,
          agent: "estruturador",
          agentConfigId: cfgRow?.id,
          status: "success",
          model: config.model,
          inputVars: {
            modo: input.mode,
            refs_servidas: carga.refsServidas,
            aprendizados_servidos: carga.aprendizadosServidos,
            vault_commit_sha: carga.vaultCommitSha,
            capacidade: capacidade.porCategoria,
            produtos_da_loja: capacidade.produtosDaLoja,
            proibidas_count: proibidas.length,
            system_sha8: systemSha8,
          },
          renderedPrompt: userPromptFinal,
          promptSegments: promptSegmentsFinal,
          inputSummary,
          rawOutput: raw.slice(0, 16000),
          parsedOutput: {
            ...validado.saida,
            _validador: {
              retry_count: attempt - 1,
              posicoes_removidas: validado.removidasPeloValidador.length,
              shadow: input.mode !== "on",
            },
          },
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          costCents: resolveCostCents({
            model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd,
          }),
          durationMs: Date.now() - t0,
          retryCount: attempt - 1,
        })
        log.info("estruturador.ok", {
          storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber,
          modo: input.mode, posicoes: validado.saida.estrutura.length, attempt,
        })
        return { output: validado.saida, runId, status: "ok" }
      }
      ultimoErro = validado.errosFatais.join("; ")
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message : String(err)
    }
    log.warn("estruturador.attempt_failed", {
      storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber,
      attempt, error: ultimoErro,
    })
  }

  // 2 falhas → run error; o caller segue no outline (fallback documentado).
  await finishGenerationRun(runId, {
    storeId: input.storeId,
    flowId: input.flowId ?? undefined,
    emailId: input.emailId ?? undefined,
    triggeredBy: input.triggeredBy,
    batchId: input.batchId,
    agent: "estruturador",
    agentConfigId: cfgRow?.id,
    status: "error",
    model: config.model,
    errorMessage: ultimoErro ?? "estruturador_failed",
    inputVars: {
      modo: input.mode,
      refs_servidas: carga.refsServidas,
      vault_commit_sha: carga.vaultCommitSha,
      system_sha8: systemSha8,
    },
    renderedPrompt: userPromptFinal || undefined,
    promptSegments: promptSegmentsFinal,
    inputSummary,
    rawOutput: raw.slice(0, 16000) || undefined,
    tokensInput: tokensIn,
    tokensOutput: tokensOut,
    costCents: resolveCostCents({
      model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd,
    }),
    durationMs: Date.now() - t0,
    retryCount: MAX_ATTEMPTS - 1,
  })
  return { output: null, runId, status: "falhou" }
}
