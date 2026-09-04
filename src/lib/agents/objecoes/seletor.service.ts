/**
 * Seletor — orquestração (I/O).
 *
 * Agente C do plano das objeções. Roda POR EMAIL, a cada geração, ANTES do
 * Estruturador — como pré-passo SEQUENCIAL (welcome-1, depois welcome-2…)
 * porque a fase 1 roda 4 emails em paralelo e `ja_atacadas` precisa da
 * ordem. `ensureObjectionTargets` é o ÚNICO caminho: reaproveita o alvo
 * vigente quando o catálogo não mudou (mesmo sha8) e só chama o LLM para o
 * que falta. Nunca lança.
 *
 * Gate `email_generation_settings.seletor_mode`: off = nada roda; shadow =
 * roda, grava alvo (`consumido=false`) e run — ninguém consome; on = idem
 * com `consumido=true` (fase 4 desce o alvo para Estruturador/Curador/copy).
 */

import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { loadTopProducts } from "../top-products"
import { renderTopProducts } from "../architect/store-context"
import {
  extractJson,
  invokeAgent,
  loadActiveAgentConfig,
  type AgentInvokeConfig,
} from "../architect/llm-invoke"
import {
  finishGenerationRun,
  logGenerationRun,
  resolveCostCents,
  startGenerationRun,
} from "../callbacks/telemetry.callback"
import { buildSegmentedPrompt, type InputSummaryItem } from "../shared/prompt-provenance"
import { renderImageTemplate } from "../image/template-renderer"
import { catalogoSha8 } from "./catalogador.service"
import { normalizarCatalogo } from "./catalogo-regras"
import { parseIntentContract, renderIntentContract, type IntentContract } from "./intent-contract"
import {
  DEFAULT_SELETOR_SYSTEM,
  DEFAULT_SELETOR_USER,
  SELETOR_ORIGINS,
  renderCatalogoParaSeletor,
  renderJaAtacadas,
  renderOfertaEProdutos,
} from "./seletor-prompt"
import {
  alvoSintetico,
  candidatasElegiveis,
  jaAtacadasDe,
  normalizarAlvo,
  validarAlvo,
} from "./seletor-regras"
import type { AlvoDoEmail, CatalogoDeObjecoes, JaAtacada } from "./vocabulario"

const log = logger.child("Seletor")

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
const MAX_ATTEMPTS = 2

export type SeletorMode = "off" | "shadow" | "on"

export interface EmailRef {
  flowType: string
  emailNumber: number
}

export interface ObjectionTargetRow {
  id: string
  store_id: string
  flow_type: string
  email_number: number
  catalog_sha8: string | null
  target: AlvoDoEmail
  consumido: boolean
  run_id: string | null
  is_current: boolean
  created_at: string
}

/** Modo do Seletor da org da loja. Fail-open: qualquer falha = 'off'. */
export async function loadSeletorMode(storeId: string): Promise<SeletorMode> {
  try {
    const admin = createAdminClient()
    const { data: store } = await admin.from("client_stores").select("org_id").eq("id", storeId).maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return "off"
    const { data, error } = await admin
      .from("email_generation_settings")
      .select("seletor_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) return "off"
    const m = (data as { seletor_mode?: string } | null)?.seletor_mode
    return m === "shadow" || m === "on" ? m : "off"
  } catch {
    return "off"
  }
}

/** Alvos vigentes (`is_current`) de um flow da loja, ordenados por email. */
export async function loadCurrentTargets(storeId: string, flowType: string): Promise<ObjectionTargetRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("store_email_objection_targets")
    .select("*")
    .eq("store_id", storeId)
    .eq("flow_type", flowType)
    .eq("is_current", true)
    .order("email_number", { ascending: true })
  if (error) {
    log.warn("seletor.targets_load_failed", { storeId, flowType, error: error.message })
    return []
  }
  return (data ?? []) as ObjectionTargetRow[]
}

