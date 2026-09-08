import useSWR from "swr"
import { apiFetcher } from "./use-api-data"

export interface StoreOverviewActivity {
  id: string
  kind: string
  title: string
  summary: string | null
  tags: string[] | null
  occurred_at: string
  metadata?: Record<string, unknown>
  author?: { name: string; avatar_url: string | null } | null
}

export interface StoreOverviewEvent {
  id: string
  kind: string
  title: string
  scheduled_at: string
  attendees?: string[] | null
  notes?: string | null
  status?: string
}

export interface StoreOverviewHealthRow {
  health_score: number
  components: { email?: number; revenue?: number; tickets?: number; nps?: number } | null
  created_at: string
}

export interface StoreOverviewData {
  success: boolean
  period: string
  status: Record<string, { connected: boolean }>
  connected: { emailPlatform: boolean; shopify: boolean }
  store: unknown
  healthHistory: StoreOverviewHealthRow[]
  activity: StoreOverviewActivity[]
  events: StoreOverviewEvent[]
  briefing: unknown
  report: unknown
  campaigns: unknown
  flows: unknown
}

export function storeOverviewKey(storeId: string, period = "30d") {
  return `/api/admin/stores/${storeId}/overview?period=${period}`
}

export function storeBasicsKey(storeId: string) {
  return `/api/admin/stores/${storeId}/overview?period=30d&scope=basics`
}

export function useStoreOverview(storeId: string | null, period = "30d") {
  return useSWR<StoreOverviewData>(
    storeId ? storeOverviewKey(storeId, period) : null,
    apiFetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  )
}

/**
 * A ficha da loja e o status das integrações — sem esperar a plataforma
 * de e-mail.
 *
 * Existe porque `useStoreOverview` traz report/campaigns/flows AO VIVO da
 * Klaviyo/Omnisend no MESMO `Promise.all` da linha de `client_stores`: a
 * aba Setup ficava 10-30 s exibindo "—" em todos os campos, como se a
 * loja não tivesse cadastro. Quem não desenha gráfico de campanha usa
 * esta chave e recebe em ~200 ms.
 *
 * Chave própria de propósito — a resposta completa continua no cache dela
 * e as duas convivem sem uma invalidar a outra.
 */
export function useStoreBasics(storeId: string | null) {
  return useSWR<StoreOverviewData>(
    storeId ? storeBasicsKey(storeId) : null,
    apiFetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  )
}
