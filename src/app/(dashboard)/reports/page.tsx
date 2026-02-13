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

async function getPendingReportsCount(): Promise<number> {
  const supabase = await createClient()

  // Get all client stores with Klaviyo configured
  const { data: stores } = await supabase
    .from("client_stores")
    .select("id, client_id")
    .or("klaviyo_private_key.neq.,klaviyo_api_key.neq.")

  if (!stores || stores.length === 0) return 0

  // Get store IDs that have reports in the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: recentReports } = await supabase
    .from("client_reports")
    .select("store_id")
    .gte("created_at", thirtyDaysAgo.toISOString())

  const storesWithReports = new Set(recentReports?.map(r => r.store_id) || [])

  // Count stores without recent reports
  const pendingCount = stores.filter(s => !storesWithReports.has(s.id)).length

  return pendingCount
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

export default async function ReportsPage() {
  const [reports, clients, pendingCount, thisMonthCount] = await Promise.all([
    getReports(),
    getClients(),
    getPendingReportsCount(),
    getThisMonthCount()
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["view_reports"]}>
      <ReportsList
        initialReports={reports}
        clients={clients}
        totalCount={reports.length}
        thisMonthCount={thisMonthCount}
        pendingCount={pendingCount}
      />
    </PagePermissionWrapper>
  )
}
