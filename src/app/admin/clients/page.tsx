import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { ImportAsaasButton } from "@/components/clients/import-asaas-button"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { ClientsContent } from "@/components/clients/clients-content"
import { sanitizeSearch } from "@/lib/utils/sanitize-search"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

const VALID_STATUSES = ["active", "inactive", "prospect", "onboarding", "churned"] as const
const VALID_HEALTH = ["good", "warning", "critical"] as const

interface ClientFilters {
  page: number
  search?: string
  status?: string
  health?: string
}

async function getClients(filters: ClientFilters) {
  const supabase = await createClient()
  const { page, search, status, health } = filters

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from("clients")
    .select(`
      *,
      contracts (
        id,
        plan_name,
        monthly_value,
        status
      ),
      owner:profiles!clients_owner_id_fkey (
        id,
        name,
        avatar_url
      ),
      client_stores (
        id,
        store_name,
        platform,
        is_active
      )
    `, { count: 'exact' })

  // Text search filter (with ILIKE character sanitization)
  if (search) {
    const safe = sanitizeSearch(search)
    const pattern = `%${safe}%`
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`)
  }

  // Status filter
  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  // Health score filter
  // NOTE: Clients with health_score NULL are excluded from all health filters.
  // This is expected behavior since the schema has DEFAULT 50 - NULLs indicate inconsistent data.
  if (health && health !== "all") {
    if (health === "good") {
      query = query.gte("health_score", 70)
    } else if (health === "warning") {
      query = query.gte("health_score", 40).lt("health_score", 70)
    } else if (health === "critical") {
      query = query.lt("health_score", 40)
    }
  }

  const { data: clients, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    console.error("Error fetching clients:", error)
    return { clients: [], totalCount: 0 }
  }

  return { clients: clients || [], totalCount: count || 0 }
}

async function getClientStats() {
  const supabase = await createClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalCount },
    { count: activeCount },
    { count: prospectCount },
    { count: onboardingCount },
    { count: churnedCount },
    { count: criticalCount },
    { count: newLast30 },
    { count: newPrev30 },
    { count: churnedLast30 },
    { count: churnedPrev30 },
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "prospect"),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "onboarding"),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "churned"),
    supabase.from("clients").select("*", { count: "exact", head: true }).lt("health_score", 40),
    supabase.from("clients").select("*", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    supabase.from("clients").select("*", { count: "exact", head: true }).gte("created_at", sixtyDaysAgo).lt("created_at", thirtyDaysAgo),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "churned").gte("updated_at", thirtyDaysAgo),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "churned").gte("updated_at", sixtyDaysAgo).lt("updated_at", thirtyDaysAgo),
  ])

  return {
    total: totalCount || 0,
    active: activeCount || 0,
    prospect: prospectCount || 0,
    onboarding: onboardingCount || 0,
    churned: churnedCount || 0,
    critical: criticalCount || 0,
    trends: {
      newLast30: newLast30 || 0,
      newPrev30: newPrev30 || 0,
      churnedLast30: churnedLast30 || 0,
      churnedPrev30: churnedPrev30 || 0,
    },
  }
}

interface PageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    status?: string
    health?: string
  }>
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, Math.floor(Number(params.page) || 1))
  const search = params.search?.trim() || undefined
  const status = VALID_STATUSES.includes(params.status as typeof VALID_STATUSES[number]) ? params.status : undefined
  const health = VALID_HEALTH.includes(params.health as typeof VALID_HEALTH[number]) ? params.health : undefined

  const [{ clients, totalCount }, stats] = await Promise.all([
    getClients({ page, search, status, health }),
    getClientStats(),
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["create_clients"]}>
      <div className="space-y-6">
        {/* Page Header — DS v3.0 Rule 14 (inline icon, no circle) */}
        <PageHeader
          icon={Users}
          title="Clientes"
          badge={stats.total}
          description="Gerencie sua carteira e acompanhe a saúde de cada conta"
          actions={
            <>
              <ImportAsaasButton />
              <Button asChild>
                <Link href="/admin/clients/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Cliente
                </Link>
              </Button>
            </>
          }
        />

        {/* Client content: StatusTabs + Filters + DataTable */}
        <ClientsContent
          clients={clients}
          totalCount={totalCount}
          currentPage={page}
          stats={stats}
          currentStatus={status}
          currentSearch={search}
          currentHealth={health}
        />
      </div>
    </PagePermissionWrapper>
  )
}
