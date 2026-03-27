import { Suspense } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { ClientsTable } from "@/components/clients/clients-table"
import { ClientsFilters } from "@/components/clients/clients-filters"
import { ImportAsaasButton } from "@/components/clients/import-asaas-button"
import { Skeleton } from "@/components/ui/skeleton"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
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

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  )
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

  const hasActiveFilters = !!(search || status || health)
  const { clients, totalCount } = await getClients({ page, search, status, health })

  return (
    <PagePermissionWrapper requiredFeatures={["create_clients"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          Gerencie sua carteira de clientes
        </p>
        <div className="flex items-center gap-2">
          <ImportAsaasButton />
          <Button asChild>
            <Link href="/clients/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <ClientsFilters />

      {/* Table */}
      <Suspense fallback={<TableSkeleton />}>
        <ClientsTable clients={clients} totalCount={totalCount} currentPage={page} hasActiveFilters={hasActiveFilters} />
      </Suspense>
    </div>
    </PagePermissionWrapper>
  )
}
