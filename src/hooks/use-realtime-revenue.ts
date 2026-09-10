"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 2000
/**
 * Espera inicial do fallback, quando o realtime cai.
 *
 * Cada disparo revalida as NOVE rotas do dashboard, então 30 s fixos são 18
 * requisições por minuto por aba aberta — e o realtime-js reconecta em
 * [1s, 2s, 5s, 10s] fixos e sem jitter, o que faz todas as abas voltarem
 * juntas. Daí o backoff com jitter, a mesma lição que o inbox já custou.
 */
const POLL_MIN_MS = 30_000
/** Teto do backoff: aba esquecida aberta não fica batendo de meio em meio minuto. */
const POLL_MAX_MS = 5 * 60_000
/** Teto de espera por passada (a rota declara 300s). */
const PASSADA_TIMEOUT_MS = 290_000
/** Passadas encadeadas por clique — o lote continua até zerar a pendência. */
const MAX_PASSADAS = 6
/** Espera antes de tentar de novo quando outra passada segura o lock. */
const ESPERA_LOCK_MS = 10_000
/**
 * Quanto tempo insistir enquanto o lock do período está ocupado.
 *
 * O lock dura 5 min e sobrevive à função que morre no teto da Vercel, então
 * um clique podia cair em `alreadyRunning` durante minutos. Com as esperas
 * contando como passada, o loop gastava 6 × 6 s = 36 s, saía com
 * `restam = 0` e **sem erro** — a tela não mudava e não dizia nada. Era o
 * "clico em sincronizar e ele não sincroniza e para de sincronizar".
 */
const ESPERA_LOCK_TOTAL_MS = 6 * 60 * 1000
/** Falhas de rede seguidas antes de desistir do encadeamento. */
const MAX_FALHAS_SEGUIDAS = 2

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
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    let passada = 0
    let falhasSeguidas = 0
    let esperandoLockDesde: number | null = null

    // Uma passada que falha NÃO pode abortar o encadeamento: o `try` envolvia
    // o `for` inteiro, então a primeira falha de rede — justamente a da
    // função que morreu no teto da Vercel com metade da carteira feita —
    // matava as cinco passadas seguintes, e o clique acabava sem ter
    // sincronizado o resto.
    while (passada < MAX_PASSADAS) {
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
          // Outra aba (ou o auto-sync da abertura da tela) ainda segura o
          // lock deste período. Esperar aqui NÃO consome passada — senão o
          // orçamento de passadas se esgota esperando e o clique termina
          // sem ter sincronizado nada, em silêncio.
          esperandoLockDesde ??= Date.now()
          if (Date.now() - esperandoLockDesde > ESPERA_LOCK_TOTAL_MS) {
            erro =
              "Outra sincronização deste período já está em andamento e não terminou. Aguarde um instante e clique de novo."
            break
          }
          setPending((p) => (p > 0 ? p : 1))
          await new Promise((r) => setTimeout(r, ESPERA_LOCK_MS))
          continue
        }

        esperandoLockDesde = null
        falhasSeguidas = 0
        // A passada deu certo: a falha da anterior não vale mais. Sem isso,
        // um `break` por `restam === 0` logo depois de uma falha deixava a
        // tela acusando erro numa sincronização que completou.
        erro = null
        passada++
        onDataUpdate()
        restam = Number(data.storesPending) || 0
        setPending(restam)
        if (restam === 0) break
      } catch (err) {
        passada++
        falhasSeguidas++
        const isAbort = err instanceof Error && err.name === "AbortError"
        erro = isAbort
          ? "A sincronização passou do tempo de espera. O servidor continua processando — os números completam sozinhos."
          : err instanceof Error
            ? err.message
            : String(err)
        // Uma passada pode morrer no teto da função com boa parte da
        // carteira já gravada. Tentar de novo continua de onde parou (o
        // frescor pula quem acabou de sincronizar); só duas falhas
        // seguidas significam que insistir não vai adiantar.
        if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) break
        onDataUpdate()
        await new Promise((r) => setTimeout(r, ESPERA_LOCK_MS))
        continue
      } finally {
        clearTimeout(timeoutId)
      }
    }

    if (restam > 0 && !erro) {
      erro = `Faltaram ${restam} lojas nesta rodada — clique de novo para continuar.`
    }
    if (!erro) setPending(0)
    setRefreshError(erro)
    setIsRefreshing(false)
  }, [period, start, end, isRefreshing, onDataUpdate, refreshUrl])

  // Fallback do realtime: UM timer reagendado, com backoff e jitter, e
  // parado enquanto a aba está oculta — ninguém precisa de dado fresco numa
  // aba que não está à vista, e é justamente a aba esquecida que fica
  // batendo para sempre.
  const esperaRef = useRef(POLL_MIN_MS)
  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    const agendar = () => {
      const jitter = 0.75 + Math.random() * 0.5
      pollingRef.current = setTimeout(() => {
        pollingRef.current = null
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          // Aba oculta: não busca, só reagenda — sem isso o backoff nunca
          // avança e a aba volta a bater assim que reaparece.
          agendar()
          return
        }
        onDataUpdate()
        esperaRef.current = Math.min(POLL_MAX_MS, esperaRef.current * 2)
        agendar()
      }, esperaRef.current * jitter)
    }
    agendar()
  }, [onDataUpdate])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }
    // O realtime voltou: a próxima queda recomeça do intervalo curto.
    esperaRef.current = POLL_MIN_MS
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
