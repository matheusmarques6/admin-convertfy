import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardAlerts } from "@/components/dashboard/alerts"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { TotalRevenueBanner } from "@/components/dashboard/total-revenue-banner"
import { TodayAgenda } from "@/components/dashboard/today-agenda"
import type { DashboardAlert } from "@/types"

export const dynamic = "force-dynamic"

async function getDashboardData() {
  const supabase = await createClient()

  const now = new Date()

  // Fetch upcoming meetings
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5)

  // --- Recent activities ---
  const { data: activities } = await supabase
    .from("activities")
    .select("id, type, description, created_at, client:clients(name), profile:profiles(name)")
    .order("created_at", { ascending: false })
    .limit(8)

  // --- Alerts: contracts expiring in 30 days ---
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expiringContracts } = await supabase
    .from("contracts")
    .select("id, plan_name, end_date, client_id")
    .eq("status", "active")
    .not("end_date", "is", null)
    .lte("end_date", thirtyDaysFromNow)
    .order("end_date", { ascending: true })
    .limit(5)

  const expiringClientIds = [...new Set(expiringContracts?.map((c) => c.client_id).filter(Boolean) || [])]
  const { data: expiringClients } = expiringClientIds.length > 0
    ? await supabase.from("clients").select("id, name").in("id", expiringClientIds)
    : { data: [] }
  const expiringClientMap = new Map(expiringClients?.map((c) => [c.id, c.name]) || [])

  // --- Alerts: clients with low health score ---
  const { data: lowHealthClients } = await supabase
    .from("clients")
    .select("id, name, health_score")
    .eq("status", "active")
    .lt("health_score", 30)
    .order("health_score", { ascending: true })
    .limit(5)

  // --- Alerts: overdue charges ---
  const { data: overdueCharges } = await supabase
    .from("client_charges")
    .select("id, description, value, due_date, client_id")
    .eq("status", "overdue")
    .order("due_date", { ascending: true })
    .limit(5)

  const overdueClientIds = [...new Set(overdueCharges?.map((c) => c.client_id).filter(Boolean) || [])]
  const { data: overdueClients } = overdueClientIds.length > 0
    ? await supabase.from("clients").select("id, name").in("id", overdueClientIds)
    : { data: [] }
  const overdueClientMap = new Map(overdueClients?.map((c) => [c.id, c.name]) || [])

  // Build alerts array
  const alerts: DashboardAlert[] = []

  overdueCharges?.forEach((c) => {
    const clientName = overdueClientMap.get(c.client_id) || "Cliente"
    alerts.push({
      id: `overdue-${c.id}`,
      type: "payment_overdue",
      title: "Pagamento vencido",
      description: `${clientName} - ${c.description || "Cobrança"} vencida em ${new Date(c.due_date).toLocaleDateString("pt-BR")}`,
      severity: "high",
    })
  })

  expiringContracts?.forEach((c) => {
    const clientName = expiringClientMap.get(c.client_id) || "Cliente"
    alerts.push({
      id: `contract-${c.id}`,
      type: "contract_expiring",
      title: "Contrato expirando",
      description: `${clientName} - ${c.plan_name} expira em ${new Date(c.end_date!).toLocaleDateString("pt-BR")}`,
      severity: "medium",
    })
  })

  lowHealthClients?.forEach((c) => {
    alerts.push({
      id: `health-${c.id}`,
      type: "health_low",
      title: "Health score baixo",
      description: `${c.name} está com score ${c.health_score}/100`,
      severity: "low",
    })
  })

  return {
    upcomingMeetings: meetings || [],
    activities: activities || [],
    alerts,
  }
}

export default async function DashboardPage() {
  const supabase2 = await createClient()
  const { data: { user: authUser } } = await supabase2.auth.getUser()

  if (!authUser) {
    redirect("/login")
  }

  const { data: authProfile } = await supabase2
    .from("profiles")
    .select("role")
    .eq("id", authUser.id)
    .single()

  const isAdmin = authProfile?.role === "admin"

  if (!isAdmin) {
    const { data: authOrgMember } = await supabase2
      .from("org_members")
      .select("role")
      .eq("profile_id", authUser.id)
      .eq("is_active", true)
      .limit(1)
      .single()

    if (authOrgMember?.role !== "owner") {
      redirect("/dashboard/operational")
    }
  }

  const data = await getDashboardData()

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <QuickActions />

      {/* Revenue Banner - Resultado Total Klaviyo */}
      <TotalRevenueBanner />

      {/* Operational Content */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        <TodayAgenda meetings={data.upcomingMeetings} />
        <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
        <RecentActivity activities={data.activities} />
      </div>
    </div>
  )
}
