/**
 * Sumário rolante da conversa (context.summary).
 *
 * O histórico enviado ao modelo é cortado em HISTORY_LIMIT mensagens;
 * conversa longa perdia o começo sem aviso. Depois de cada turno, se a
 * conversa passou da janela e há mensagens novas fora dela, um modelo
 * barato resume o que ficou de fora (incrementalmente: resumo anterior
 * + mensagens que saíram da janela desde então) e grava em
 * `ai_chat_conversations.context.summary`. O próximo turno injeta o
 * resumo no bloco dinâmico do system prompt.
 *
 * Fire-and-forget e SEM SSE: roda depois do `done`, nunca atrasa a
 * resposta. Falha é logada e a conversa segue sem resumo.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { streamOpenRouterChat } from "@/lib/ai/openrouter-chat"
import { recordAiUsage } from "@/lib/services/ai-usage.service"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaSummary")

export const HISTORY_LIMIT = 24
/** Só resume quando há pelo menos isto de mensagens novas fora da janela. */
const MIN_NEW_MESSAGES = 6
export const SUMMARY_MODEL = "moonshotai/kimi-k3"
const MAX_SUMMARY_CHARS = 2_500

export interface ConversationSummary {
  text: string
  /** created_at da última mensagem coberta pelo resumo. */
  upto: string
  covered_messages: number
  updated_at: string
  model: string
}

/** Lê o resumo gravado (null sem). Nunca lança. */
export function parseSummary(context: unknown): ConversationSummary | null {
  const s = (context as { summary?: unknown } | null)?.summary as Partial<ConversationSummary> | undefined
  if (!s || typeof s.text !== "string" || typeof s.upto !== "string") return null
  return {
    text: s.text,
    upto: s.upto,
    covered_messages: typeof s.covered_messages === "number" ? s.covered_messages : 0,
    updated_at: typeof s.updated_at === "string" ? s.updated_at : "",
    model: typeof s.model === "string" ? s.model : "",
  }
}

const inflight = new Set<string>()

export function scheduleConversationSummary(admin: SupabaseClient, conversationId: string): void {
  if (inflight.has(conversationId)) return
  inflight.add(conversationId)
  void updateConversationSummary(admin, conversationId)
    .catch((err) => log.warn("sumário falhou", { conversation_id: conversationId, error: err instanceof Error ? err.message : String(err) }))
    .finally(() => inflight.delete(conversationId))
}

export async function updateConversationSummary(admin: SupabaseClient, conversationId: string): Promise<boolean> {
  const { data: conv } = await admin
    .from("ai_chat_conversations")
    .select("id, context, user_id, org_id")
    .eq("id", conversationId)
    .maybeSingle()
  if (!conv) return false
  const prev = parseSummary(conv.context)

  // Todas as mensagens user/assistant em ordem; a janela são as últimas N
  const { data: rows } = await admin
    .from("ai_chat_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(400)
  const all = (rows ?? []).filter((m) => (m.content ?? "").trim().length > 0)
  if (all.length <= HISTORY_LIMIT) return false
  const outside = all.slice(0, all.length - HISTORY_LIMIT)
  const fresh = prev ? outside.filter((m) => m.created_at > prev.upto) : outside
  if (fresh.length < MIN_NEW_MESSAGES) return false

  const transcript = fresh
    .map((m) => `${m.role === "user" ? "Usuário" : "ConvertIA"}: ${(m.content ?? "").slice(0, 1_500)}`)
    .join("\n\n")
  const started = Date.now()
  const res = await streamOpenRouterChat({
    model: SUMMARY_MODEL,
    maxTokens: 900,
    temperature: 0.2,
    timeoutMs: 60_000,
    messages: [
      {
        role: "system",
        content:
          "Você resume conversas internas de uma agência de email marketing para que um assistente continue a conversa sem o histórico completo. Escreva em português, em até 12 linhas, só fatos úteis: o que o usuário pediu, o que foi consultado/executado (com ids e nomes), decisões tomadas, números importantes e pendências. Sem floreio, sem repetir o resumo anterior palavra por palavra — integre.",
      },
      {
        role: "user",
        content: `${prev ? `Resumo anterior:\n${prev.text}\n\n` : ""}Mensagens novas fora da janela:\n${transcript}\n\nDevolva o resumo ATUALIZADO (anterior + novas).`,
      },
    ],
  })
  const text = res.text.trim().slice(0, MAX_SUMMARY_CHARS)
  if (!text) return false
  const summary: ConversationSummary = {
    text,
    upto: fresh[fresh.length - 1].created_at,
    covered_messages: (prev?.covered_messages ?? 0) + fresh.length,
    updated_at: new Date().toISOString(),
    model: SUMMARY_MODEL,
  }
  // context é REPLACE — mescla sobre o fresco
  const { data: again } = await admin.from("ai_chat_conversations").select("context").eq("id", conversationId).maybeSingle()
  const ctx = ((again?.context ?? conv.context) as Record<string, unknown> | null) ?? {}
  await admin.from("ai_chat_conversations").update({ context: { ...ctx, summary } }).eq("id", conversationId)

  void recordAiUsage({
    feature: "convertia",
    model: SUMMARY_MODEL,
    provider: "openrouter",
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    durationMs: Date.now() - started,
    userId: conv.user_id,
    orgId: conv.org_id,
    costCents: res.costUsd > 0 ? res.costUsd * 100 : null,
    context: { conversation_id: conversationId, kind: "summary", covered: summary.covered_messages },
  })
  log.info("sumário atualizado", { conversation_id: conversationId, covered: summary.covered_messages })
  return true
}
