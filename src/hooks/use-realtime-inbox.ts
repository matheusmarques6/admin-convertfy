"use client"

/**
 * Realtime do inbox CRM.
 *
 * Dois canais:
 *  - crm_threads (INSERT/UPDATE), FILTRADO por org_id: revalida a lista
 *  - crm_messages filtrado por thread_id ativa: revalida a conversa aberta
 *
 * Três correções do incidente set/2026 (ver docs/crm/inbox-observability.md):
 *
 * 1. FAIL-CLOSED. Antes, sem `orgId` (lista ainda carregando — ou, pior,
 *    lista FALHANDO porque o banco estava saturado) o canal era assinado
 *    SEM filtro: cada mensagem de qualquer organização acordava este
 *    inbox e disparava uma revalidação de 9 statements. Quanto pior o
 *    banco, maior o raio de explosão. Agora: sem org, sem canal.
 *
 * 2. UM timer de fallback, com backoff e jitter. Eram dois intervalos de
 *    30s (polling de reconexão + safety refresh) chamando a MESMA
 *    revalidação dupla, para sempre, no mesmo instante em todas as abas.
 *
 * 3. DEPS ESTÁVEIS. As deps do efeito incluíam callbacks derivados do
 *    `mutate` do SWR, que muda de identidade a cada troca de thread,
 *    busca ou filtro — o canal era destruído e reassinado a cada clique
 *    (cada re-join grava em realtime.subscription e refaz autorização; o
 *    orçamento do Realtime é de 100 joins/s).
 *
 * Tudo pausa em aba oculta e revalida uma vez ao voltar ao foco.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  nextAttempt,
  nextBackoffMs,
  shouldRefetchNow,
  shouldSubscribeThreads,
} from "@/lib/crm/inbox-realtime-policy"

const LIST_DEBOUNCE_MS = 1500
const DETAIL_DEBOUNCE_MS = 300

interface UseRealtimeInboxOptions {
  /** Revalida a lista de threads (SWR mutate). */
  onThreadsUpdate: () => void
  /** Revalida a thread aberta (SWR mutate). */
  onDetailUpdate: () => void
  /** Thread aberta — null desliga o canal de mensagens. */
  activeThreadId: string | null
  /** Org do usuário: filtra os eventos de thread. Sem ela, não assina. */
  orgId?: string | null
  enabled?: boolean
  /**
   * Desliga o canal da LISTA mantendo o da conversa. O popup do card de
   * negócio não renderiza lista nenhuma — abrir um segundo canal de
   * threads por aba só duplicava trabalho no banco.
   */
  threadsChannelEnabled?: boolean
}

export function useRealtimeInbox({
  onThreadsUpdate,
  onDetailUpdate,
  activeThreadId,
  orgId,
  enabled = true,
  threadsChannelEnabled = true,
}: UseRealtimeInboxOptions) {
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const listDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = useMemo(() => createClient(), [])

  // Refs para os callbacks: é o que mantém as deps dos efeitos estáveis
  // (o mesmo padrão já usado em use-unified-notifications).
  const threadsUpdateRef = useRef(onThreadsUpdate)
  threadsUpdateRef.current = onThreadsUpdate
  const detailUpdateRef = useRef(onDetailUpdate)
  detailUpdateRef.current = onDetailUpdate

  const debouncedThreads = useCallback(() => {
    if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
    listDebounceRef.current = setTimeout(() => threadsUpdateRef.current(), LIST_DEBOUNCE_MS)
  }, [])

  const debouncedDetail = useCallback(() => {
    if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current)
    detailDebounceRef.current = setTimeout(() => detailUpdateRef.current(), DETAIL_DEBOUNCE_MS)
  }, [])

  const refreshAll = useCallback(() => {
    if (typeof document !== "undefined" && !shouldRefetchNow(document.visibilityState)) return
    threadsUpdateRef.current()
    detailUpdateRef.current()
  }, [])

  const stopFallback = useCallback(() => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current)
      fallbackRef.current = null
    }
  }, [])

  /**
   * Timer ÚNICO, reagendado a cada disparo com backoff crescente. Não é
   * setInterval de propósito: o intervalo muda a cada rodada e a aba
   * oculta não deve acumular disparos.
   */
  const scheduleFallback = useCallback(() => {
    stopFallback()
    const delay = nextBackoffMs(attemptRef.current)
    fallbackRef.current = setTimeout(() => {
      attemptRef.current = nextAttempt(false, attemptRef.current)
      refreshAll()
      scheduleFallback()
    }, delay)
  }, [refreshAll, stopFallback])

  // Canal 1: lista de threads (só com org resolvida)
  useEffect(() => {
    if (!shouldSubscribeThreads({ enabled: enabled && threadsChannelEnabled, orgId })) {
      // Sem canal, o fallback é o único caminho — mas só quando a tela
      // está de fato ligada (enabled), senão seria polling fantasma.
      setRealtimeConnected(false)
      if (enabled && threadsChannelEnabled) scheduleFallback()
      return () => stopFallback()
    }

    const channel = supabase
      .channel(`inbox-threads-realtime-${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_threads", filter: `org_id=eq.${orgId}` },
        () => debouncedThreads(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crm_threads", filter: `org_id=eq.${orgId}` },
        () => debouncedThreads(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true)
          attemptRef.current = nextAttempt(true, attemptRef.current)
          stopFallback()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeConnected(false)
          if (!fallbackRef.current) scheduleFallback()
        }
      })

    // Rede de segurança até a inscrição confirmar.
    if (!fallbackRef.current) scheduleFallback()

    return () => {
      supabase.removeChannel(channel)
      stopFallback()
      if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
    }
  }, [
    enabled,
    threadsChannelEnabled,
    orgId,
    supabase,
    debouncedThreads,
    scheduleFallback,
    stopFallback,
  ])

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

    return () => {
      supabase.removeChannel(channel)
      if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current)
    }
  }, [enabled, activeThreadId, supabase, debouncedDetail])

  // Volta ao foco / volta a rede: uma revalidação, não um intervalo.
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAll()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", refreshAll)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", refreshAll)
    }
  }, [enabled, refreshAll])

  return { realtimeConnected }
}
