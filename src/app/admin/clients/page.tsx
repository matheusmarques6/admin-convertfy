import { Suspense } from "react"
import Link from "next/link"
import {
  Plus,
  Users,
  UserCheck,
  UserX,
  Activity,
  AlertTriangle,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ClientsTable } from "@/components/clients/clients-table"
import { ClientsFilters } from "@/components/clients/clients-filters"
import { ImportAsaasButton } from "@/components/clients/import-asaas-button"
import { Skeleton } from "@/components/ui/skeleton"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"
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

  const [
    { count: totalCount },
    { count: activeCount },
    { count: prospectCount },
    { count: onboardingCount },
    { count: churnedCount },
    { count: criticalCount },
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "prospect"),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "onboarding"),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "churned"),
    supabase.from("clients").select("*", { count: "exact", head: true }).lt("health_score", 40),
  ])

  return {
    total: totalCount || 0,
    active: activeCount || 0,
    prospect: prospectCount || 0,
    onboarding: onboardingCount || 0,
    churned: churnedCount || 0,
    critical: criticalCount || 0,
  }
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
      ))}
    </div>
  )
}

interface StatsRowProps {
  stats: {
    total: number
    active: number
    prospect: number
    onboarding: number
    churned: number
    critical: number
  }
}

function StatsRow({ stats }: StatsRowProps) {
  const activeRate = stats.total > 0
    ? Math.round((stats.active / stats.total) * 100)
    : 0

  const items = [
    {
      label: "Total de Clientes",
      value: stats.total,
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100/80 dark:bg-blue-950/60",
      borderColor: "border-blue-200 dark:border-blue-900/50",
      subtitle: null,
    },
    {
      label: "Ativos",
      value: stats.active,
      icon: UserCheck,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100/80 dark:bg-emerald-950/60",
      borderColor: "border-emerald-200 dark:border-emerald-900/50",
      subtitle: `${activeRate}% do total`,
    },
    {
      label: "Em Onboarding",
      value: stats.onboarding,
      icon: Activity,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100/80 dark:bg-amber-950/60",
      borderColor: "border-amber-200 dark:border-amber-900/50",
      subtitle: null,
    },
    {
      label: "Churned",
      value: stats.churned,
      icon: UserX,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-100/80 dark:bg-rose-950/60",
      borderColor: "border-rose-200 dark:border-rose-900/50",
      subtitle: stats.total > 0 ? `${Math.round((stats.churned / stats.total) * 100)}% do total` : null,
    },
    {
      label: "Saúde Crítica",
      value: stats.critical,
      icon: AlertTriangle,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-100/80 dark:bg-orange-950/60",
      borderColor: "border-orange-200 dark:border-orange-900/50",
      subtitle: stats.critical > 0 ? "Requer atenção" : null,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label} className={`border ${item.borderColor} transition-shadow hover:shadow-sm`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-2xl font-bold leading-none tracking-tight">{item.value}</p>
                <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
                {item.subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground/70">{item.subtitle}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
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
  const [{ clients, totalCount }, stats] = await Promise.all([
    getClients({ page, search, status, health }),
    getClientStats(),
  ])

  const statusTabs = [
    { value: "all", label: "Todos", count: stats.total },
    { value: "active", label: "Ativos", count: stats.active },
    { value: "prospect", label: "Prospect", count: stats.prospect },
    { value: "onboarding", label: "Onboarding", count: stats.onboarding },
    { value: "churned", label: "Churned", count: stats.churned },
  ]

  const currentStatusTab = status || "all"

  function buildTabHref(tabValue: string) {
    const params = new URLSearchParams()
    if (tabValue !== "all") params.set("status", tabValue)
    if (search) params.set("search", search)
    if (health) params.set("health", health)
    const qs = params.toString()
    return qs ? `/admin/clients?${qs}` : "/admin/clients"
  }

  return (
    <PagePermissionWrapper requiredFeatures={["create_clients"]}>
    <div className="space-y-6">
      {/* Page Header */}
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

      {/* Stats Summary */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsRow stats={stats} />
      </Suspense>

      {/* Status Tabs */}
      <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
        {statusTabs.map((tab) => (
          <Link
            key={tab.value}
            href={buildTabHref(tab.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              currentStatusTab === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground/80"
            )}
          >
            {tab.label}
            <Badge
              variant={currentStatusTab === tab.value ? "secondary" : "outline"}
              className="ml-0.5 h-5 min-w-[20px] px-1.5 text-[11px] tabular-nums"
            >
              {tab.count}
            </Badge>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <ClientsFilters />

        {/* Results count indicator */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {totalCount} {totalCount === 1 ? "resultado encontrado" : "resultados encontrados"}
            </Badge>
          </div>
        )}
      </div>

      {/* Table */}
      <Suspense fallback={<TableSkeleton />}>
        <ClientsTable clients={clients} totalCount={totalCount} currentPage={page} hasActiveFilters={hasActiveFilters} />
      </Suspense>
    </div>
    </PagePermissionWrapper>
  )
}
