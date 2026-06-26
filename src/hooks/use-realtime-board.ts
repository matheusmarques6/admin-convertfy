"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 2000
// Polling de reconexão (quando o Realtime cai).
const RECONNECT_POLLING_MS = 30_000
// Revalidação periódica SEMPRE ativa (defesa contra eventos perdidos /
// mudanças fora do canal). Mantém telas de equipes diferentes convergindo
// mesmo se um INSERT/UPDATE não chegar pelo Realtime.
const SAFETY_REFRESH_MS = 30_000

interface UseRealtimeBoardOptions {
  /** Called when tasks change — typically triggers a router.refresh() or refetch */
  onDataUpdate: () => void
  /**
   * org_member_id of the current user. Mantido por compatibilidade e pra
   * nomear o canal; a visibilidade agora é COMPARTILHADA POR FUNÇÃO, então
   * NÃO filtramos por assignee_id — quem decide o que cada um vê é a RLS de
   * etapa (can_access_onboarding_task), aplicada também ao Realtime.
   */
  orgMemberId: string
  enabled?: boolean
}

/**
 * Subscribes to Supabase Realtime para o ESCOPO VISÍVEL do usuário, cobrindo
 * tasks compartilhadas por função (não só as atribuídas a ele):
 *  - `tasks`              (INSERT/UPDATE/DELETE)
 *  - `onboardings`        (UPDATE — mudança de etapa transfere visibilidade)
 *  - `task_deliverables`  (INSERT/UPDATE — conclusão de entregável/sub-item)
 *
 * A RLS por etapa garante que o Realtime só entrega linhas que o usuário pode
 * ver. Quando alguém conclui sub-item/etapa: a equipe anterior vê o card
 * sumir e a nova vê aparecer no próximo refetch (debounce 2s).
 *
 * Fallbacks de revalidação: polling ao desconectar (30s) + safety refresh
 * periódico sempre ativo (30s).
 */
export function useRealtimeBoard({
  onDataUpdate,
  orgMemberId,
  enabled = true,
}: UseRealtimeBoardOptions) {
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const debouncedUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onDataUpdate()
    }, DEBOUNCE_MS)
  }, [onDataUpdate])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(() => {
      onDataUpdate()
    }, RECONNECT_POLLING_MS)
  }, [onDataUpdate])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || !orgMemberId) return

    const channel = supabase
      .channel("board-shared-realtime")
      // ── tasks: sem filtro de assignee — RLS de etapa decide a entrega ──
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (payload) => {
          const newRow = payload.new as Record<string, unknown>
          if (
            newRow.source_type === "auto_onboarding_step" ||
            newRow.source_type === "auto_onboarding" ||
            newRow.source_type === "onboarding"
          ) {
            toast({
              title: "Nova tarefa",
              description:
                (newRow.title as string) ||
                "Uma nova tarefa de onboarding foi adicionada ao seu board",
            })
          }
          debouncedUpdate()
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        () => debouncedUpdate(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks" },
        () => debouncedUpdate(),
      )
      // ── onboardings: mudança de etapa/versão transfere visibilidade ──
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "onboardings" },
        () => debouncedUpdate(),
      )
      // ── task_deliverables: conclusão de entregável reflete em tempo real ──
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_deliverables" },
        () => debouncedUpdate(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "task_deliverables" },
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
      onDataUpdate()
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
    orgMemberId,
    supabase,
    debouncedUpdate,
    startPolling,
    stopPolling,
    onDataUpdate,
  ])

  return {
    realtimeConnected,
  }
}
