/**
 * Continuação de turno em job (ai_chat_jobs).
 *
 * A rota do chat tem 300 s; passou de ~280 s, ela fecha o stream. Antes
 * a resposta era cortada com "tempo esgotado" e o trabalho morria.
 * Agora, quando o loop para DEPOIS de executar tools (há resultado
 * pendente de resposta), o estado do loop é serializado num job e o
 * cron /api/cron/convertia-continue retoma de onde parou — sem cliente
 * conectado: a resposta vai direto para a linha da mensagem
 * (meta.streaming continua true e o chat repõe por polling, o mesmo
 * caminho do F5).
 *
 * O que NÃO viaja no job: cookie da sessão (a tool de relatório fica
 * de fora — o modelo é avisado) e imagens anexadas (viram marcador).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ChatMessage } from "@/lib/ai/openrouter-chat"
import { resolveConnectors } from "@/lib/ai/connectors/registry"
import { buildImagemConnector } from "@/lib/ai/connectors/imagem"
import { KNOWLEDGE_CONNECTOR_KEY, loadKnowledgeForPrompt } from "./knowledge"
import { buildMemoriaConnector } from "./memories"
import type { ConnectorToolContext } from "@/lib/ai/connectors/types"
import { logger } from "@/lib/logger"
import { CONVERTIA_DEFAULT_MODEL, isUnknownModelError, resolveConvertiaModel } from "@/lib/ai/convertia-models"
import { OpenRouterHttpError } from "@/lib/agents/openrouter-invoke"
import { streamOpenRouterChat } from "@/lib/ai/openrouter-chat"
import { createCancelWatcher } from "./cancel"
import { finalizeTurn } from "./finalize"
import { createTurnPersistence } from "./persist"
import { TurnTelemetry, type RoundStat, type ToolStat } from "./telemetry"
import { createTurnState, runToolLoop, type ToolEntry, type TurnState } from "./tool-loop"
import type { PendingConfirmation, TurnSource } from "./types"

const log = logger.child("ConvertiaContinuation")

export const CONTINUATION_VERSION = 1
/** Job "running" há mais que isto é função morta — volta pra fila. */
const STUCK_MS = 6 * 60_000
const MAX_ATTEMPTS = 3
const MAX_PAYLOAD_BYTES = 1_500_000

export interface ContinuationPayload {
  version: typeof CONTINUATION_VERSION
  conversation_id: string
  message_id: string
  user_id: string
  org_id: string
  store_id: string | null
  workspace: "operacional" | "comercial"
  model: string
  requested_model: string
  cheap_model: string | null
  deep: boolean
  reasoning_supported: boolean
  connectors: string[]
  skills: string[]
  /** Advisors ligados no composer (caminhos das notas). */
  advisors?: string[]
  messages: ChatMessage[]
  round: number
  max_rounds: number
  state: { progress: string[]; sources: TurnSource[]; pendingConfirmation: PendingConfirmation | null }
  telemetry: { rounds: RoundStat[]; tools: ToolStat[]; started_at: number }
  extra_cost_cents: number
}

/** Imagens anexadas não cabem no job — viram marcador de texto. */
export function stripImagesForJob(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "user" || typeof m.content === "string") return m
    const text = m.content
      .map((p) => (p.type === "text" ? p.text : "[imagem anexada — indisponível na continuação]"))
      .join("\n")
    return { role: "user", content: text }
  })
}

export async function enqueueContinuation(
  admin: SupabaseClient,
  payload: ContinuationPayload,
): Promise<string | null> {
  const serialized = JSON.stringify(payload)
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    log.warn("payload de continuação grande demais", { bytes: serialized.length })
    return null
  }
  const { data, error } = await admin
    .from("ai_chat_jobs")
    .insert({
      conversation_id: payload.conversation_id,
      message_id: payload.message_id,
      user_id: payload.user_id,
      org_id: payload.org_id,
      status: "queued",
      payload,
    })
    .select("id")
    .single()
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      log.warn("ai_chat_jobs ausente — aplique a migration 20261114")
      return null
    }
    throw error
  }
  return data?.id ?? null
}

interface JobRow {
  id: string
  payload: ContinuationPayload
  attempts: number
}

