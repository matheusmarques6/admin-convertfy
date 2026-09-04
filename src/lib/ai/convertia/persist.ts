/**
 * Persistência de um turno da ConvertIA em ai_chat_messages.
 *
 * A linha da resposta nasce no início do turno (meta.streaming=true) e
 * é atualizada a cada ~2,5 s com o estado parcial — é o que faz o F5
 * voltar na mesma conversa com a resposta em andamento. O update vai
 * pela RPC `ai_chat_message_progress` (merge de meta no banco): outras
 * requisições gravam flags na MESMA coluna (Parar → cancel_requested,
 * Confirmar → pending_confirmation.resolution) e um update com o
 * objeto inteiro as apagaria. Sem a migration 20261114 a RPC não
 * existe: cai no update plano (comportamento antigo).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import type { TurnState } from "./tool-loop"
import type { AssistantMessageMeta } from "./types"

const log = logger.child("ConvertiaPersist")

const PARTIAL_THROTTLE_MS = 2_500
const MISSING_FN = new Set(["42883", "PGRST202", "PGRST203"])

export interface TurnPersistence {
  persistPartial: (force?: boolean) => void
  /** Espera as gravações parciais em voo (o update final tem de ser o último). */
  flush: () => Promise<void>
  /** Merge de meta (e content) — nunca lança. */
  merge: (patch: Partial<AssistantMessageMeta> & Record<string, unknown>, content?: string | null) => Promise<void>
}

let rpcMissing = false

/** Merge de meta numa mensagem (RPC com fallback). Exportado pro cancel/confirm. */
export async function mergeMessageMeta(
  admin: SupabaseClient,
  messageId: string,
  patch: Record<string, unknown>,
  content: string | null = null,
): Promise<void> {
  if (!rpcMissing) {
    const { error } = await admin.rpc("ai_chat_message_progress", {
      p_id: messageId,
      p_content: content,
      p_meta_patch: patch,
    })
    if (!error) return
    if (!MISSING_FN.has(error.code ?? "") && !/function .* does not exist/i.test(error.message)) {
      throw error
    }
    rpcMissing = true
    log.warn("rpc ai_chat_message_progress ausente — fallback para update plano (aplique a migration 20261114)")
  }
  // Fallback: lê + grava (racy — só até a migration rodar)
  const { data } = await admin.from("ai_chat_messages").select("meta").eq("id", messageId).maybeSingle()
  const merged = { ...((data?.meta as Record<string, unknown> | null) ?? {}), ...patch }
  const { error } = await admin
    .from("ai_chat_messages")
    .update({ meta: merged, ...(content != null ? { content } : {}) })
    .eq("id", messageId)
  if (error) throw error
}

/**
 * Resolve a confirmação de ação irreversível de forma ATÔMICA (RPC
 * `ai_chat_confirmation_resolve`: UPDATE condicional em resolved_at IS
 * NULL). Devolve false quando outra requisição já resolveu — dois
 * cliques em "Confirmar" executam UMA vez. Sem a migration 20261117
 * cai no merge não atômico (comportamento anterior).
 */
export async function resolveConfirmationAtomic(
  admin: SupabaseClient,
  messageId: string,
  confirmationId: string,
  resolution: "approved" | "rejected",
): Promise<boolean> {
  const { data, error } = await admin.rpc("ai_chat_confirmation_resolve", {
    p_message_id: messageId,
    p_confirmation_id: confirmationId,
    p_resolution: resolution,
  })
  if (!error) return data === true
  if (!MISSING_FN.has(error.code ?? "") && !/function .* does not exist/i.test(error.message)) throw error
  log.warn("rpc ai_chat_confirmation_resolve ausente — fallback não atômico (aplique a migration 20261117)")
  const { data: row } = await admin.from("ai_chat_messages").select("meta").eq("id", messageId).maybeSingle()
  const pending = (row?.meta as { pending_confirmation?: Record<string, unknown> } | null)?.pending_confirmation
  if (!pending || pending.id !== confirmationId || pending.resolved_at) return false
  await mergeMessageMeta(admin, messageId, {
    pending_confirmation: { ...pending, resolved_at: new Date().toISOString(), resolution },
  })
  return true
}

export function createTurnPersistence(opts: {
  admin: SupabaseClient
  messageId: string | null
  state: TurnState
  baseMeta: () => Record<string, unknown>
  clock?: () => number
}): TurnPersistence {
  const clock = opts.clock ?? Date.now
  let lastPersist = 0
  let chain: Promise<unknown> = Promise.resolve()

  const merge: TurnPersistence["merge"] = async (patch, content = null) => {
    if (!opts.messageId) return
    try {
      await mergeMessageMeta(opts.admin, opts.messageId, patch, content)
    } catch (err) {
      log.warn("persistência falhou", { error: err instanceof Error ? err.message : String(err) })
    }
  }

  const persistPartial = (force = false) => {
    if (!opts.messageId) return
    const now = clock()
    if (!force && now - lastPersist < PARTIAL_THROTTLE_MS) return
    lastPersist = now
    const snapshotContent = opts.state.roundText
    const snapshotProgress = [...opts.state.progress]
    const snapshotSources = opts.state.sources.map((s) => ({ ...s }))
    const pending = opts.state.pendingConfirmation
    chain = chain
      .then(() =>
        merge(
          {
            ...opts.baseMeta(),
            streaming: true,
            updated_at: new Date(now).toISOString(),
            sources: snapshotSources,
            progress: snapshotProgress,
            ...(pending ? { pending_confirmation: pending } : {}),
          },
          snapshotContent,
        ),
      )
      .catch(() => undefined)
  }

  return {
    persistPartial,
    flush: async () => {
      await chain
    },
    merge,
  }
}