/** Alvo vigente de UM email (fase 4 lê daqui). */
export async function loadObjectionTarget(
  storeId: string,
  flowType: string,
  emailNumber: number,
): Promise<ObjectionTargetRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("store_email_objection_targets")
    .select("*")
    .eq("store_id", storeId)
    .eq("flow_type", flowType)
    .eq("email_number", emailNumber)
    .eq("is_current", true)
    .maybeSingle()
  return (data as ObjectionTargetRow | null) ?? null
}

interface IntentRow {
  email_number: number
  body_md: string
  frontmatter: Record<string, unknown>
}

async function loadIntents(flowType: string): Promise<Map<number, IntentRow>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_intents")
    .select("email_number, body_md, frontmatter")
    .eq("flow_type", flowType)
    .eq("kind", "intencao")
    .eq("is_active", true)
    .not("email_number", "is", null)
  const out = new Map<number, IntentRow>()
  for (const r of (data ?? []) as IntentRow[]) out.set(r.email_number, r)
  return out
}

async function resolveEmailRef(
  storeId: string,
  flowType: string,
  emailNumber: number,
): Promise<{ flowId?: string; emailId?: string }> {
  try {
    const admin = createAdminClient()
    const { data: flow } = await admin
      .from("email_flows")
      .select("id")
      .eq("store_id", storeId)
      .eq("flow_type", flowType)
      .limit(1)
      .maybeSingle()
    const flowId = (flow as { id?: string } | null)?.id
    if (!flowId) return {}
    const { data: email } = await admin
      .from("email_flow_emails")
      .select("id")
      .eq("flow_id", flowId)
      .eq("number", emailNumber)
      .limit(1)
      .maybeSingle()
    return { flowId, emailId: (email as { id?: string } | null)?.id }
  } catch {
    return {}
  }
}

async function persistTarget(p: {
  storeId: string
  flowType: string
  emailNumber: number
  catalogSha8: string
  target: AlvoDoEmail
  consumido: boolean
  runId: string | null
}): Promise<ObjectionTargetRow | null> {
  const admin = createAdminClient()
  await admin
    .from("store_email_objection_targets")
    .update({ is_current: false })
    .eq("store_id", p.storeId)
    .eq("flow_type", p.flowType)
    .eq("email_number", p.emailNumber)
    .eq("is_current", true)
  const { data, error } = await admin
    .from("store_email_objection_targets")
    .insert({
      store_id: p.storeId,
      flow_type: p.flowType,
      email_number: p.emailNumber,
      catalog_sha8: p.catalogSha8,
      target: p.target,
      consumido: p.consumido,
      run_id: p.runId,
      is_current: true,
    })
    .select("*")
    .maybeSingle()
  if (error) {
    log.warn("seletor.target_persist_failed", { storeId: p.storeId, flowType: p.flowType, emailNumber: p.emailNumber, error: error.message })
    return null
  }
  return (data as ObjectionTargetRow | null) ?? null
}

export interface RunSeletorInput {
  storeId: string
  flowType: string
  emailNumber: number
  batchId: string
  triggeredBy?: string
  mode: Exclude<SeletorMode, "off">
  brandName: string
  catalogo: CatalogoDeObjecoes
  catalogSha8: string
  contrato: IntentContract
  intencaoBody: string
  jaAtacadas: JaAtacada[]
  topProductsTexto: string
}

