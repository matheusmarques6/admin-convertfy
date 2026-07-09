"use client"

/**
 * useAgentRunsLive (Story AE-9)
 *
 * Mantém a live view de execuções de agentes atualizada em tempo real via
 * SSE (`/api/sse/admin/agents/runs`). Listeners:
 *   - 'run_upsert' -> upsert do run na lista (INSERT running + UPDATE final)
 *   - 'pipeline'   -> substitui a visão de pipeline por loja
 *   - 'ping'       -> atualiza lastPingAt (health)
 *
 * Baseline + fallback: SWR no REST `/api/admin/agents/runs` — refresh 30s
 * com SSE saudável (re-sincroniza agregados/janela), 5s se o SSE falhar
 * 3x em <30s (mesmo contrato do use-emails-live).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import type {
  AgentRunsPayload,
  LiveAgentRun,
  PipelineStoreOverview,
} from "@/types/agent-runs-live"

export type LiveStatus = "live" | "reconnecting" | "polling"

const RECONNECT_WINDOW_MS = 30_000
const RECONNECT_THRESHOLD = 3
const SWR_REFRESH_LIVE_MS = 30_000
const SWR_REFRESH_FALLBACK_MS = 5_000
const MAX_RUNS = 300

/**
 * Upsert de um run na lista (ordenada por created_at desc, cap MAX_RUNS).
 * Ignora payloads mais velhos que o que já temos (SSE e SWR podem cruzar).
 * Exportado para testes.
 */
export function upsertRun(
  runs: LiveAgentRun[],
  run: LiveAgentRun,
): LiveAgentRun[] {
  const idx = runs.findIndex((r) => r.id === run.id)
  if (idx === -1) {
    const next = [run, ...runs]
    next.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return next.slice(0, MAX_RUNS)
  }
  const current = runs[idx]
  if (current.updated_at > run.updated_at) return runs
  if (current.updated_at === run.updated_at && current.status === run.status) {
    return runs
  }
  const next = runs.slice()
  next[idx] = run
  return next
}

/**
 * Reconcilia o snapshot REST com o estado atual: o snapshot vira a base,
 * mas um run local mais novo (SSE entregou update depois do SELECT do
 * snapshot) não regride. Exportado para testes.
 */
export function mergeSnapshot(
  current: LiveAgentRun[],
  snapshot: LiveAgentRun[],
): LiveAgentRun[] {
  const localById = new Map(current.map((r) => [r.id, r]))
  return snapshot.map((snap) => {
    const local = localById.get(snap.id)
    return local && local.updated_at > snap.updated_at ? local : snap
  })
}

const fetcher = async (url: string): Promise<AgentRunsPayload> => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
  return json as AgentRunsPayload
}

export interface UseAgentRunsLiveResult {
  runs: LiveAgentRun[]
  pipeline: PipelineStoreOverview[]
  status: LiveStatus
  lastPingAt: number | null
  isLoading: boolean
}

export function useAgentRunsLive(windowMin: number): UseAgentRunsLiveResult {
  const [runs, setRuns] = useState<LiveAgentRun[]>([])
  const [pipeline, setPipeline] = useState<PipelineStoreOverview[]>([])
  const [status, setStatus] = useState<LiveStatus>("live")
  const [lastPingAt, setLastPingAt] = useState<number | null>(null)

  const errorTimestamps = useRef<number[]>([])
  const [sseDisabled, setSseDisabled] = useState(false)

  useEffect(() => {
    if (sseDisabled || typeof window === "undefined") return
    if (typeof EventSource === "undefined") {
      setStatus("polling")
      setSseDisabled(true)
      return
    }

    const es = new EventSource("/api/sse/admin/agents/runs")

    const onOpen = () => setStatus("live")

    const onRunUpsert = (event: MessageEvent) => {
      try {
        const run = JSON.parse(event.data) as LiveAgentRun
        setRuns((current) => upsertRun(current, run))
      } catch {
        // payload inválido — ignora
      }
    }

    const onPipeline = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          stores: PipelineStoreOverview[]
        }
        setPipeline(data.stores ?? [])
      } catch {
        // payload inválido — ignora
      }
    }

    const onPing = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { ts: number }
        setLastPingAt(data.ts)
      } catch {
        setLastPingAt(Date.now())
      }
    }

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
    es.addEventListener("run_upsert", onRunUpsert)
    es.addEventListener("pipeline", onPipeline)
    es.addEventListener("ping", onPing)
    es.addEventListener("error", onError)

    return () => {
      es.removeEventListener("open", onOpen)
      es.removeEventListener("run_upsert", onRunUpsert)
      es.removeEventListener("pipeline", onPipeline)
      es.removeEventListener("ping", onPing)
      es.removeEventListener("error", onError)
      es.close()
    }
  }, [sseDisabled])

  // Baseline REST — sempre ativo (re-sincroniza a janela); mais agressivo
  // quando o SSE caiu.
  const { data: swrData, isLoading } = useSWR<AgentRunsPayload>(
    `/api/admin/agents/runs?window_min=${windowMin}&limit=200`,
    fetcher,
    {
      refreshInterval: sseDisabled ? SWR_REFRESH_FALLBACK_MS : SWR_REFRESH_LIVE_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  )

  useEffect(() => {
    if (!swrData) return
    setRuns((current) => mergeSnapshot(current, swrData.runs ?? []))
    if (sseDisabled) setPipeline(swrData.pipeline ?? [])
    else setPipeline((current) => (current.length ? current : (swrData.pipeline ?? [])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swrData])

  // Janela aplicada client-side também (o SSE entrega tudo que chega).
  const sinceIso = useMemo(
    () => new Date(Date.now() - windowMin * 60 * 1000).toISOString(),
    // lastPingAt/runs mudando já força re-render; recalcular a cada render
    // seria instável pro useMemo — janela re-avaliada quando runs mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowMin, runs.length],
  )
  const visibleRuns = useMemo(
    () => runs.filter((r) => r.created_at >= sinceIso || r.status === "running"),
    [runs, sinceIso],
  )

  return { runs: visibleRuns, pipeline, status, lastPingAt, isLoading }
}