/** Claim atômico: só quem virar a linha de queued→running executa. */
async function claimNextJob(admin: SupabaseClient): Promise<JobRow | null> {
  // 1) ressuscita running preso (função morta)
  await admin
    .from("ai_chat_jobs")
    .update({ status: "queued", last_error: "retomado: execução anterior não terminou" })
    .eq("status", "running")
    .lt("claimed_at", new Date(Date.now() - STUCK_MS).toISOString())
    .lt("attempts", MAX_ATTEMPTS)

  const { data: candidates } = await admin
    .from("ai_chat_jobs")
    .select("id, attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(5)
  for (const c of candidates ?? []) {
    if (c.attempts >= MAX_ATTEMPTS) {
      await admin
        .from("ai_chat_jobs")
        .update({ status: "failed", last_error: "tentativas esgotadas", finished_at: new Date().toISOString() })
        .eq("id", c.id)
      continue
    }
    const { data: claimed } = await admin
      .from("ai_chat_jobs")
      .update({ status: "running", claimed_at: new Date().toISOString(), attempts: c.attempts + 1 })
      .eq("id", c.id)
      .eq("status", "queued")
      .select("id, payload, attempts")
      .maybeSingle()
    if (claimed) return claimed as JobRow
  }
  return null
}

/** Roda UM job até o fim (ou até o orçamento, re-enfileirando). */
async function runJob(admin: SupabaseClient, job: JobRow, budgetMs: number): Promise<void> {
  const p = job.payload
  if (p.version !== CONTINUATION_VERSION) throw new Error(`versão de payload desconhecida: ${p.version}`)
  const startedAt = Date.now()

  const imageCost = { cents: p.extra_cost_cents ?? 0, tokensInput: 0, tokensOutput: 0 }
  const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://admin.convertfy.com.br").replace(/\/+$/, "")
  const connectors = await resolveConnectors({ admin, orgId: p.org_id, storeId: p.store_id, enabled: p.connectors })
  // Os mesmos conectores internos da rota (o modelo já os chamou no
  // histórico — sem eles, "Tool desconhecida" no meio da continuação).
  const knowledge = await loadKnowledgeForPrompt(admin, p.org_id, p.advisors ?? [], {
    enabled: p.connectors.includes(KNOWLEDGE_CONNECTOR_KEY) || (p.advisors ?? []).length > 0,
  })
  if (knowledge.connector) connectors.push(knowledge.connector)
  connectors.push(buildMemoriaConnector({ conversationId: p.conversation_id, messageId: p.message_id }))
  connectors.push(
    buildImagemConnector({
      origin: /^https?:\/\//.test(origin) ? origin : `https://${origin}`,
      onCost: (cents, tIn, tOut) => {
        imageCost.cents += cents
        imageCost.tokensInput += tIn
        imageCost.tokensOutput += tOut
      },
    }),
  )
  const toolIndex = new Map<string, ToolEntry>()
  for (const c of connectors) {
    for (const t of c.tools) toolIndex.set(t.def.function.name, { tool: t, connectorKey: c.key, connectorName: c.name })
  }
  const toolDefs = [...toolIndex.values()].map((e) => e.tool.def)

  // Tool que só existe com cookie (relatório) some no job: o modelo é avisado.
  const messages = p.messages
  messages.push({
    role: "user",
    content:
      "[sistema] O turno anterior estourou o tempo e está sendo continuado em segundo plano. Continue de onde parou com os resultados acima. A ferramenta gerar_relatorio_loja não está disponível nesta continuação.",
  })

  const state: TurnState = createTurnState({
    progress: p.state.progress,
    sources: p.state.sources,
    pendingConfirmation: p.state.pendingConfirmation,
  })
  const telemetry = new TurnTelemetry(Date.now, {
    rounds: p.telemetry.rounds,
    tools: p.telemetry.tools,
    startedAt: p.telemetry.started_at,
  })
  const baseMeta = () => ({
    model: p.model,
    skills: p.skills,
    ...(p.deep ? { deep: true } : {}),
    started_at: new Date(p.telemetry.started_at).toISOString(),
    continuation: { job_id: job.id, status: "running" },
  })
  const persistence = createTurnPersistence({ admin, messageId: p.message_id, state, baseMeta })
  const cancel = createCancelWatcher({ admin, messageId: p.message_id })
  const toolCtx: ConnectorToolContext = {
    admin,
    orgId: p.org_id,
    userId: p.user_id,
    storeId: p.store_id,
    workspace: p.workspace,
  }

  let model = p.model
  const result = await runToolLoop({
    model,
    cheapModel: p.cheap_model,
    reasoningSupported: p.reasoning_supported,
    deep: p.deep,
    messages,
    tools: toolDefs,
    toolIndex,
    toolCtx,
    maxRounds: p.max_rounds,
    startRound: p.round,
    budget: { startedAt, totalMs: budgetMs, minRoundMs: 20_000 },
    guard: { wantsAnalysis: false, wantsAction: false },
    callModel: streamOpenRouterChat,
    resolveUnknownModel: (err) =>
      err instanceof OpenRouterHttpError && isUnknownModelError(err.status, err.snippet) && model !== CONVERTIA_DEFAULT_MODEL
        ? ((model = CONVERTIA_DEFAULT_MODEL),
          { model, notice: `_(modelo indisponível — respondendo com ${resolveConvertiaModel(model).name})_\n\n` })
        : null,
    emit: () => {},
    persistPartial: persistence.persistPartial,
    isCancelled: cancel.isCancelled,
    cancelSignal: cancel.signal,
    state,
    telemetry,
  })
  cancel.stop()

  await finalizeTurn({
    admin,
    persistence,
    messageId: p.message_id,
    conversationId: p.conversation_id,
    userId: p.user_id,
    orgId: p.org_id,
    storeId: p.store_id,
    state,
    telemetry,
    result,
    baseMeta: () => ({ model: result.model, skills: p.skills, ...(p.deep ? { deep: true } : {}) }),
    extraCostCents: imageCost.cents,
    extraCostCentsNew: imageCost.cents - (p.extra_cost_cents ?? 0),
    extraTokens: { input: imageCost.tokensInput, output: imageCost.tokensOutput },
    connectors: p.connectors,
    continuation: () => ({
      ...p,
      model: result.model,
      messages: stripImagesForJob(messages),
      round: result.nextRound,
      state: { progress: state.progress, sources: state.sources, pendingConfirmation: state.pendingConfirmation },
      telemetry: { rounds: telemetry.rounds, tools: telemetry.tools, started_at: p.telemetry.started_at },
      extra_cost_cents: imageCost.cents,
    }),
    scheduleSummary: true,
  })
}

export async function runContinuationJobs(
  admin: SupabaseClient,
  opts: { budgetMs: number },
): Promise<{ processed: number; failed: number }> {
  const started = Date.now()
  let processed = 0
  let failed = 0
  for (;;) {
    const remaining = opts.budgetMs - (Date.now() - started)
    if (remaining < 60_000) break
    const job = await claimNextJob(admin)
    if (!job) break
    try {
      await runJob(admin, job, Math.min(remaining - 15_000, 240_000))
      await admin
        .from("ai_chat_jobs")
        .update({ status: "done", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", job.id)
      processed += 1
    } catch (err) {
      failed += 1
      const msg = err instanceof Error ? err.message : String(err)
      log.error("job de continuação falhou", { job: job.id, error: msg })
      const final = job.attempts >= MAX_ATTEMPTS
      await admin
        .from("ai_chat_jobs")
        .update({
          status: final ? "failed" : "queued",
          last_error: msg.slice(0, 500),
          ...(final ? { finished_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
      if (final) {
        // Fecha a mensagem: o chat não pode ficar "gerando" para sempre.
        await admin
          .rpc("ai_chat_message_progress", {
            p_id: job.payload.message_id,
            p_content: null,
            p_meta_patch: {
              streaming: false,
              status: "error",
              error: `continuação falhou: ${msg.slice(0, 200)}`,
              continuation: { job_id: job.id, status: "failed", reason: msg.slice(0, 200) },
            },
          })
          .then(() => undefined, () => undefined)
      }
    }
  }
  return { processed, failed }
}
