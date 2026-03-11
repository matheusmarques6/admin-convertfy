import { BarChart3 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { ReportsList } from "@/components/reports/reports-list"
import type { Report } from "@/types"

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

async function getPendingStores(): Promise<PendingStore[]> {
  const supabase = await createClient()

  // Get all client stores with integrations configured
  const { data: stores } = await supabase
    .from("client_stores")
    .select(`
      id,
      store_name,
      client_id,
      klaviyo_private_key,
      klaviyo_api_key,
      shopify_access_token,
      client:clients (
        id,
        name
      )
    `)
    .or("klaviyo_private_key.neq.,klaviyo_api_key.neq.,shopify_access_token.neq.")

  if (!stores || stores.length === 0) return []

  // Get store IDs that have reports in the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: recentReports } = await supabase
    .from("client_reports")
    .select("store_id")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const storesWithReports = new Set(recentReports?.map(r => r.store_id) || [])

  // Filter stores without recent reports
  const pendingStores = stores
    .filter(s => !storesWithReports.has(s.id))
    .map(s => {
      // Handle client relation - can be object or array depending on Supabase version
      const clientData = s.client as { name: string } | { name: string }[] | null
      const clientName = Array.isArray(clientData)
        ? clientData[0]?.name
        : clientData?.name

      return {
        id: s.id,
        store_name: s.store_name || 'Loja sem nome',
        client_id: s.client_id,
        client_name: clientName || 'Cliente desconhecido',
        has_klaviyo: !!(s.klaviyo_private_key || s.klaviyo_api_key),
        has_shopify: !!s.shopify_access_token,
      }
    })

  return pendingStores
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
  searchParams: Promise<{ store_id?: string }>
}) {
  const params = await searchParams
  const [reports, clients, pendingStores, thisMonthCount] = await Promise.all([
    getReports(),
    getClients(),
    getPendingStores(),
    getThisMonthCount()
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["view_reports"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
            <p className="text-sm text-muted-foreground">Gere e visualize relatórios de desempenho dos clientes</p>
          </div>
        </div>

      <ReportsList
        initialReports={reports}
        clients={clients}
        totalCount={reports.length}
        thisMonthCount={thisMonthCount}
        pendingCount={pendingStores.length}
        pendingStores={pendingStores}
        initialStoreId={params.store_id}
      />
      </div>
    </PagePermissionWrapper>
  )
}
