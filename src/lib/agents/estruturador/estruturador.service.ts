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
    max_tokens: cfgRow?.max_tokens ?? 4096,
    system_prompt: cfgRow?.system_prompt?.trim() || DEFAULT_ESTRUTURADOR_SYSTEM,
    user_template: cfgRow?.user_template?.trim() || DEFAULT_ESTRUTURADOR_USER,
  }

  const systemVars = buildSystemVars(carga.material)
  const systemResolvido = Object.entries(systemVars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, () => v),
    config.system_prompt,
  )
  const systemSha8 = crypto.createHash("sha256").update(systemResolvido).digest("hex").slice(0, 8)

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
  })

  let raw = ""
  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0
  let ultimoErro: string | null = null
  let userPromptFinal = ""

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
      userPromptFinal = JSON.stringify(vars) // auditável; o template é o da config

      const parsed = extractJson(res.raw)
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
