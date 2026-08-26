"use client"

import useSWR from "swr"

/**
 * Não-lidas do inbox da ORG — alimenta o badge do item "Inbox" na
 * sidebar. Rota dedicada e leve (/api/crm/inbox/unread-count) em vez
 * da lista cheia de threads; mesma régua do total_unread do inbox,
 * então badge da sidebar e contador da tela nunca divergem.
 */
export function useInboxUnread(enabled: boolean): number {
  const { data } = useSWR<{ total_unread?: number }>(
    enabled ? "/api/crm/inbox/unread-count" : null,
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { total_unread: 0 })),
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )
  return data?.total_unread ?? 0
}
