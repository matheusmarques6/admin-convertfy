import useSWR, { SWRConfiguration } from "swr"

// ---------------------------------------------------------------------------
// Generic fetcher – throws on non-ok responses so SWR treats them as errors.
// ---------------------------------------------------------------------------
async function apiFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
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

// Report endpoints (Klaviyo, Shopify, GA4) change infrequently.
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
// Hook: Klaviyo Report
// ---------------------------------------------------------------------------
export function useKlaviyoReport(storeId: string | null, period: string) {
  const key = storeId ? `/api/integrations/klaviyo/report?store_id=${storeId}&period=${period}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Shopify Report
// ---------------------------------------------------------------------------
export function useShopifyReport(storeId: string | null, period: string) {
  const key = storeId ? `/api/integrations/shopify/report?store_id=${storeId}&period=${period}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: GA4 Report
// ---------------------------------------------------------------------------
export function useGA4Report(storeId: string | null, period: string) {
  const key = storeId ? `/api/integrations/google-analytics/report?store_id=${storeId}&period=${period}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Klaviyo Campaigns
// ---------------------------------------------------------------------------
export function useKlaviyoCampaigns(storeId: string | null, period: string) {
  const key = storeId ? `/api/integrations/klaviyo/campaigns?store_id=${storeId}&period=${period}` : null
  return useSWR(key, apiFetcher, REPORT_OPTIONS)
}

// ---------------------------------------------------------------------------
// Hook: Klaviyo Flows
// ---------------------------------------------------------------------------
export function useKlaviyoFlows(storeId: string | null, period: string) {
  const key = storeId ? `/api/integrations/klaviyo/flows?store_id=${storeId}&period=${period}` : null
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
