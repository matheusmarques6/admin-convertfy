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
import { syncCarteiraDeal } from "./cs-pipelines-sync.service"
import { getUnifiedRevenue } from "./unified-metrics.service"

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
  /** null = nenhum componente com dado real → no_score honesto. */
  health_score: number | null
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

/** Exportada para teste. */
export function computeRevenueScore(currentMonth: number, previousMonth: number): number {
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

/**
 * Deriva "mês atual" vs "mês anterior" das janelas 30d/90d de
 * store_revenue_summary (via getUnifiedRevenue). Como a tabela não tem
 * janela 60d, o mês anterior é a MÉDIA MENSAL dos 60 dias que antecedem
 * o mês atual: (rev90d − rev30d) / 2. Pura — exportada para teste.
 *
 * Histórico: até jul/2026 esta parte consultava colunas inexistentes
 * (`period`, `total_revenue`) e o período inválido '60d' — a query
 * falhava SEMPRE (erro engolido) e o componente revenue era neutro (50)
 * para toda loja, achatando o health score da carteira inteira na faixa
 * "Atenção".
 */
export function deriveRevenueMonths(
  rows: Array<{ period_label: string; total_revenue: number }>,
): { currentMonth: number; previousMonth: number } {
  let rev30 = 0
  let rev90 = 0
  for (const r of rows) {
    if (r.period_label === "30d") rev30 += r.total_revenue || 0
    else if (r.period_label === "90d") rev90 += r.total_revenue || 0
  }
  const previousMonth = rev90 > rev30 ? (rev90 - rev30) / 2 : 0
  return { currentMonth: rev30, previousMonth }
}

export async function computeStoreHealth(storeId: string, orgId: string): Promise<StoreHealthResult | null> {
  const admin = createAdminClient()

  type StoreNps = { id: string; store_name: string; nps_last_score: number | null }
  const { data: store } = await admin
    .from("client_stores")
    .select("id, store_name, nps_last_score")
    .eq("id", storeId)
    .single<StoreNps>()

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
  // ticketsTracked = a loja tem histórico de tickets (aberto ou já
  // resolvido). Sem histórico, o componente tickets é AUSENTE (não conta
  // como 100 neutro) — antes esse 100 fixo inflava toda a carteira.
  let ticketsTracked = false
  if (ticketsPipeline) {
    type TicketRow = {
      id: string
      status: string
      last_stage_changed_at: string | null
      stage: { sla_hours: number | null } | { sla_hours: number | null }[] | null
    }
    const { data: storeTickets } = await admin
      .from("deals")
      .select("id, status, last_stage_changed_at, stage:pipeline_stages(sla_hours)")
      .eq("pipeline_id", ticketsPipeline.id)
      .eq("store_id", storeId)
      .returns<TicketRow[]>()

    ticketsTracked = (storeTickets?.length ?? 0) > 0
    for (const t of storeTickets || []) {
      if (t.status !== "open") continue
      openTickets += 1
      const stage = Array.isArray(t.stage) ? t.stage[0] : t.stage
      const sla = stage?.sla_hours
      if (sla && t.last_stage_changed_at) {
        const elapsedHours = (Date.now() - new Date(t.last_stage_changed_at).getTime()) / 3600000
        if (elapsedHours > sla) breachingSla += 1
      }
    }
  }

  // Revenue: mês atual (30d) vs média mensal dos 60 dias anteriores
  // (derivada de 90d−30d). Reusa getUnifiedRevenue — mesma fonte e
  // mesmo unificador Klaviyo/Omnisend do dashboard. Falha de query NÃO
  // é engolida: loga e mantém neutro (50) explícito.
  let currentMonth = 0
  let previousMonth = 0
  // revenueTracked = a query trouxe receita real (atual ou anterior). Sem
  // receita, o componente é AUSENTE (não conta como 50 neutro).
  let revenueTracked = false
  try {
    const revRows = await getUnifiedRevenue(admin, orgId, ["30d", "90d"], [storeId])
    const months = deriveRevenueMonths(revRows)
    currentMonth = months.currentMonth
    previousMonth = months.previousMonth
    revenueTracked = currentMonth > 0 || previousMonth > 0
  } catch (err) {
    log.warn("health.revenue_query_failed (componente revenue fica ausente)", {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const components: HealthComponents = {
    email: computeEmailScore(emailMetrics),
    nps: computeNpsScore(store.nps_last_score ?? null),
    tickets: computeTicketsScore(openTickets, breachingSla),
    revenue: computeRevenueScore(currentMonth, previousMonth),
  }

  // Renormalização por componente disponível. Só entram na média ponderada
  // os componentes com dado REAL; componente ausente é excluído (não vira
  // constante neutra/alta) e os pesos são renormalizados sobre os presentes.
  // Antes, NPS ausente virava 50 e tickets ausente virava 100 — ~27,5 pts
  // fixos que achatavam toda a carteira na faixa "Atenção" (50-69). Loja sem
  // nenhum sinal => score null (no_score honesto), não um número inventado.
  const presence: Record<keyof HealthComponents, boolean> = {
    email: emailMetrics.recipients > 0,
    revenue: revenueTracked,
    tickets: ticketsTracked,
    nps: store.nps_last_score != null,
  }
  const weights: Record<keyof HealthComponents, number> = {
    email: 0.35, revenue: 0.30, tickets: 0.20, nps: 0.15,
  }
  let weightSum = 0
  let weighted = 0
  for (const k of ["email", "revenue", "tickets", "nps"] as const) {
    if (!presence[k]) continue
    weightSum += weights[k]
    weighted += components[k] * weights[k]
  }
  const score = weightSum > 0 ? Math.round(weighted / weightSum) : null

  // Persiste (health_score aceita null → vira no_score na distribuição)
  await admin
    .from("client_stores")
    .update({ health_score: score })
    .eq("id", storeId)

  // crm_health_history.health_score é NOT NULL — só registra snapshot com score.
  if (score != null) {
    await admin.from("crm_health_history").insert({
      store_id: storeId,
      health_score: score,
      components,
    })
  }

  // Auto-cria store_alert health_critical quando score cai pra <50 e
  // nao ha alerta ativo pra essa loja ainda. Idempotente (dedup por
  // store_id+type+status='active').
  if (score != null && score < 50) {
    await maybeCreateHealthAlert(storeId, score, components)
  }

  // Sincroniza com o pipeline "Gestao de Carteira" (state-board CS):
  // move o deal entre Saudavel/Atencao/Risco conforme novo score, ou
  // pra Churn se a loja virou inativa. NAO mexe em deals em stages
  // manuais (Em recuperacao / Churn iminente). Score null (sem dado) não
  // move de stage.
  if (score != null) {
    syncCarteiraDeal({ storeId, healthScore: score }).catch((err) => {
      log.warn("syncCarteiraDeal falhou (nao bloqueia)", {
        storeId,
        err: err instanceof Error ? err.message : String(err),
      })
    })
  }

  log.info("[CrmHealth] computed", { store_id: storeId, score, components })

  return { store_id: storeId, health_score: score, components }
}

/**
 * Cria store_alert health_critical se nao houver um ativo pra essa loja.
 * Substituiu o antigo fluxo que criava crm_leads scope=cs (redundante
 * com clients/client_stores). Alerta vive na loja, visivel na aba
 * "Alertas" do detalhe da loja.
 */
async function maybeCreateHealthAlert(
  storeId: string,
  score: number,
  components: HealthComponents,
): Promise<void> {
  const admin = createAdminClient()

  // Ja existe alerta ativo pra essa loja nesse tipo?
  const { data: existing } = await admin
    .from("store_alerts")
    .select("id")
    .eq("store_id", storeId)
    .eq("type", "health_critical")
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  if (existing) return

  // Busca client_id da loja (FK requerida em store_alerts)
  const { data: store } = await admin
    .from("client_stores")
    .select("client_id, store_name")
    .eq("id", storeId)
    .maybeSingle()

  if (!store?.client_id) return

  const componentsSummary = Object.entries(components)
    .filter(([, v]) => (v as number) < 50)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ")

  const severity = score < 30 ? "critical" : "warning"

  const { error } = await admin.from("store_alerts").insert({
    store_id: storeId,
    client_id: store.client_id,
    type: "health_critical",
    severity,
    title: `Health score critico: ${score}/100`,
    message: `Sinais fracos: ${componentsSummary || "geral"}. Acionar CSM pra diagnostico.`,
    status: "active",
    metadata: {
      score,
      components,
      source: "cron:health-compute",
    },
  })

  if (error) {
    log.warn("[CrmHealth] Falha criando health_critical alert", {
      store_id: storeId,
      error: error.message,
    })
  } else {
    log.info("[CrmHealth] health_critical alert criado", {
      store_id: storeId,
      score,
    })
  }
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
