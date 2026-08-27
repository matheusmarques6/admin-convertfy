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
 * (slugs servidos, vault_commit_sha, capacidade, irmãs, modo),
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
  type EstruturaIrma,
} from "./estruturador-validator"
import {
  aplicaveis,
  montarBlocoOrientacoes,
  type Orientacao,
} from "./orientacoes"
import {
  montarBlocoRevisao,
  type RevisaoHumana,
} from "../shared/revisao-humana"

const log = logger.child("Estruturador")

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
const MAX_ATTEMPTS = 2

export type EstruturadorMode = "off" | "shadow" | "on"

// ── Proveniência (plano telemetria 26/08): origem de cada var do prompt ──

const SYSTEM_ORIGINS: Record<string, SegmentOrigin> = {
  intencao_flow: { cls: "vault", rotulo: "Intenção do flow — email_intents (_flow)" },
  progressao: { cls: "vault", rotulo: "Progressão observada — email_intents (progressao)" },
  referencias: { cls: "vault", rotulo: "Referências de estrutura — email_structure_refs" },
  aprendizados: { cls: "vault", rotulo: "Aprendizados — email_learnings" },
}

export const USER_ORIGINS: Record<string, SegmentOrigin> = {
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
  estruturas_dos_outros_emails: {
    cls: "sistema",
    rotulo: "Anti-repetição — estruturas vigentes dos outros emails do flow",
  },
  // Diretriz viva do COO (migration 20261086) — NÃO é vault: o vault é o
  // corpus curado, isto é instrução direta e de efeito imediato. Sem esta
  // linha o guard de recomposição derruba os segmentos da run inteira.
  orientacao_coo: { cls: "curadoria", rotulo: "Orientação do COO — estruturador_orientacoes" },
  // Correção humana DESTE email (reordenou/removeu na tela e explicou).
  // Curadoria, não dado da loja: quem escreveu foi uma pessoa revisando.
  revisao_humana: {
    cls: "curadoria",
    rotulo: "Revisão humana da estrutura — email_structure_reviews",
  },
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
  /**
   * Revisões humanas de estrutura aplicáveis (migration 20261088), já
   * carregadas pelo caller — o Curador e o Montador recebem as MESMAS,
   * então a query roda uma vez por geração.
   */
  revisoes?: RevisaoHumana[]
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

/**
 * Orientações do COO (migration 20261086).
 *
 * Query própria, e não dentro do `loadMaterial`: aquele devolve `null` em
 * bloco quando não há REFERÊNCIA nenhuma, e a orientação não tem nada a
 * ver com o vault estar completo — ela é justamente o caminho que NÃO
 * passa pelo Obsidian. (O agente só chega aqui com material, porque sem
 * candidata não há estrutura a decidir; a separação é de responsabilidade,
 * não de ordem.)
 *
 * Fail-open: erro aqui devolve lista vazia. O bloco sai com o texto de
 * vazio e a geração segue — perder uma diretriz é ruim, derrubar a
 * estrutura por causa dela é pior.
 */
async function loadOrientacoes(): Promise<Orientacao[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("estruturador_orientacoes")
    .select("escopo, flow_type, email_number, texto")
    .eq("is_active", true)
  if (error) {
    log.warn("estruturador.orientacoes_load_failed", { error: error.message })
    return []
  }
  return (data ?? []) as Orientacao[]
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

/** Sequência (`estrutura[].section`) gravada no parsed_output de uma run. */
export function sequenciaDaRun(parsedOutput: unknown): string[] {
  const estrutura = (parsedOutput as { estrutura?: Array<{ section?: string }> } | null)
    ?.estrutura
  if (!Array.isArray(estrutura)) return []
  return estrutura.map((p) => String(p.section ?? "")).filter(Boolean)
}

/**
 * Última estrutura bem-sucedida DESTE email — informação, nunca regra.
 *
 * Repetir a si mesmo deixou de reprovar (27/08), mas "o agente está estável
 * ou oscilando a cada geração?" é a pergunta que sobra, e respondê-la exigia
 * comparar runs à mão. Vira flag no `_validador`.
 */
async function loadEstruturaVigenteDesteEmail(
  emailId: string | null,
): Promise<string[] | null> {
  if (!emailId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_generation_runs")
    .select("parsed_output")
    .eq("agent", "estruturador")
    .eq("email_id", emailId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const seq = sequenciaDaRun((data as { parsed_output: unknown }).parsed_output)
  return seq.length > 0 ? seq : null
}

/**
 * Estruturas VIGENTES dos OUTROS emails deste flow nesta loja.
 *
 * Era o histórico do PRÓPRIO email (as N últimas runs), e isso punia
 * convergência: a lista de proibidas era feita das melhores respostas do
 * agente, então a 3ª regeneração precisava inventar uma estrutura que ele
 * mesmo considerava pior. Caso real (Innova, welcome #1, 27/08): reprovado
 * duas vezes por propor a mesma sequência da run anterior — bateu o pé, o
 * código descartou, e o fallback foi o outline GENÉRICO, que é a estrutura
 * mais repetida que existe.
 *
 * O problema editorial real é outro e ninguém checava: os emails de um mesmo
 * flow saírem com a mesma composição. É esse que a regra passa a proteger.
 *
 * Só a estrutura ATUAL de cada irmão entra (a run bem-sucedida mais recente
 * de cada um). Acumular o histórico faria a lista crescer até proibir tudo
 * de novo — que é exatamente a armadilha de onde estamos saindo.
 */
async function loadEstruturasDosOutrosEmails(
  flowId: string | null,
  emailId: string | null,
): Promise<EstruturaIrma[]> {
  if (!flowId) return []
  const admin = createAdminClient()

  const { data: irmaos } = await admin
    .from("email_flow_emails")
    .select("id, number, flow:email_flows!inner(flow_type)")
    .eq("flow_id", flowId)
  const outros = ((irmaos ?? []) as unknown as Array<{
    id: string
    number: number
    flow?: { flow_type?: string } | null
  }>).filter((e) => e.id !== emailId)
  if (outros.length === 0) return []

  const { data } = await admin
    .from("email_generation_runs")
    .select("email_id, parsed_output, created_at")
    .eq("agent", "estruturador")
    .eq("status", "success")
    .in("email_id", outros.map((e) => e.id))
    .order("created_at", { ascending: false })

  // A query vem ordenada por data desc: a PRIMEIRA linha de cada email é a
  // vigente. As demais são histórico e ficam de fora.
  const vigentePorEmail = new Map<string, string[]>()
  for (const r of (data ?? []) as Array<{ email_id: string; parsed_output: unknown }>) {
    if (vigentePorEmail.has(r.email_id)) continue
    const seq = sequenciaDaRun(r.parsed_output)
    if (seq.length > 0) vigentePorEmail.set(r.email_id, seq)
  }

  return outros
    .filter((e) => vigentePorEmail.has(e.id))
    .sort((a, b) => a.number - b.number)
    .map((e) => ({
      rotulo: `${e.flow?.flow_type ?? "email"} #${e.number}`,
      seq: vigentePorEmail.get(e.id)!,
    }))
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
  const [intencaoEmail, orientacoes] = await Promise.all([
    loadIntencaoDoEmail(input.flowType, input.emailNumber),
    loadOrientacoes(),
  ])
  if (!intencaoEmail) {
    log.info("estruturador.sem_intencao_do_email", {
      flowType: input.flowType, emailNumber: input.emailNumber,
    })
    return { output: null, runId: null, status: "sem_material" }
  }

  const [capacidade, irmas, minhaAnterior] = await Promise.all([
    loadCapacidade(input.topProductNames.length),
    loadEstruturasDosOutrosEmails(input.flowId ?? null, input.emailId ?? null),
    loadEstruturaVigenteDesteEmail(input.emailId ?? null),
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
  // Com o rótulo do email: saber QUAL irmão ocupa a sequência é o que
  // permite ao agente se afastar com intenção, em vez de embaralhar.
  const irmasTexto = irmas.length
    ? irmas.map((e) => `- ${e.rotulo}: [${e.seq.join(", ")}]`).join("\n")
    : "(nenhum outro email deste flow tem estrutura decidida ainda)"

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
    estruturas_dos_outros_emails: irmasTexto,
    orientacao_coo: montarBlocoOrientacoes(
      aplicaveis(orientacoes, input.flowType, input.emailNumber),
    ),
    revisao_humana: montarBlocoRevisao(input.revisoes ?? [], "estruturador"),
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
    { rotulo: "Estruturas dos outros emails do flow", cls: "sistema", valor: irmasTexto },
    {
      rotulo: "Revisão humana da estrutura",
      cls: "curadoria",
      valor:
        (input.revisoes ?? []).length > 0
          ? `${(input.revisoes ?? []).length} revisão(ões) aplicável(is)`
          : "(nenhuma)",
    },
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
      outros_emails_count: irmas.length,
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
        ? { ...userVars, estruturas_dos_outros_emails: `${userVars.estruturas_dos_outros_emails}\n\nSEU OUTPUT ANTERIOR FOI REPROVADO: ${ultimoErro}` }
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
        sequenciasProibidas: irmas,
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
            outros_emails_count: irmas.length,
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
              // A revisão humana é sinal FORTE, não trava: o agente pode
              // divergir. O que não pode é a divergência passar batida —
              // sem isto, "ele ignorou o que escrevi" só se descobre
              // comparando a sequência à mão, geração a geração.
              revisao_humana: (() => {
                const rev = (input.revisoes ?? []).filter(
                  (r) => r.para_estruturador !== false,
                )
                if (rev.length === 0) return { havia: false, seguida: null }
                // A mais específica manda: é a que fala deste email.
                const alvo =
                  rev.find((r) => r.alcance === "este_email") ?? rev[0]
                const seq = validado.saida!.estrutura.map((p) => p.section)
                return {
                  havia: true,
                  alcance: alvo.alcance,
                  ordem_pedida: alvo.ordem_nova,
                  ordem_entregue: seq,
                  seguida:
                    alvo.ordem_nova.length === seq.length &&
                    alvo.ordem_nova.every((sec, i) => sec === seq[i]),
                }
              })(),
              // Convergência, não erro: mesma estrutura da geração anterior
              // DESTE email. Até 27/08 isto era motivo de reprovação.
              repetiu_geracao_anterior:
                minhaAnterior != null &&
                minhaAnterior.length === validado.saida.estrutura.length &&
                minhaAnterior.every(
                  (sec, i) => sec === validado.saida!.estrutura[i]?.section,
                ),
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
