"use client"

/**
 * useUnifiedNotifications — fonte ÚNICA dos badges de notificação.
 *
 * Soma as duas fontes que antes divergiam entre os badges:
 *  - `notifications` não lidas do usuário (o "sino" — avisos in-app)
 *  - `report_jobs` não vistos/ativos (relatórios — useReportNotifications)
 *
 * REALTIME por invalidação: assina postgres_changes nas duas tabelas e
 * apenas REVALIDA as queries (nunca monta estado do payload — RLS é a
 * autoridade). O polling existente (30s no sino; 5s/30s nos reports)
 * permanece como fallback se o websocket cair. Requer as tabelas na
 * publication supabase_realtime (migration 20260822).
 *
 * `onNotificationsChange` (opcional) deixa a página /admin/notifications
 * recarregar a própria lista no mesmo canal, sem abrir outro.
 */

import { useCallback, useEffect, useRef } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { useAuthStore } from "@/lib/store"
import { notificationService } from "@/lib/services"
import { combineUnread } from "@/lib/notifications/unread-math"
import {
  useReportNotifications,
  type UseReportNotificationsResult,
} from "./use-report-notifications"

const NOTIF_POLL_MS = 30_000

export interface UseUnifiedNotificationsResult {
  /** Sino + relatórios — o número do badge. */
  unreadTotal: number
  /** Só o sino (tabela notifications). */
  notifUnread: number
  /** Só relatórios (terminais não vistos + ativos). */
  reportsUnread: number
  /** Acesso completo aos reports (jobs, markAsViewed, etc). */
  reports: UseReportNotificationsResult
  /** Revalida as duas fontes agora. */
  refresh: () => void
}

export function useUnifiedNotifications(opts?: {
  /** Chamado quando chega evento realtime na tabela notifications. */
  onNotificationsChange?: () => void
}): UseUnifiedNotificationsResult {
  const { user } = useAuthStore()
  const userId = user?.id ?? null
  const reports = useReportNotifications()

  const { data: notifUnread, mutate: mutateNotif } = useSWR(
    userId ? ["notifications-unread", userId] : null,
    () => notificationService.getUnreadCount(userId!),
    {
      refreshInterval: NOTIF_POLL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 4_000,
    },
  )

  // Ref estável para o callback externo (evita re-assinar o canal).
  const onChangeRef = useRef(opts?.onNotificationsChange)
  onChangeRef.current = opts?.onNotificationsChange

  const reportsMutateRef = useRef(reports.mutate)
  reportsMutateRef.current = reports.mutate

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`notifications-live-${userId}`)
      // Sino: só eventos do próprio usuário (filtro server-side + RLS).
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void mutateNotif()
          onChangeRef.current?.()
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void mutateNotif()
          onChangeRef.current?.()
        },
      )
      // Relatórios: sem filtro — RLS por org decide a entrega.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "report_jobs" },
        () => reportsMutateRef.current(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "report_jobs" },
        () => reportsMutateRef.current(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // mutateNotif é estável (SWR); refs cobrem o resto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const refresh = useCallback(() => {
    void mutateNotif()
    reportsMutateRef.current()
  }, [mutateNotif])

  return {
    unreadTotal: combineUnread(notifUnread ?? 0, reports.unreadCount),
    notifUnread: notifUnread ?? 0,
    reportsUnread: reports.unreadCount,
    reports,
    refresh,
  }
}
