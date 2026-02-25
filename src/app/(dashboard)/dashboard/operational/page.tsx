import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { TotalRevenueBanner } from "@/components/dashboard/total-revenue-banner"
import { OperationalMetrics } from "@/components/dashboard/operational/operational-metrics"
import { NewClients } from "@/components/dashboard/operational/new-clients"
import { NewStores } from "@/components/dashboard/operational/new-stores"
import { OperationalAlerts } from "@/components/dashboard/operational/operational-alerts"
import { OperationalOverview } from "@/components/dashboard/operational/operational-overview"
import type { DashboardAlert } from "@/types"

export const dynamic = "force-dynamic"

async function getOperationalData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // 1. Buscar org_member do agente
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("id, role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember) redirect("/login")

  // Se e admin/owner, redirecionar para dashboard admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role === "admin" || orgMember.role === "owner") {
    redirect("/dashboard")
  }

  // 2. Buscar lojas que o agente tem acesso
  const { data: storeAccess } = await supabase
    .from("agent_store_access")
    .select(`
      store_id,
      can_view,
      can_edit,
      can_manage_onboarding,
      can_manage_campaigns,
      can_manage_reports,
      store:client_stores(
        id,
        store_name,
        store_url,
        platform,
        is_active,
        client_id,
        created_at,
        client:clients(id, name, email, status, health_score, created_at)
      )
    `)
    .eq("org_member_id", orgMember.id)
    .eq("can_view", true)

  if (!storeAccess || storeAccess.length === 0) {
    return {
      storeIds: [],
      clientIds: [],
      metrics: { activeClients: 0, activeStores: 0, pendingTasks: 0, activeOnboardings: 0 },
      newClients: [],
      newStores: [],
      alerts: [],
      recentActivities: [],
      onboardings: [],
    }
  }

  // 3. Extrair IDs unicos
  const storeIds = storeAccess.map(a => {
    const store = Array.isArray(a.store) ? a.store[0] : a.store
    return store?.id
  }).filter(Boolean) as string[]

  const clientIds = [...new Set(
    storeAccess.map(a => {
      const store = Array.isArray(a.store) ? a.store[0] : a.store
      const client = store?.client
      const c = Array.isArray(client) ? client[0] : client
      return c?.id
    }).filter(Boolean) as string[]
  )]

  // 4. Buscar dados em paralelo
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    { data: newClientsData },
    { data: newStoresData },
    { data: onboardingsData },
    { data: tasksData },
    { data: activitiesData },
    { data: expiringContracts },
    { data: lowHealthClients },
    { data: overdueCharges },
  ] = await Promise.all([
    // Novos clientes (ultimos 30 dias, do escopo do agente)
    supabase
      .from("clients")
      .select("id, name, email, status, health_score, created_at, owner_id")
      .in("id", clientIds.length > 0 ? clientIds : ["__none__"])
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(10),

    // Novas lojas (em onboarding ou recem-criadas)
    supabase
      .from("client_stores")
      .select(`
        id, store_name, store_url, platform, is_active, created_at,
        client:clients(id, name, status),
        onboardings:client_onboardings(id, status, progress_percent, target_completion_date)
      `)
      .in("id", storeIds.length > 0 ? storeIds : ["__none__"])
      .order("created_at", { ascending: false })
      .limit(10),

    // Onboardings ativos
    supabase
      .from("client_onboardings")
      .select(`
        id, status, progress_percent, target_completion_date, started_at,
        client:clients(id, name),
        store:client_stores(id, store_name, platform),
        steps:client_onboarding_steps(id, status, name)
      `)
      .in("store_id", storeIds.length > 0 ? storeIds : ["__none__"])
      .in("status", ["not_started", "in_progress", "paused"])
      .order("created_at", { ascending: false })
      .limit(10),

    // Tasks pendentes do agente
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, type")
      .eq("assignee_id", orgMember.id)
      .in("status", ["pending", "in_progress", "blocked", "review"])
      .order("due_date", { ascending: true })
      .limit(20),

    // Atividades recentes (dos clientes do agente)
    supabase
      .from("activities")
      .select("id, type, description, created_at, client:clients(name), profile:profiles(name)")
      .in("client_id", clientIds.length > 0 ? clientIds : ["__none__"])
      .order("created_at", { ascending: false })
      .limit(8),

    // Contratos expirando (dos clientes do agente)
    supabase
      .from("contracts")
      .select("id, plan_name, end_date, client_id")
      .eq("status", "active")
      .in("client_id", clientIds.length > 0 ? clientIds : ["__none__"])
      .not("end_date", "is", null)
      .lte("end_date", new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("end_date", { ascending: true })
      .limit(5),

    // Clientes com health score baixo
    supabase
      .from("clients")
      .select("id, name, health_score")
      .in("id", clientIds.length > 0 ? clientIds : ["__none__"])
      .eq("status", "active")
      .lt("health_score", 30)
      .order("health_score", { ascending: true })
      .limit(5),

    // Cobrancas vencidas
    supabase
      .from("client_charges")
      .select("id, description, value, due_date, client_id")
      .in("client_id", clientIds.length > 0 ? clientIds : ["__none__"])
      .eq("status", "overdue")
      .order("due_date", { ascending: true })
      .limit(5),
  ])

  // 5. Calcular metricas
  const activeClients = [...new Set(
    storeAccess
      .map(a => {
        const store = Array.isArray(a.store) ? a.store[0] : a.store
        const client = store?.client
        const c = Array.isArray(client) ? client[0] : client
        return c?.status === "active" ? c.id : null
      })
      .filter(Boolean)
  )].length

  const activeStores = storeAccess.filter(a => {
    const store = Array.isArray(a.store) ? a.store[0] : a.store
    return store?.is_active
  }).length

  const pendingTasks = tasksData?.length || 0

  const activeOnboardings = onboardingsData?.filter(
    o => o.status === "in_progress" || o.status === "not_started"
  ).length || 0

  // 6. Construir alertas
  const alerts: DashboardAlert[] = []

  const clientNameMap = new Map<string, string>()
  storeAccess.forEach(a => {
    const store = Array.isArray(a.store) ? a.store[0] : a.store
    const client = store?.client
    const c = Array.isArray(client) ? client[0] : client
    if (c?.id && c?.name) clientNameMap.set(c.id, c.name)
  })

  overdueCharges?.forEach(c => {
    alerts.push({
      id: `overdue-${c.id}`,
      type: "payment_overdue",
      title: "Pagamento vencido",
      description: `${clientNameMap.get(c.client_id) || "Cliente"} - ${c.description || "Cobranca"} vencida em ${new Date(c.due_date).toLocaleDateString("pt-BR")}`,
      severity: "high",
    })
  })

  expiringContracts?.forEach(c => {
    alerts.push({
      id: `contract-${c.id}`,
      type: "contract_expiring",
      title: "Contrato expirando",
      description: `${clientNameMap.get(c.client_id) || "Cliente"} - ${c.plan_name} expira em ${new Date(c.end_date!).toLocaleDateString("pt-BR")}`,
      severity: "medium",
    })
  })

  lowHealthClients?.forEach(c => {
    alerts.push({
      id: `health-${c.id}`,
      type: "health_low",
      title: "Health score baixo",
      description: `${c.name} esta com score ${c.health_score}/100`,
      severity: "low",
    })
  })

  return {
    storeIds,
    clientIds,
    metrics: {
      activeClients,
      activeStores,
      pendingTasks,
      activeOnboardings,
    },
    newClients: newClientsData || [],
    newStores: newStoresData || [],
    alerts,
    recentActivities: activitiesData || [],
    onboardings: onboardingsData || [],
  }
}

export default async function OperationalDashboardPage() {
  const data = await getOperationalData()

  return (
    <AnimatedContainer className="space-y-6">
      {/* Resultado Total - filtrado pelas lojas do agente */}
      <AnimatedItem>
        <TotalRevenueBanner storeIds={data.storeIds} />
      </AnimatedItem>

      {/* Overview Cards */}
      <AnimatedItem>
        <OperationalMetrics metrics={data.metrics} />
      </AnimatedItem>

      {/* Grid: Novos Clientes + Lojas | Alertas + Overview */}
      <AnimatedItem>
        <div className="grid gap-6 lg:grid-cols-7">
          <div className="col-span-full lg:col-span-4 space-y-6">
            <NewClients clients={data.newClients} />
            <NewStores stores={data.newStores} />
          </div>
          <div className="col-span-full lg:col-span-3 space-y-6">
            <OperationalAlerts alerts={data.alerts} />
            <OperationalOverview
              activities={data.recentActivities}
              onboardings={data.onboardings}
              pendingTasks={data.metrics.pendingTasks}
            />
          </div>
        </div>
      </AnimatedItem>
    </AnimatedContainer>
  )
}
