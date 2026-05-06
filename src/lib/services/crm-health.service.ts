/**
 * Servico de calculo e persistencia do health score CRM.
 *
 * Reutiliza a logica de scoring email/SMS do health-monitor existente
 * (delivery + open + click + bounce + spam + unsub) e adiciona:
 * - sinal de NPS recente (peso 15%)
 * - sinal de tickets abertos (peso 10%)
 * - sinal de receita 30d vs 60d-anterior (peso 15%)
 *
 * Persistencia: atualiza client_stores.health_score e insere row em
 * crm_health_history (snapshot diario, sparkline).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CrmHealthService")

interface EmailMetrics {
  recipients: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  spam: number
}

interface HealthComponents {
  email: number
  nps: number
  tickets: number
  revenue: number
}

interface StoreHealthResult {
  store_id: string
  health_score: number
  components: HealthComponents
}

function computeEmailScore(m: EmailMetrics): number {
  if (m.recipients === 0) return 50 // neutro quando nao ha envio
  const deliveryRate = m.delivered / m.recipients
  const openRate = m.delivered > 0 ? m.opened / m.delivered : 0
  const clickRate = m.delivered > 0 ? m.clicked / m.delivered : 0
  const unsubRate = m.delivered > 0 ? m.unsubscribed / m.delivered : 0
  const spamRate = m.delivered > 0 ? m.spam / m.delivered : 0

  const raw =
    openRate * 0.30 +
    clickRate * 0.25 +
    deliveryRate * 0.20 +
    Math.max(0, 1 - spamRate * 100) * 0.15 +
    Math.max(0, 1 - unsubRate * 50) * 0.10

  return Math.round(Math.max(0, Math.min(1, raw)) * 100)
}

function computeNpsScore(npsValue: number | null): number {
  if (npsValue == null) return 50 // neutro
  // NPS 0-10 → score 0-100
  return Math.round((npsValue / 10) * 100)
}

function computeTicketsScore(openTicketsCount: number, ticketsBreachingSla: number): number {
  // Penaliza por tickets em SLA breach. Sem tickets = 100. Cada SLA breach = -15.
  return Math.max(0, 100 - ticketsBreachingSla * 15 - Math.max(0, openTicketsCount - 3) * 3)
}

function computeRevenueScore(currentMonth: number, previousMonth: number): number {
  if (previousMonth === 0 && currentMonth === 0) return 50
  if (previousMonth === 0) return currentMonth > 0 ? 80 : 50
  const ratio = currentMonth / previousMonth
  // 1.0 = 70 pts; 1.2 = 90; 0.8 = 50; 0.5 = 20
  if (ratio >= 1.2) return 90
  if (ratio >= 1.0) return 70
  if (ratio >= 0.8) return 50
  if (ratio >= 0.5) return 30
  return 10
}

export async function computeStoreHealth(storeId: string, orgId: string): Promise<StoreHealthResult | null> {
  const admin = createAdminClient()

  const { data: store } = await admin
    .from("client_stores")
    .select("id, store_name, nps_last_score")
    .eq("id", storeId)
    .single()

  if (!store) return null

  // Email metrics dos ultimos 30d (campaigns + flows)
  const [campaignsRes, flowsRes] = await Promise.all([
    admin
      .from("campaign_metrics")
      .select("recipients, delivered, opened, clicked, bounced, unsubscribed, spam_complaints")
      .eq("store_id", storeId)
      .eq("period", "30d"),
    admin
      .from("flow_metrics")
      .select("recipients, delivered, opened, clicked, bounced, unsubscribed")
      .eq("store_id", storeId)
      .eq("period", "30d"),
  ])

  const allRows = [
    ...(campaignsRes.data || []).map((c) => ({
      recipients: c.recipients ?? 0,
      delivered: c.delivered ?? 0,
      opened: c.opened ?? 0,
      clicked: c.clicked ?? 0,
      bounced: c.bounced ?? 0,
      unsubscribed: c.unsubscribed ?? 0,
      spam: c.spam_complaints ?? 0,
    })),
    ...(flowsRes.data || []).map((f) => ({
      recipients: f.recipients ?? 0,
      delivered: f.delivered ?? 0,
      opened: f.opened ?? 0,
      clicked: f.clicked ?? 0,
      bounced: f.bounced ?? 0,
      unsubscribed: f.unsubscribed ?? 0,
      spam: 0,
    })),
  ]

  const emailMetrics: EmailMetrics = {
    recipients: allRows.reduce((s, r) => s + r.recipients, 0),
    delivered: allRows.reduce((s, r) => s + r.delivered, 0),
    opened: allRows.reduce((s, r) => s + r.opened, 0),
    clicked: allRows.reduce((s, r) => s + r.clicked, 0),
    bounced: allRows.reduce((s, r) => s + r.bounced, 0),
    unsubscribed: allRows.reduce((s, r) => s + r.unsubscribed, 0),
    spam: allRows.reduce((s, r) => s + r.spam, 0),
  }

  // Tickets (pipeline scope=cs, com nome contendo "Tickets")
  const { data: ticketsPipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("scope", "cs")
    .ilike("name", "%Tickets%")
    .eq("is_archived", false)
    .maybeSingle()

  let openTickets = 0
  let breachingSla = 0
  if (ticketsPipeline) {
    const { data: storeTickets } = await admin
      .from("deals")
      .select("id, last_stage_changed_at, stage:pipeline_stages(sla_hours)")
      .eq("pipeline_id", ticketsPipeline.id)
      .eq("status", "open")
      .eq("store_id", storeId)

    for (const t of storeTickets || []) {
      openTickets += 1
      const stage = Array.isArray((t as any).stage) ? (t as any).stage[0] : (t as any).stage
      const sla = stage?.sla_hours
      if (sla && t.last_stage_changed_at) {
        const elapsedHours = (Date.now() - new Date(t.last_stage_changed_at).getTime()) / 3600000
        if (elapsedHours > sla) breachingSla += 1
      }
    }
  }

  // Revenue 30d vs 60-30 (mes anterior). Usa store_revenue_summary se existe.
  let currentMonth = 0
  let previousMonth = 0
  const { data: revRows } = await admin
    .from("store_revenue_summary")
    .select("period, total_revenue")
    .eq("store_id", storeId)
    .in("period", ["30d", "60d"])

  for (const r of revRows || []) {
    if (r.period === "30d") currentMonth = r.total_revenue || 0
    if (r.period === "60d") {
      // 60d cobre os ultimos 60 dias; mes anterior = 60d - 30d
      const sixty = r.total_revenue || 0
      previousMonth = Math.max(0, sixty - currentMonth)
    }
  }

  const components: HealthComponents = {
    email: computeEmailScore(emailMetrics),
    nps: computeNpsScore((store as any).nps_last_score ?? null),
    tickets: computeTicketsScore(openTickets, breachingSla),
    revenue: computeRevenueScore(currentMonth, previousMonth),
  }

  // Pesos: email 35%, revenue 30%, tickets 20%, nps 15%
  const score = Math.round(
    components.email * 0.35 +
      components.revenue * 0.30 +
      components.tickets * 0.20 +
      components.nps * 0.15,
  )

  // Persiste
  await admin
    .from("client_stores")
    .update({ health_score: score })
    .eq("id", storeId)

  await admin.from("crm_health_history").insert({
    store_id: storeId,
    health_score: score,
    components,
  })

  log.info("[CrmHealth] computed", { store_id: storeId, score, components })

  return { store_id: storeId, health_score: score, components }
}

export async function computeAllStoresHealth(): Promise<{ total: number; ok: number; errors: number }> {
  const admin = createAdminClient()

  const { data: stores } = await admin
    .from("client_stores")
    .select("id, org_id")
    .eq("is_active", true)

  if (!stores || stores.length === 0) {
    return { total: 0, ok: 0, errors: 0 }
  }

  let ok = 0
  let errors = 0

  for (const s of stores) {
    try {
      const result = await computeStoreHealth(s.id, s.org_id)
      if (result) ok += 1
      else errors += 1
    } catch (err) {
      log.error("[CrmHealth] store error", { store_id: s.id, err })
      errors += 1
    }
  }

  return { total: stores.length, ok, errors }
}
