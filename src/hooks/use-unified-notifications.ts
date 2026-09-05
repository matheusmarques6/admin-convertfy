"use client"

/**
 * useUnifiedNotifications — fonte ÚNICA dos badges de notificação.
 *
 * Soma as duas fontes que antes divergiam entre os badges:
 *  - `notifications` não lidas do usuário (o "sino" — avisos in-app)
 *  - `report_jobs` não vistos/ativos (relatórios — useReportNotifications)
 *
 * PROVIDER, não hook solto (set/2026). O hook era montado CINCO vezes por
 * página — Sidebar desktop, SidebarUser dentro dela, o drawer mobile
 * (sempre montado, escondido por CSS) com a sua própria SidebarUser, e a
 * MobileTopBar. Cada instância abria um canal realtime com 4 bindings
 * (20 por aba), e como o `mutate` do SWR não participa do dedupe — é
 * assim por design, vercel/swr#1417 — um único evento virava até cinco
 * requisições reais. Agora o canal e o SWR vivem no provider e os
 * consumidores só leem.
 *
 * Os bindings de `report_jobs` saíram: eram os únicos SEM filtro, então
 * TODA linha de report_jobs de qualquer org era avaliada contra a RLS de
 * cada assinante. O polling adaptativo de useReportNotifications já cobre.
 *
 * REALTIME por invalidação: assina postgres_changes e apenas REVALIDA
 * (nunca monta estado do payload — RLS é a autoridade).
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { useAuthStore } from "@/lib/store"
import { notificationService } from "@/lib/services"
import { combineUnread } from "@/lib/notifications/unread-math"
import {
  useReportNotifications,
  type UseReportNotificationsResult,
} from "./use-report-notifications"

const NOTIF_POLL_MS = 60_000

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
  /** Registra um callback para eventos realtime na tabela notifications. */
  subscribeToChanges: (cb: () => void) => () => void
}

const NotificationsLiveContext = createContext<UseUnifiedNotificationsResult | null>(null)

/**
 * Monta UMA vez por aba (no layout do admin). Todos os badges consomem
 * daqui — um canal realtime, um poll, um cache.
 */
export function NotificationsLiveProvider({ children }: { children: ReactNode }) {
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

  // Listeners das telas que querem recarregar a própria lista no mesmo
  // canal (ex.: /admin/notifications), sem abrir outro.
  const listenersRef = useRef(new Set<() => void>())
  const subscribeToChanges = useCallback((cb: () => void) => {
    listenersRef.current.add(cb)
    return () => {
      listenersRef.current.delete(cb)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`notifications-live-${userId}`)
      // Só eventos do próprio usuário (filtro server-side + RLS).
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          void mutateNotif()
          listenersRef.current.forEach((cb) => cb())
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          void mutateNotif()
          listenersRef.current.forEach((cb) => cb())
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // mutateNotif é estável (SWR); o Set de listeners vive numa ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const reportsMutateRef = useRef(reports.mutate)
  reportsMutateRef.current = reports.mutate

  const refresh = useCallback(() => {
    void mutateNotif()
    reportsMutateRef.current()
  }, [mutateNotif])

  const value = useMemo<UseUnifiedNotificationsResult>(
    () => ({
      unreadTotal: combineUnread(notifUnread ?? 0, reports.unreadCount),
      notifUnread: notifUnread ?? 0,
      reportsUnread: reports.unreadCount,
      reports,
      refresh,
      subscribeToChanges,
    }),
    [notifUnread, reports, refresh, subscribeToChanges],
  )

  return createElement(NotificationsLiveContext.Provider, { value }, children)
}

/** Estado vazio para quem renderiza fora do provider (ex.: portal). */
const EMPTY_REPORTS: UseReportNotificationsResult = {
  jobs: [],
  unreadCount: 0,
  hasActiveJobs: false,
  isLoading: false,
  markAsViewed: async () => {},
  mutate: () => {},
}

export function useUnifiedNotifications(opts?: {
  /** Chamado quando chega evento realtime na tabela notifications. */
  onNotificationsChange?: () => void
}): UseUnifiedNotificationsResult {
  const ctx = useContext(NotificationsLiveContext)

  const onChangeRef = useRef(opts?.onNotificationsChange)
  onChangeRef.current = opts?.onNotificationsChange

  const subscribe = ctx?.subscribeToChanges
  useEffect(() => {
    if (!subscribe || !onChangeRef.current) return
    return subscribe(() => onChangeRef.current?.())
  }, [subscribe])

  return (
    ctx ?? {
      unreadTotal: 0,
      notifUnread: 0,
      reportsUnread: 0,
      reports: EMPTY_REPORTS,
      refresh: () => {},
      subscribeToChanges: () => () => {},
    }
  )
}