/** Um call do Seletor para um email. Persiste alvo (válido ou sintético) e a run. Nunca lança. */
export async function runSeletor(input: RunSeletorInput): Promise<ObjectionTargetRow | null> {
  const t0 = Date.now()
  const ref = await resolveEmailRef(input.storeId, input.flowType, input.emailNumber)
  const cfgRow = await loadActiveAgentConfig("seletor")
  const config: AgentInvokeConfig = {
    model: cfgRow?.model || DEFAULT_MODEL,
    temperature: cfgRow?.temperature ?? 0.2,
    max_tokens: cfgRow?.max_tokens ?? 4096,
    system_prompt: cfgRow?.system_prompt?.trim() || DEFAULT_SELETOR_SYSTEM,
    user_template: cfgRow?.user_template?.trim() || DEFAULT_SELETOR_USER,
  }
  const candidatas = candidatasElegiveis(input.catalogo, input.contrato, input.flowType, input.jaAtacadas)
  const baseVars: Record<string, string> = {
    brand_name: input.brandName,
    flow_type: input.flowType,
    email_number: String(input.emailNumber),
    contrato_do_toque: renderIntentContract(input.contrato),
    intencao_do_toque: input.intencaoBody.trim() || "(sem intenção cadastrada)",
    catalogo_da_loja: renderCatalogoParaSeletor(input.catalogo, input.flowType),
    ja_atacadas: renderJaAtacadas(input.jaAtacadas),
    oferta_e_produtos: renderOfertaEProdutos(input.catalogo, input.topProductsTexto),
    correcoes: "(nenhuma — primeira tentativa)",
  }
  const inputSummary: InputSummaryItem[] = [
    { rotulo: "Loja", cls: "loja", valor: input.brandName },
    { rotulo: "Email", cls: "sistema", valor: `${input.flowType} #${input.emailNumber} · modo ${input.mode}` },
    { rotulo: "Contrato do toque (vault)", cls: "vault", valor: `${input.contrato.modo} · n ${input.contrato.n_objecoes.join("–")} · riscos ${input.contrato.riscos_elegiveis.join(", ") || "—"}` },
    { rotulo: "Catálogo da loja", cls: "loja", valor: `${input.catalogo.objecoes.length} objeções · ${candidatas.length} candidata(s) elegível(is) por código · sha8 ${input.catalogSha8}` },
    { rotulo: "Já atacadas (irmãos)", cls: "upstream", valor: input.jaAtacadas.length ? input.jaAtacadas.map((j) => `${j.id}@#${j.email_number}/${j.profundidade}`).join(", ") : "(nenhuma)" },
  ]
  const segBase = buildSegmentedPrompt(config.user_template, baseVars, SELETOR_ORIGINS, { parte: "user" })
  const runId = await startGenerationRun({
    storeId: input.storeId,
    flowId: ref.flowId,
    emailId: ref.emailId,
    batchId: input.batchId,
    triggeredBy: input.triggeredBy,
    agent: "seletor",
    agentConfigId: cfgRow?.id,
    model: config.model,
    inputVars: {
      modo_seletor: input.mode,
      shadow: input.mode !== "on",
      contrato: input.contrato,
      candidatas_elegiveis: candidatas.map((c) => c.id),
      ja_atacadas: input.jaAtacadas,
      catalog_sha8: input.catalogSha8,
    },
    renderedPrompt: segBase.segments ? segBase.prompt : renderImageTemplate(config.user_template, baseVars),
    promptSegments: segBase.segments,
    inputSummary,
  })

  let tokensIn = 0
  let tokensOut = 0
  let costUsd = 0
  let raw = ""
  let erros: string[] = []
  let promptFinal = ""
  let segmentsFinal = segBase.segments
  let avisosFinais: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const vars = erros.length
      ? { ...baseVars, correcoes: `SEU ALVO ANTERIOR FOI REPROVADO PELO VALIDADOR. Corrija TODOS os pontos:\n${erros.map((e) => `- ${e}`).join("\n")}` }
      : baseVars
    try {
      const res = await invokeAgent(config, vars)
      raw = res.raw
      tokensIn += res.tokensInput
      tokensOut += res.tokensOutput
      costUsd += res.costUsd
      const seg = buildSegmentedPrompt(config.user_template, vars, SELETOR_ORIGINS, { parte: "user" })
      promptFinal = seg.segments ? seg.prompt : renderImageTemplate(config.user_template, vars)
      segmentsFinal = seg.segments
      let parsed: unknown
      try {
        parsed = JSON.parse(extractJson(res.raw))
      } catch {
        throw new Error(res.tokensOutput >= config.max_tokens ? `resposta truncada no teto de ${config.max_tokens} tokens` : "resposta não é JSON válido")
      }
      const { alvo, avisos } = normalizarAlvo(parsed, input.contrato, input.catalogo, input.jaAtacadas)
      avisosFinais = avisos
      const reprovacoes = validarAlvo(alvo, input.contrato, input.catalogo, input.jaAtacadas, input.flowType)
      if (reprovacoes.length) throw new ValidacaoError(reprovacoes)

      const row = await persistTarget({
        storeId: input.storeId,
        flowType: input.flowType,
        emailNumber: input.emailNumber,
        catalogSha8: input.catalogSha8,
        target: alvo,
        consumido: input.mode === "on",
        runId,
      })
      await finishGenerationRun(runId, {
        storeId: input.storeId,
        flowId: ref.flowId,
        emailId: ref.emailId,
        batchId: input.batchId,
        triggeredBy: input.triggeredBy,
        agent: "seletor",
        agentConfigId: cfgRow?.id,
        status: "success",
        model: config.model,
        renderedPrompt: promptFinal,
        promptSegments: segmentsFinal,
        inputSummary,
        rawOutput: raw.slice(0, 12000),
        parsedOutput: {
          ...alvo,
          _seletor: {
            shadow: input.mode !== "on",
            consumido: input.mode === "on",
            retry_count: attempt - 1,
            erros_da_tentativa_anterior: erros,
            avisos,
            candidatas_elegiveis: candidatas.map((c) => c.id),
            lacuna_com_candidatas: Boolean(alvo.lacuna) && candidatas.length > 0,
            catalog_sha8: input.catalogSha8,
            target_id: row?.id ?? null,
          },
        },
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        costCents: resolveCostCents({ model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd }),
        durationMs: Date.now() - t0,
        retryCount: attempt - 1,
      })
      log.info("seletor.ok", {
        storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber, modo: alvo.modo,
        alvos: alvo.alvos.map((a) => `${a.id}/${a.aliviador_pedido}/${a.profundidade_de_prova}`), lacuna: alvo.lacuna?.motivo ?? null, attempt,
      })
      return row
    } catch (err) {
      erros = err instanceof ValidacaoError ? err.erros : [err instanceof Error ? err.message : String(err)]
      log.warn("seletor.attempt_failed", { storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber, attempt, erros })
    }
  }

  // 2 falhas → alvo sintético com lacuna (nunca alvo inventado) + run error.
  const sintetico = alvoSintetico(input.contrato, "seletor_falhou", erros.join("; ").slice(0, 600), input.jaAtacadas)
  const row = await persistTarget({
    storeId: input.storeId, flowType: input.flowType, emailNumber: input.emailNumber,
    catalogSha8: input.catalogSha8, target: sintetico, consumido: input.mode === "on", runId,
  })
  await finishGenerationRun(runId, {
    storeId: input.storeId, flowId: ref.flowId, emailId: ref.emailId, batchId: input.batchId, triggeredBy: input.triggeredBy,
    agent: "seletor", agentConfigId: cfgRow?.id, status: "error", model: config.model,
    errorMessage: erros.join("; ").slice(0, 2000) || "seletor_failed",
    renderedPrompt: promptFinal || undefined, promptSegments: segmentsFinal, inputSummary,
    rawOutput: raw.slice(0, 12000) || undefined,
    parsedOutput: { ...sintetico, _seletor: { shadow: input.mode !== "on", erros, avisos: avisosFinais, candidatas_elegiveis: candidatas.map((c) => c.id), target_id: row?.id ?? null } },
    tokensInput: tokensIn, tokensOutput: tokensOut,
    costCents: resolveCostCents({ model: config.model, tokensInput: tokensIn, tokensOutput: tokensOut, costUsd }),
    durationMs: Date.now() - t0, retryCount: MAX_ATTEMPTS - 1,
  })
  return row
}

