"use client"

/**
 * useAgentExecutionsLive — a aba Execuções do Estúdio em tempo real.
 *
 * SSE (`/api/sse/admin/agents/executions`) com baseline e fallback em SWR
 * (`/api/admin/agents/executions`), o MESMO contrato do
 * `useAgentRunsLive`: 30s de refresh com o SSE saudável (re-sincroniza a
 * janela) e 5s quando o SSE falha 3× em menos de 30s.
 *
 * ── A armadilha que as duas funções puras existem para evitar ─────────
 *
 * Um evento pode significar duas coisas: o STATUS do e-mail mudou (aí
 * `updated_at` anda) ou uma RUN de agente mexeu (aí o `updated_at` do
 * e-mail fica EXATAMENTE igual e só a lista de runs muda). Desempatar por
 * `updated_at`, como o hook de runs faz, descartaria em silêncio todo
 * evento do segundo tipo — que é a maioria, e é justamente o que faz o nó
 * acender no canvas.
 *
 * Daí a "recência" ser derivada do conteúdo:
 * `max(updated_at, maior created_at das runs)`. Uma run nova nasce com
 * `created_at = agora`, então o número anda quando o status não anda.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import type {
  AgentExecution,
  AgentExecutionsPayload,
} from "@/types/agent-executions"

/**
 * `conectando` é o estado INICIAL, e existe porque o selo não pode dizer
 * "ao vivo" antes de a conexão abrir. Começando em `live` a tela afirmava
 * o que ainda não sabia: SSE que nunca abre só vira `reconnecting` no
 * primeiro evento de erro, e SSE que abre e fica calado (o caso normal,
 * ocioso) é indistinguível de SSE que não existe.
 */
export type LiveStatus = "conectando" | "live" | "reconnecting" | "polling"

const RECONNECT_WINDOW_MS = 30_000
const RECONNECT_THRESHOLD = 3
const SWR_REFRESH_LIVE_MS = 30_000
const SWR_REFRESH_FALLBACK_MS = 5_000
const MAX_EXECUTIONS = 60

/**
 * O quão "nova" é a visão que temos desta execução. Não é o horário da
 * geração — é o carimbo mais recente que o payload carrega, e serve só
 * para desempatar duas visões da MESMA execução.
 */
export function execRecency(e: AgentExecution): string {
  let max = e.updated_at
  for (const r of e.runs) {
    if (r.created_at > max) max = r.created_at
  }
  return max
}

/**
 * Upsert de uma execução vinda do SSE.
 *
 * O evento é sempre autoritativo — o servidor acabou de ler o estado do
 * banco, e o SSE entrega em ordem numa conexão só. Comparar recência aqui
 * seria pedir para descartar o evento de run (que não move o `updated_at`
 * do e-mail). Exportada para testes.
 */
export function upsertExecution(
  list: AgentExecution[],
  exec: AgentExecution,
): AgentExecution[] {
  const idx = list.findIndex((e) => e.email_id === exec.email_id)
  const next = list.slice()
  if (idx === -1) next.push(exec)
  else next[idx] = exec
  next.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return next.slice(0, MAX_EXECUTIONS)
}

/**
 * Reconcilia o snapshot REST com o que o SSE já trouxe.
 *
 * O snapshot é a base (ele define a JANELA — quais execuções aparecem), e
 * o local só vence quando é estritamente mais novo. Empate vai para o
 * snapshot, que é a leitura mais fresca do banco: com o SSE morto nenhum
 * evento local chega, a recência local nunca passa a do snapshot e o
 * fallback assume sozinho.
 *
 * Execução que o SSE trouxe e a janela do snapshot não cobre é PRESERVADA
 * — sem isso ela pisca (entra pelo evento, sai no refresh, volta no
 * próximo evento). Exportada para testes.
 */
export function mergeExecutionsSnapshot(
  current: AgentExecution[],
  snapshot: AgentExecution[],
): AgentExecution[] {
  const localById = new Map(current.map((e) => [e.email_id, e]))
  const merged = snapshot.map((snap) => {
    const local = localById.get(snap.email_id)
    return local && execRecency(local) > execRecency(snap) ? local : snap
  })
  const noSnapshot = new Set(snapshot.map((s) => s.email_id))
  for (const e of current) {
    if (!noSnapshot.has(e.email_id)) merged.push(e)
  }
  merged.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return merged.slice(0, MAX_EXECUTIONS)
}

const fetcher = async (url: string): Promise<AgentExecutionsPayload> => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
  return json as AgentExecutionsPayload
}

export interface UseAgentExecutionsLiveResult {
  executions: AgentExecution[]
  status: LiveStatus
  lastEventAt: number | null
  isLoading: boolean
  error: Error | undefined
  /** Força o snapshot REST — usado depois de disparar uma re-execução. */
  refresh: () => void
}

export function useAgentExecutionsLive(
  limit = 30,
): UseAgentExecutionsLiveResult {
  const [executions, setExecutions] = useState<AgentExecution[]>([])
  const [status, setStatus] = useState<LiveStatus>("conectando")
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)

  const errorTimestamps = useRef<number[]>([])
  const [sseDisabled, setSseDisabled] = useState(false)

  useEffect(() => {
    if (sseDisabled || typeof window === "undefined") return
    if (typeof EventSource === "undefined") {
      setStatus("polling")
      setSseDisabled(true)
      return
    }

    const es = new EventSource("/api/sse/admin/agents/executions")

    const onOpen = () => setStatus("live")

    const onUpsert = (event: MessageEvent) => {
      try {
        const exec = JSON.parse(event.data) as AgentExecution
        setExecutions((current) => upsertExecution(current, exec))
        setLastEventAt(Date.now())
      } catch {
        // payload inválido — ignora
      }
    }

    const onPing = () => setLastEventAt(Date.now())

    const onError = () => {
      setStatus("reconnecting")
      const now = Date.now()
      errorTimestamps.current.push(now)
      errorTimestamps.current = errorTimestamps.current.filter(
        (t) => now - t < RECONNECT_WINDOW_MS,
      )
      if (errorTimestamps.current.length >= RECONNECT_THRESHOLD) {
        setSseDisabled(true)
        setStatus("polling")
        es.close()
      }
    }

    es.addEventListener("open", onOpen)
    es.addEventListener("execution_upsert", onUpsert)
    es.addEventListener("ping", onPing)
    es.addEventListener("error", onError)

    return () => {
      es.removeEventListener("open", onOpen)
      es.removeEventListener("execution_upsert", onUpsert)
      es.removeEventListener("ping", onPing)
      es.removeEventListener("error", onError)
      es.close()
    }
  }, [sseDisabled])

  const {
    data: swrData,
    isLoading,
    error,
    mutate,
  } = useSWR<AgentExecutionsPayload>(
    `/api/admin/agents/executions?limit=${limit}`,
    fetcher,
    {
      refreshInterval: sseDisabled
        ? SWR_REFRESH_FALLBACK_MS
        : SWR_REFRESH_LIVE_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  )

  useEffect(() => {
    if (!swrData) return
    setExecutions((current) =>
      mergeExecutionsSnapshot(current, swrData.executions ?? []),
    )
  }, [swrData])

  const refresh = useCallback(() => {
    void mutate()
  }, [mutate])

  // A lista devolvida é estável por referência enquanto nada muda — o
  // canvas re-projeta as runs a cada mudança de `executions`.
  const stable = useMemo(() => executions, [executions])

  return {
    executions: stable,
    status,
    lastEventAt,
    isLoading,
    error: error as Error | undefined,
    refresh,
  }
}
