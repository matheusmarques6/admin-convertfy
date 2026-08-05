"use client"

/**
 * Realtime do inbox CRM — espelha o padrão de use-realtime-board.ts:
 * postgres_changes + debounce + polling de reconexão + safety refresh.
 *
 * Dois canais:
 *  - crm_threads (INSERT/UPDATE): revalida a lista de conversas
 *  - crm_messages filtrado por thread_id ativa (INSERT/UPDATE):
 *    revalida a conversa aberta (debounce curto — mensagem nova tem
 *    que aparecer rápido)
 *
 * Requer as tabelas na publication supabase_realtime (migration
 * 20260812_whatsapp_core_messaging.sql). O canal de threads é
 * FILTRADO por org_id: sem isso, cada mensagem de qualquer cliente de
 * qualquer organização acordava todos os inboxes abertos (revalidação
 * inútil) e entregava ao browser o padrão de atividade alheio. O dado
 * em si sempre veio filtrado pela API — o que vazava era o evento.
 *
 * O safety refresh só roda quando o realtime NÃO está conectado: com
 * ele ativo eram quatro requisições a cada 30s por aba, redundantes
 * entre si. E tudo pausa em aba oculta.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

const LIST_DEBOUNCE_MS = 1500
const DETAIL_DEBOUNCE_MS = 300
const RECONNECT_POLLING_MS = 30_000
const SAFETY_REFRESH_MS = 30_000

interface UseRealtimeInboxOptions {
  /** Revalida a lista de threads (SWR mutate). */
  onThreadsUpdate: () => void
  /** Revalida a thread aberta (SWR mutate). */
  onDetailUpdate: () => void
  /** Thread aberta — null desliga o canal de mensagens. */
  activeThreadId: string | null
  /** Org do usuário: filtra os eventos de thread. */
  orgId?: string | null
  enabled?: boolean
}

export function useRealtimeInbox({
  onThreadsUpdate,
  onDetailUpdate,
  activeThreadId,
  orgId,
  enabled = true,
}: UseRealtimeInboxOptions) {
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const threadsChannelRef = useRef<RealtimeChannel | null>(null)
  const messagesChannelRef = useRef<RealtimeChannel | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const listDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const debouncedThreads = useCallback(() => {
    if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
    listDebounceRef.current = setTimeout(onThreadsUpdate, LIST_DEBOUNCE_MS)
  }, [onThreadsUpdate])

  const debouncedDetail = useCallback(() => {
    if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current)
    detailDebounceRef.current = setTimeout(onDetailUpdate, DETAIL_DEBOUNCE_MS)
  }, [onDetailUpdate])

  const refreshAll = useCallback(() => {
    // Aba em segundo plano não precisa de dado fresco — ela revalida
    // ao voltar ao foco.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    onThreadsUpdate()
    onDetailUpdate()
  }, [onThreadsUpdate, onDetailUpdate])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(refreshAll, RECONNECT_POLLING_MS)
  }, [refreshAll])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  // Canal 1: lista de threads
  useEffect(() => {
    if (!enabled) return

    const orgFilter = orgId ? { filter: `org_id=eq.${orgId}` } : {}
    const channel = supabase
      .channel(orgId ? `inbox-threads-realtime-${orgId}` : "inbox-threads-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_threads", ...orgFilter },
        () => debouncedThreads(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crm_threads", ...orgFilter },
        () => debouncedThreads(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true)
          stopPolling()
          // Realtime saudável dispensa a rede de segurança.
          if (safetyRef.current) {
            clearInterval(safetyRef.current)
            safetyRef.current = null
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeConnected(false)
          startPolling()
          if (!safetyRef.current) safetyRef.current = setInterval(refreshAll, SAFETY_REFRESH_MS)
        }
      })

    threadsChannelRef.current = channel

    // Rede de segurança até o canal confirmar a inscrição.
    safetyRef.current = setInterval(refreshAll, SAFETY_REFRESH_MS)

    return () => {
      supabase.removeChannel(channel)
      threadsChannelRef.current = null
      stopPolling()
      if (safetyRef.current) {
        clearInterval(safetyRef.current)
        safetyRef.current = null
      }
      if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
    }
  }, [enabled, orgId, supabase, debouncedThreads, refreshAll, startPolling, stopPolling])

  // Canal 2: mensagens da thread aberta (re-cria ao trocar de thread)
  useEffect(() => {
    if (!enabled || !activeThreadId) return

    const channel = supabase
      .channel(`inbox-messages-${activeThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        },
        () => debouncedDetail(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crm_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        },
        () => debouncedDetail(),
      )
      .subscribe()

    messagesChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      messagesChannelRef.current = null
      if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current)
    }
  }, [enabled, activeThreadId, supabase, debouncedDetail])

  return { realtimeConnected }
}
