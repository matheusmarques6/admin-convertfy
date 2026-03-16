import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import type { DashboardAlert } from "@/types"

export const dynamic = "force-dynamic"

function getWeekBounds(now: Date) {
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { weekStart: monday, weekEnd: sunday }
}

async function getDashboardData() {
  const supabase = await createClient()

  const now = new Date()
  const { weekStart, weekEnd } = getWeekBounds(now)

  // Parallel fetch: meetings, activities, tasks, week calendar, onboardings
  const [
    { data: meetings },
    { data: activities },
    { data: activeTasks },
    { data: weekMeetings },
    { data: weekTasks },
    { data: activeOnboardings },
  ] = await Promise.all([
    // Upcoming meetings
    supabase
      .from("meetings")
      .select("*")
      .eq("status", "scheduled")
      .gte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(5),
    // Recent activities
    supabase
      .from("activities")
      .select("id, type, description, created_at, client:clients(name), profile:profiles(name)")
      .order("created_at", { ascending: false })
      .limit(8),
    // Board preview: active tasks
    supabase
      .from("tasks")
      .select("id, status, due_date")
      .not("status", "in", '("completed","cancelled")'),
    // Week calendar: meetings this week
    supabase
      .from("meetings")
      .select("id, title, scheduled_at, duration_minutes, meeting_url, status")
      .eq("status", "scheduled")
      .gte("scheduled_at", weekStart.toISOString())
      .lte("scheduled_at", weekEnd.toISOString())
      .order("scheduled_at"),
    // Week calendar: tasks due this week
    supabase
      .from("tasks")
      .select("id, title, due_date, status, priority, type")
      .not("status", "in", '("completed","cancelled")')
      .gte("due_date", weekStart.toISOString())
      .lte("due_date", weekEnd.toISOString())
      .order("due_date"),
    // Onboardings
    supabase
      .from("client_onboardings")
      .select(`
        id, status, current_phase, progress_percent,
        target_completion_date,
        client:clients(id, name),
        store:client_stores(id, store_name)
      `)
      .neq("status", "completed")
      .order("target_completion_date", { ascending: true }),
  ])

  // --- Alerts: parallel fetch with joins (no N+1) ---
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const [
    { data: expiringContracts },
    { data: lowHealthClients },
    { data: overdueCharges },
    { data: storeAlerts },
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, plan_name, end_date, client:clients(id, name)")
      .eq("status", "active")
      .not("end_date", "is", null)
      .lte("end_date", thirtyDaysFromNow)
      .order("end_date", { ascending: true })
      .limit(5),
    supabase
      .from("clients")
      .select("id, name, health_score")
      .eq("status", "active")
      .lt("health_score", 30)
      .order("health_score", { ascending: true })
      .limit(5),
    supabase
      .from("client_charges")
      .select("id, description, value, due_date, client:clients(id, name)")
      .eq("status", "overdue")
      .order("due_date", { ascending: true })
      .limit(5),
    supabase
      .from("store_alerts")
      .select("id, store_id, client_id, type, severity, title, message, status, created_at, store:client_stores(store_name), client:clients(name)")
      .in("status", ["active", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(10),
  ])

  // Build alerts array
  const alerts: DashboardAlert[] = []

  overdueCharges?.forEach((c) => {
    const client = Array.isArray(c.client) ? c.client[0] : c.client
    const clientName = client?.name || "Cliente"
    alerts.push({
      id: `overdue-${c.id}`,
      type: "payment_overdue",
      title: "Pagamento vencido",
      description: `${clientName} - ${c.description || "Assinatura"} vencida em ${new Date(c.due_date).toLocaleDateString("pt-BR")}`,
      severity: "high",
    })
  })

  expiringContracts?.forEach((c) => {
    const client = Array.isArray(c.client) ? c.client[0] : c.client
    const clientName = client?.name || "Cliente"
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

  // Store alerts (from store_alerts table)
  const VALID_ALERT_TYPES: Set<DashboardAlert["type"]> = new Set([
    "payment_overdue", "contract_expiring", "health_low", "meeting_overdue",
    "report_pending", "low_revenue", "klaviyo_account_error", "campaign_failure",
    "low_recovery_rate",
  ])
  const severityMap: Record<string, "high" | "medium" | "low"> = {
    critical: "high",
    warning: "medium",
    info: "low",
  }
  storeAlerts?.forEach((sa) => {
    if (!VALID_ALERT_TYPES.has(sa.type as DashboardAlert["type"])) return
    const store = Array.isArray(sa.store) ? sa.store[0] : sa.store
    const client = Array.isArray(sa.client) ? sa.client[0] : sa.client
    const storeName = store?.store_name || "Loja"
    const clientName = client?.name
    alerts.push({
      id: `store-alert-${sa.id}`,
      type: sa.type as DashboardAlert["type"],
      title: sa.title,
      description: clientName ? `${clientName} — ${storeName}: ${sa.message}` : `${storeName}: ${sa.message}`,
      store_id: sa.store_id,
      store_name: storeName,
      client_id: sa.client_id,
      action_url: `/stores?tab=alerts`,
      severity: severityMap[sa.severity] || "low",
      created_at: sa.created_at,
    })
  })

  // Sort: high first, then medium, then low
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2))

  return {
    upcomingMeetings: meetings || [],
    activities: activities || [],
    alerts,
    activeTasks: activeTasks || [],
    weekMeetings: weekMeetings || [],
    weekTasks: weekTasks || [],
    activeOnboardings: activeOnboardings || [],
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/login")
  }

  const { data: authProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authUser.id)
    .single()

  const isAdmin = authProfile?.role === "admin"

  const { data: authOrgMember } = await supabase
    .from("org_members")
    .select("role")
    .eq("profile_id", authUser.id)
    .eq("is_active", true)
    .limit(1)
    .single()

  const userRole = isAdmin ? "owner" : (authOrgMember?.role || "support")

  const data = await getDashboardData()

  return <DashboardLayout data={data} userRole={userRole} />
}
