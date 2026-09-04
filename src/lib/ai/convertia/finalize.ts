/**
 * Fechamento de um turno da ConvertIA — comum à rota (SSE) e ao job de
 * continuação: grava a resposta final e o meta consolidado, apaga o
 * placeholder vazio, enfileira a continuação quando o orçamento acabou
 * com trabalho pendente, registra telemetria em ai_usage_events e
 * dispara o sumário rolante da conversa. Nada aqui lança: o stream/job
 * sempre termina limpo.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { logger } from "@/lib/logger"
import { enqueueContinuation, type ContinuationPayload } from "./continuation"
import type { TurnPersistence } from "./persist"
import type { TurnState } from "./tool-loop"
import type { TurnTelemetry } from "./telemetry"
import type { AssistantMessageMeta, TurnStatus } from "./types"
import type { ToolLoopResult } from "./tool-loop"
import { scheduleConversationSummary } from "./summary"

const log = logger.child("ConvertiaFinalize")

export interface FinalizeInput {
  admin: SupabaseClient
  persistence: TurnPersistence
  messageId: string | null
  conversationId: string
  userId: string
  orgId: string
  storeId: string | null
  state: TurnState
  telemetry: TurnTelemetry
  result: ToolLoopResult
  baseMeta: () => Record<string, unknown>
  /** Custo fora do stream do chat (geração de imagem), em centavos USD. */
  extraCostCents: number
  extraTokens: { input: number; output: number }
  connectors: string[]
  /** Dados para montar o job de continuação quando `result.resumable`. */
  continuation: (() => ContinuationPayload) | null
  /** Só a rota: conversa a resumir quando o histórico passa da janela. */
  scheduleSummary?: boolean
}

export interface FinalizeOutput {
  messageId: string | null
  meta: AssistantMessageMeta
  content: string
  continuationJobId: string | null
}

export async function finalizeTurn(input: FinalizeInput): Promise<FinalizeOutput> {
  const { result, state, telemetry } = input
  const usage = telemetry.summary(input.extraCostCents / 100)
  let continuationJobId: string | null = null
  let status: TurnStatus = result.status

  // ── Continuação em job ─────────────────────────────────────────
  if (result.resumable && input.continuation && input.messageId) {
    try {
      continuationJobId = await enqueueContinuation(input.admin, input.continuation())
    } catch (err) {
      log.warn("enfileirar continuação falhou", { error: err instanceof Error ? err.message : String(err) })
    }
    if (!continuationJobId) {
      // sem tabela/erro: fecha como orçamento esgotado com o que houver
      status = "budget"
    }
  }

  const continuing = Boolean(continuationJobId)
  // Continuando: a bolha fica em "resposta em andamento" (a narração já
  // está em meta.progress — repeti-la no content duplicaria na tela).
  const content = continuing
    ? result.fullText
    : result.fullText || (state.sources.length > 0 || state.progress.length > 0 ? "(sem resposta)" : "")

  const meta: AssistantMessageMeta = {
    ...(input.baseMeta() as Pick<AssistantMessageMeta, "model" | "skills" | "deep">),
    model: result.model,
    streaming: continuing,
    sources: state.sources,
    progress: state.progress,
    usage,
    status,
    ...(result.errorMessage ? { error: result.errorMessage } : {}),
    ...(state.pendingConfirmation ? { pending_confirmation: state.pendingConfirmation } : {}),
    ...(result.modelFallback ? { model_fallback: result.modelFallback } : {}),
    continuation: continuationJobId
      ? { job_id: continuationJobId, status: "queued", reason: "orçamento de tempo do turno esgotado" }
      : null,
  }

  let messageId = input.messageId
  try {
    // A última gravação parcial tem de terminar ANTES do update final.
    await input.persistence.flush()
    if (messageId) {
      if (content || state.sources.length > 0 || continuing) {
        await input.persistence.merge({ ...meta, updated_at: new Date().toISOString() }, content)
      } else {
        // Nada gerado — o placeholder vazio não vira lixo no histórico.
        await input.admin.from("ai_chat_messages").delete().eq("id", messageId)
        messageId = null
      }
    } else if (content || state.sources.length > 0) {
      const { data } = await input.admin
        .from("ai_chat_messages")
        .insert({ conversation_id: input.conversationId, role: "assistant", content, meta })
        .select("id")
        .single()
      messageId = data?.id ?? null
    }
    await input.admin
      .from("ai_chat_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", input.conversationId)
  } catch (err) {
    log.warn("persistência final falhou", { error: err instanceof Error ? err.message : String(err) })
  }

  void recordAiUsage({
    feature: "convertia",
    model: result.model,
    provider: "openrouter",
    status: status === "error" ? "error" : "success",
    tokensInput: usage.tokens_input + input.extraTokens.input,
    tokensOutput: usage.tokens_output + input.extraTokens.output,
    durationMs: usage.duration_ms,
    userId: input.userId,
    orgId: input.orgId,
    storeId: input.storeId,
    // custo REAL (OpenRouter + imagem) em centavos — é o que o
    // guard-rail diário soma
    costCents: usage.cost_usd > 0 ? usage.cost_usd * 100 : null,
    context: {
      conversation_id: input.conversationId,
      message_id: messageId,
      connectors: input.connectors,
      sources: state.sources.length,
      status,
      rounds: usage.rounds,
      tools: usage.tools,
      tokens_cached: usage.tokens_cached,
      tokens_cache_write: usage.tokens_cache_write,
      cache_hit_ratio: usage.cache_hit_ratio,
      ...(input.extraCostCents > 0 ? { image_cost_cents: input.extraCostCents } : {}),
      ...(continuationJobId ? { continuation_job_id: continuationJobId } : {}),
    },
    errorMessage: result.errorMessage,
  })

  if (input.scheduleSummary && !continuing) {
    scheduleConversationSummary(input.admin, input.conversationId)
  }

  return { messageId, meta, content, continuationJobId }
}
