import useSWR, { SWRConfiguration } from "swr"

export interface CustomDateRange {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

function buildPeriodParams(period: string, customDates?: CustomDateRange): string {
  if (period === "custom" && customDates) {
    return `period=custom&start_date=${customDates.startDate}&end_date=${customDates.endDate}`
  }
  return `period=${period}`
}

// ---------------------------------------------------------------------------
// Generic fetcher – throws on non-ok responses so SWR treats them as errors.
// ---------------------------------------------------------------------------
export async function apiFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    // Try to extract a human-readable error message from JSON responses
    try {
      const json = JSON.parse(text)
      throw new Error(json.error || json.message || `Request failed: ${res.status}`)
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message !== text) throw parseError
      throw new Error(text || `Request failed: ${res.status}`)
    }
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Shared SWR defaults – stale-while-revalidate with sensible TTLs.
// ---------------------------------------------------------------------------
const DEFAULT_OPTIONS: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 10_000, // 10s – deduplicate identical requests
  errorRetryCount: 2,
}

// Report endpoints (email platform, Shopify, GA4) change infrequently.
const REPORT_OPTIONS: SWRConfiguration = {
  ...DEFAULT_OPTIONS,
  dedupingInterval: 60_000, // 1min dedup
  revalidateIfStale: true,
  keepPreviousData: true, // show old data while new period loads
}

// Asaas data is more volatile (payments, charges).
const ASAAS_OPTIONS: SWRConfiguration = {
  ...DEFAULT_OPTIONS,
  dedupingInterval: 15_000, // 15s dedup
  keepPreviousData: true,
}

// ---------------------------------------------------------------------------
// Hook: GA4 Report
// ---------------------------------------------------------------------------
export function useGA4Report(storeId: string | null, period: string, customDates?: CustomDateRange) {
  const key = storeId ? `/api/integrations/google-analytics/report?store_id=${storeId}&${buildPeriodParams(period, customDates)}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Store Email Platform Campaigns (Klaviyo ou Omnisend via dispatcher)
// ---------------------------------------------------------------------------
export function useStoreEmailCampaigns(storeId: string | null, period: string, customDates?: CustomDateRange) {
  const key = storeId ? `/api/integrations/email-platform/campaigns?store_id=${storeId}&${buildPeriodParams(period, customDates)}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Store Email Platform Flows (Klaviyo flows ou Omnisend automations)
// ---------------------------------------------------------------------------
export function useStoreEmailFlows(storeId: string | null, period: string, customDates?: CustomDateRange) {
  const key = storeId ? `/api/integrations/email-platform/flows?store_id=${storeId}&${buildPeriodParams(period, customDates)}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Asaas Payments
// ---------------------------------------------------------------------------
export function useAsaasPayments(clientId: string | null, year: number) {
  const key = clientId ? `/api/integrations/asaas/payments?client_id=${clientId}&year=${year}` : null
  return useSWR(key, apiFetcher, ASAAS_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Asaas Subscriptions
// ---------------------------------------------------------------------------
export function useAsaasSubscriptions(clientId: string | null) {
  const key = clientId ? `/api/integrations/asaas/subscriptions?client_id=${clientId}` : null
  return useSWR(key, apiFetcher, ASAAS_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Asaas Charges
// ---------------------------------------------------------------------------
export function useAsaasCharges(startDate: string | null, endDate: string | null) {
  const params = new URLSearchParams()
  if (startDate) params.set("start_date", startDate)
  if (endDate) params.set("end_date", endDate)
  const qs = params.toString()
  const key = `/api/integrations/asaas/charges/list${qs ? `?${qs}` : ""}`
  return useSWR(key, apiFetcher, ASAAS_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Wise Transactions
// ---------------------------------------------------------------------------
export function useWiseTransactions(startDate: string | null, endDate: string | null) {
  const key = startDate && endDate
    ? `/api/integrations/wise/transactions?start_date=${startDate}&end_date=${endDate}`
    : null
  return useSWR(key, apiFetcher, ASAAS_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Wise Balances
// ---------------------------------------------------------------------------
export function useWiseBalances() {
  return useSWR("/api/integrations/wise/balances", apiFetcher, DEFAULT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Wise Reconciliation status
// ---------------------------------------------------------------------------
export function useWiseReconciled() {
  return useSWR("/api/integrations/wise/reconcile", apiFetcher, DEFAULT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Google Calendar Connection Status
// ---------------------------------------------------------------------------
export interface GoogleCalendarStatus {
  connected: boolean
  google_email: string | null
  is_active: boolean
  last_synced_at: string | null
  sync_error: string | null
}

export function useGoogleCalendarStatus() {
  const { data, error, mutate, isLoading } = useSWR<GoogleCalendarStatus>(
    "/api/integrations/google/calendar/status",
    apiFetcher,
    DEFAULT_OPTIONS
  )

  return {
    connected: data?.connected ?? false,
    googleEmail: data?.google_email ?? null,
    isActive: data?.is_active ?? false,
    lastSyncedAt: data?.last_synced_at ?? null,
    syncError: data?.sync_error ?? null,
    refresh: mutate,
    isLoading: isLoading && !error,
    error,
  }
}

// ---------------------------------------------------------------------------
// Hook: Client Performance (aggregated Klaviyo + Shopify + Billing)
// ---------------------------------------------------------------------------
export function useClientPerformanceAPI(clientId: string | null, period: string, customDates?: CustomDateRange) {
  const key = clientId ? `/api/clients/${clientId}/performance?${buildPeriodParams(period, customDates)}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}
