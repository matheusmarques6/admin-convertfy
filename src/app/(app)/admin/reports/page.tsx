import { createClient } from "@/lib/supabase/server"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { ReportsPageContent } from "@/components/reports/reports-page-content"
import type { Report } from "@/types"
import type { StoreOption } from "@/components/reports/generate-report-modal"

export const dynamic = "force-dynamic"

interface ReportWithRelations extends Report {
  client?: { id: string; name: string; company?: string } | null
  user?: { id: string; name: string } | null
  store?: { id: string; store_name: string } | null
}

interface ClientOption {
  id: string
  name: string
}

interface PendingStore {
  id: string
  store_name: string
  client_id: string
  client_name: string
  has_klaviyo: boolean
  has_omnisend: boolean
  has_shopify: boolean
}

async function getReports(): Promise<ReportWithRelations[]> {
  const supabase = await createClient()

  const { data: reports } = await supabase
    .from("client_reports")
    .select(`
      *,
      client:clients (
        id,
        name,
        company
      ),
      user:profiles (
        id,
        name
      ),
      store:client_stores (
        id,
        store_name
      )
    `)
    .order("created_at", { ascending: false })

  return (reports || []) as ReportWithRelations[]
}

async function getClients(): Promise<ClientOption[]> {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .in("status", ["active", "onboarding"])
    .order("name")

  return (clients || []) as ClientOption[]
}

/**
 * Busca lojas com qualquer integracao configurada (Klaviyo, Omnisend ou Shopify).
 * Resiliente a migration 20260417 pendente — tenta com omnisend_api_key primeiro
 * e cai em fallback legacy.
 */
async function fetchStoresWithAnyIntegration() {
  const supabase = await createClient()
  const relation = `
      id,
      store_name,
      client_id,
      klaviyo_private_key,
      klaviyo_api_key,
      omnisend_api_key,
      shopify_access_token,
      client:clients ( id, name )
    `
  const relationLegacy = `
      id,
      store_name,
      client_id,
      klaviyo_private_key,
      klaviyo_api_key,
      shopify_access_token,
      client:clients ( id, name )
    `

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resp: any = await supabase
    .from("client_stores")
    .select(relation)
    .or("klaviyo_private_key.neq.,klaviyo_api_key.neq.,omnisend_api_key.neq.,shopify_access_token.neq.")
    .order("store_name")

  if (resp.error && /omnisend_api_key/.test(resp.error.message || "")) {
    resp = await supabase
      .from("client_stores")
      .select(relationLegacy)
      .or("klaviyo_private_key.neq.,klaviyo_api_key.neq.,shopify_access_token.neq.")
      .order("store_name")
  }

  return resp.data || []
}

async function getPendingStores(): Promise<PendingStore[]> {
  const supabase = await createClient()
  const stores = await fetchStoresWithAnyIntegration()
  if (stores.length === 0) return []

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: recentReports } = await supabase
    .from("client_reports")
    .select("store_id")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const storesWithReports = new Set(recentReports?.map(r => r.store_id) || [])

  return stores
    .filter((s: Record<string, unknown>) => !storesWithReports.has(s.id as string))
    .map((raw: Record<string, unknown>) => {
      const clientData = raw.client as { name: string } | { name: string }[] | null
      const clientName = Array.isArray(clientData) ? clientData[0]?.name : clientData?.name
      return {
        id: raw.id as string,
        store_name: (raw.store_name as string) || "Loja sem nome",
        client_id: raw.client_id as string,
        client_name: clientName || "Cliente desconhecido",
        has_klaviyo: !!(raw.klaviyo_private_key || raw.klaviyo_api_key),
        has_omnisend: !!raw.omnisend_api_key,
        has_shopify: !!raw.shopify_access_token,
      }
    })
}

async function getConfiguredStores(): Promise<StoreOption[]> {
  const stores = await fetchStoresWithAnyIntegration()
  return stores.map((raw: Record<string, unknown>) => {
    const clientData = raw.client as { name: string } | { name: string }[] | null
    const clientName = Array.isArray(clientData) ? clientData[0]?.name : clientData?.name
    return {
      id: raw.id as string,
      store_name: (raw.store_name as string) || "Loja sem nome",
      client_id: raw.client_id as string,
      client_name: clientName || "Cliente desconhecido",
      has_klaviyo: !!(raw.klaviyo_private_key || raw.klaviyo_api_key),
      has_omnisend: !!raw.omnisend_api_key,
      has_shopify: !!raw.shopify_access_token,
    }
  })
}

async function getThisMonthCount(): Promise<number> {
  const supabase = await createClient()

  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const { count } = await supabase
    .from("client_reports")
    .select("*", { count: "exact", head: true })
    .gte("created_at", firstDayOfMonth.toISOString())

  return count || 0
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ store_id?: string; tab?: string }>
}) {
  const params = await searchParams
  const [reports, clients, pendingStores, thisMonthCount, configuredStores] = await Promise.all([
    getReports(),
    getClients(),
    getPendingStores(),
    getThisMonthCount(),
    getConfiguredStores(),
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["view_reports"]}>
      <ReportsPageContent
        reports={reports}
        clients={clients}
        pendingStores={pendingStores}
        totalCount={reports.length}
        thisMonthCount={thisMonthCount}
        configuredStores={configuredStores}
        initialStoreId={params.store_id}
        initialTab={params.tab}
      />
    </PagePermissionWrapper>
  )
}
