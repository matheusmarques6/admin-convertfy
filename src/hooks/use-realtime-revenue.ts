"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 2000
const POLLING_INTERVAL_MS = 30_000
/** Teto de espera por passada (a rota declara 300s). */
const PASSADA_TIMEOUT_MS = 290_000
/** Passadas encadeadas por clique — o lote continua até zerar a pendência. */
const MAX_PASSADAS = 6
/** Espera antes de tentar de novo quando outra passada segura o lock. */
const ESPERA_LOCK_MS = 6_000

interface UseRealtimeRevenueOptions {
  period: string
  /** Range personalizado (YYYY-MM-DD) — vai no body quando period="custom". */
  start?: string
  end?: string
  onDataUpdate: () => void
  enabled?: boolean
  refreshUrl?: string
}

/**
 * Subscribes to Supabase Realtime on store_revenue_summary.
 * When rows are updated (by cron or refresh-revenue POST), triggers onDataUpdate
 * with a 2s debounce to batch multiple row updates into a single re-fetch.
 *
 * Fallback: if Realtime disconnects, polls every 30s.
 */
export function useRealtimeRevenue({ period, start, end, onDataUpdate, enabled = true, refreshUrl = "/api/dashboard/refresh-revenue" }: UseRealtimeRevenueOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  /** Causa da última falha, pronta para a tela. Null = correu bem. */
  const [refreshError, setRefreshError] = useState<string | null>(null)
  /** Lojas que ainda não foram tentadas nesta janela (o lote continua). */
  const [pending, setPending] = useState(0)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const debouncedUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onDataUpdate()
      setIsRefreshing(false)
    }, DEBOUNCE_MS)
  }, [onDataUpdate])

  // Trigger a background refresh via POST endpoint.
  // Timeout absoluto de 60s no client pra UI nao ficar "carregando infinito"
  // mesmo que o servidor demore mais (vai continuar processando em bg, e o
  // Realtime/polling captura a atualizacao).
  const triggerRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setRefreshError(null)

    // O lote não cabe numa chamada: a rota devolve `storesPending` e nós
    // continuamos até zerar. Sem isso o clique sincronizava um punhado de
    // lojas e a tela seguia dizendo "incompleto" sem nada acontecer.
    let restam = 0
    let erro: string | null = null
    try {
      for (let passada = 0; passada < MAX_PASSADAS; passada++) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), PASSADA_TIMEOUT_MS)
        try {
          const res = await fetch(refreshUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ period, start, end }),
            signal: controller.signal,
          })
          const data = await res.json().catch(() => ({}))

          // `res.ok` não era conferido: um 500 caía direto no caminho de
          // sucesso e a tela revalidava os mesmos números, o que o usuário
          // vê como "carrega e não puxa a receita".
          if (!res.ok) {
            erro =
              typeof data?.error === "string"
                ? data.error
                : (data?.error?.message ?? `Falhou (HTTP ${res.status})`)
            break
          }

          if (data.alreadyRunning) {
            // Outra aba (ou o clique anterior) ainda está sincronizando
            // este período. Sair aqui apagava o indicador enquanto o
            // servidor seguia trabalhando: os cards mudavam sozinhos e a
            // tela dizia "atualizado". Espera e tenta de novo — o lock
            // libera quando aquela passada termina.
            setPending((p) => (p > 0 ? p : 1))
            await new Promise((r) => setTimeout(r, ESPERA_LOCK_MS))
            continue
          }

          onDataUpdate()
          restam = Number(data.storesPending) || 0
          setPending(restam)
          if (restam === 0) break
        } finally {
          clearTimeout(timeoutId)
        }
      }
      if (restam > 0 && !erro) {
        erro = `Faltaram ${restam} lojas nesta rodada — clique de novo para continuar.`
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError"
      erro = isAbort
        ? "A sincronização passou do tempo de espera. O servidor continua processando — os números completam sozinhos."
        : err instanceof Error
          ? err.message
          : String(err)
    } finally {
      if (!erro) setPending(0)
      setRefreshError(erro)
      setIsRefreshing(false)
    }
  }, [period, start, end, isRefreshing, onDataUpdate, refreshUrl])

  // Start/stop polling fallback
  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(() => {
      onDataUpdate()
    }, POLLING_INTERVAL_MS)
  }, [onDataUpdate])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel("revenue-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_revenue_summary",
        },
        () => {
          debouncedUpdate()
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true)
          stopPolling()
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeConnected(false)
          startPolling()
        }
      })

    channelRef.current = channel

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      stopPolling()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [enabled, supabase, debouncedUpdate, startPolling, stopPolling])

  return {
    isRefreshing,
    realtimeConnected,
    triggerRefresh,
    /** Causa da última falha — a tela DIZ, em vez de só voltar ao normal. */
    refreshError,
    /** Lojas ainda não tentadas nesta janela. */
    pending,
  }
}
