"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 1500
// Polling de reconexão (quando o Realtime cai).
const RECONNECT_POLLING_MS = 30_000
// Revalidação periódica SEMPRE ativa (defesa contra eventos perdidos, ex:
// DELETE sem replica identity FULL, ou queda momentânea do canal). Mantém o
// board convergindo mesmo se um evento não chegar pelo Realtime.
const SAFETY_REFRESH_MS = 45_000

interface UseRealtimePipelineOptions {
  /** ID da pipeline atualmente aberta no board. */
  pipelineId: string
  /**
   * Chamado quando `deals`/`pipeline_stages` mudam — dispara o `mutate()`
   * do SWR do board (refetch de /api/crm/pipelines/[id]).
   */
  onDataUpdate: () => void
  /**
   * Opcional: chamado quando um NOVO deal entra nesta pipeline (INSERT) —
   * útil pra exibir um toast "novo lead" no board.
   */
  onNewDeal?: (deal: Record<string, unknown>) => void
  enabled?: boolean
}

/**
 * Assina Supabase Realtime para o board de uma pipeline do CRM:
 *  - `deals`           (INSERT/UPDATE filtrados por pipeline_id · DELETE global)
 *  - `pipeline_stages` (INSERT/UPDATE/DELETE filtrados por pipeline_id)
 *
 * Assim o board reflete em tempo real: leads novos cadastrados por
 * form/webhook, deals movidos de etapa por automação ou por outro usuário,
 * e edições de etapas — sem precisar de refresh manual.
 *
 * IMPORTANTE: exige as tabelas na publication `supabase_realtime`
 * (migration 20260725_enable_realtime_crm_deals.sql). O DELETE de `deals`
 * é assinado SEM filtro porque o evento carrega só a PK quando a replica
 * identity não é FULL — o `pipeline_id` do registro antigo não chega, então
 * um filtro por pipeline descartaria o evento. O refetch resultante é do
 * endpoint da pipeline atual, então o custo é limitado; o debounce agrupa
 * rajadas e o safety refresh cobre qualquer evento perdido.
 *
 * O UPDATE de `deals` também é assinado SEM filtro, pelo mesmo motivo em
 * outra roupagem: numa transferência entre pipelines o payload chega com o
 * `pipeline_id` NOVO, então um filtro `pipeline_id=eq.{atual}` descartaria
 * justamente o evento que avisa o board de ORIGEM que o card saiu — o card
 * ficaria fantasma até o safety refresh. Filtramos no cliente, aceitando o
 * evento quando a pipeline atual aparece no estado velho OU no novo.
 */
export function useRealtimePipeline({
  pipelineId,
  onDataUpdate,
  onNewDeal,
  enabled = true,
}: UseRealtimePipelineOptions) {
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs pra callbacks: evita recriar o canal a cada render do consumidor.
  const onDataUpdateRef = useRef(onDataUpdate)
  const onNewDealRef = useRef(onNewDeal)
  useEffect(() => {
    onDataUpdateRef.current = onDataUpdate
    onNewDealRef.current = onNewDeal
  }, [onDataUpdate, onNewDeal])

  const supabase = useMemo(() => createClient(), [])

  const debouncedUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onDataUpdateRef.current()
    }, DEBOUNCE_MS)
  }, [])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(() => {
      onDataUpdateRef.current()
    }, RECONNECT_POLLING_MS)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || !pipelineId) return

    const dealFilter = `pipeline_id=eq.${pipelineId}`

    const channel = supabase
      .channel(`crm-pipeline-${pipelineId}`)
      // ── deals: leads novos e movimentações nesta pipeline ──
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deals",
          filter: dealFilter,
        },
        (payload) => {
          onNewDealRef.current?.(payload.new as Record<string, unknown>)
          debouncedUpdate()
        },
      )
      // UPDATE sem filtro (ver docstring): aceita quando esta pipeline é a
      // origem OU o destino. Depende de REPLICA IDENTITY FULL em `deals`
      // (migration 20261050) pra `old.pipeline_id` existir; sem ela o
      // `old` vem só com a PK e caímos no fallback conservador de aceitar
      // — refetch a mais é barato, card fantasma não.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deals" },
        (payload) => {
          const newPipeline = (payload.new as { pipeline_id?: string } | null)
            ?.pipeline_id
          const oldPipeline = (payload.old as { pipeline_id?: string } | null)
            ?.pipeline_id
          const isDestination = newPipeline === pipelineId
          const isOrigin = oldPipeline === pipelineId
          // Sem replica identity FULL não dá pra saber a origem.
          const originUnknown = oldPipeline === undefined
          if (isDestination || isOrigin || originUnknown) debouncedUpdate()
        },
      )
      // DELETE sem filtro (ver docstring): a PK basta pro board sumir o card.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "deals" },
        () => debouncedUpdate(),
      )
      // ── pipeline_stages: criação/edição/remoção de etapas ──
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pipeline_stages",
          filter: dealFilter,
        },
        () => debouncedUpdate(),
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

    // Safety refresh sempre ativo (independente do Realtime).
    safetyRef.current = setInterval(() => {
      onDataUpdateRef.current()
    }, SAFETY_REFRESH_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      stopPolling()
      if (safetyRef.current) {
        clearInterval(safetyRef.current)
        safetyRef.current = null
      }
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [
    enabled,
    pipelineId,
    supabase,
    debouncedUpdate,
    startPolling,
    stopPolling,
  ])

  return {
    realtimeConnected,
  }
}