class ValidacaoError extends Error {
  constructor(public readonly erros: string[]) {
    super(`validação reprovou: ${erros.length} erro(s)`)
  }
}

export interface EnsureTargetsInput {
  storeId: string
  emails: EmailRef[]
  triggeredBy?: string
  batchId?: string
  /** Refaz o alvo mesmo com catálogo igual (regeneração pedida). */
  force?: boolean
  /** Grava run `skipped` para email sem contrato/catálogo (1ª passagem; os ticks seguintes passam false). */
  logSkipped?: boolean
}

export interface EnsureTargetsResult {
  mode: SeletorMode
  targets: ObjectionTargetRow[]
  ran: number
  reused: number
  skipped: number
  error?: string
}

/**
 * O único caminho para ter alvos antes da fase 1. Sequencial por flow e por
 * `email_number` (ja_atacadas depende da ordem). Nunca lança.
 */
export async function ensureObjectionTargets(input: EnsureTargetsInput): Promise<EnsureTargetsResult> {
  const result: EnsureTargetsResult = { mode: "off", targets: [], ran: 0, reused: 0, skipped: 0 }
  try {
    const mode = await loadSeletorMode(input.storeId)
    result.mode = mode
    if (mode === "off" || input.emails.length === 0) return result

    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("store_name, store_url, objection_catalog")
      .eq("id", input.storeId)
      .maybeSingle()
    const s = (store ?? {}) as { store_name?: string | null; store_url?: string | null; objection_catalog?: unknown }
    const batchId = input.batchId ?? crypto.randomUUID()

    const porFlow = new Map<string, number[]>()
    for (const e of input.emails) porFlow.set(e.flowType, [...(porFlow.get(e.flowType) ?? []), e.emailNumber])

    const skip = async (flowType: string, emailNumber: number, reason: string) => {
      result.skipped++
      if (!input.logSkipped) return
      const ref = await resolveEmailRef(input.storeId, flowType, emailNumber)
      await logGenerationRun({
        storeId: input.storeId, flowId: ref.flowId, emailId: ref.emailId, batchId, triggeredBy: input.triggeredBy,
        agent: "seletor", status: "skipped", model: "pulado",
        inputSummary: [{ rotulo: "Motivo", cls: "sistema", valor: reason }],
        parsedOutput: { skip_reason: reason, modo_seletor: mode },
        costCents: 0, durationMs: 0,
      }).catch(() => {})
    }

    if (!s.objection_catalog || typeof s.objection_catalog !== "object") {
      for (const [flowType, nums] of porFlow) for (const n of nums) await skip(flowType, n, "sem_catalogo")
      log.info("seletor.sem_catalogo", { storeId: input.storeId, emails: input.emails.length })
      return result
    }
    const catalogo = normalizarCatalogo(s.objection_catalog)
    const sha8 = catalogoSha8(s.objection_catalog)
    const brandName = s.store_name || "Loja"
    const topProductsTexto = renderTopProducts(await loadTopProducts(admin, input.storeId, s.store_url ?? null))

    for (const [flowType, nums] of porFlow) {
      const [intents, vigentes] = await Promise.all([loadIntents(flowType), loadCurrentTargets(input.storeId, flowType)])
      const porNumero = new Map(vigentes.map((t) => [t.email_number, t]))
      for (const n of Array.from(new Set(nums)).sort((a, b) => a - b)) {
        const existente = porNumero.get(n)
        if (existente && existente.catalog_sha8 === sha8 && !input.force) {
          result.reused++
          result.targets.push(existente)
          continue
        }
        const intent = intents.get(n)
        const contrato = intent ? parseIntentContract(intent.frontmatter) : null
        if (!contrato) {
          await skip(flowType, n, intent ? "sem_contrato" : "sem_intencao")
          continue
        }
        const anteriores = Array.from(porNumero.values()).filter((t) => t.email_number < n)
        const jaAtacadas = jaAtacadasDe(anteriores.map((t) => ({ email_number: t.email_number, target: t.target })))
        const row = await runSeletor({
          storeId: input.storeId, flowType, emailNumber: n, batchId, triggeredBy: input.triggeredBy, mode,
          brandName, catalogo, catalogSha8: sha8, contrato, intencaoBody: intent?.body_md ?? "", jaAtacadas, topProductsTexto,
        })
        result.ran++
        if (row) {
          porNumero.set(n, row)
          result.targets.push(row)
        }
      }
    }
    log.info("seletor.ensure_done", { storeId: input.storeId, mode, ran: result.ran, reused: result.reused, skipped: result.skipped })
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    log.warn("seletor.ensure_failed", { storeId: input.storeId, error: result.error })
    return result
  }
}
