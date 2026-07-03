/**
 * Report Snapshot Service
 *
 * Monta o snapshot cristalizado do relatório mensal (client_monthly_reports).
 * Extraído das rotas de criação (admin/stores/[id]/reports) e resync
 * (admin/stores/reports/[reportId]/resync), que antes duplicavam ~180 linhas
 * desta lógica com pequenas divergências.
 *
 * Correções da auditoria de divergências (Clube Rock jun/2026):
 *  - F1: pedidos da LOJA e pedidos ATRIBUÍDOS são KPIs separados
 *        (`pedidos_loja` / `pedidos_atribuidos`). O campo legado `pedidos`
 *        mantém a semântica histórica (loja).
 *  - F2: contagem de campanhas usa `overview.campaignsInPeriod` (filtrada
 *        por período no report-builder) — `summary.sentCampaigns` conta
 *        TODAS as campanhas persistidas da conta e foi removida da cadeia.
 *  - F3/F4: métricas agregadas de engajamento/entregabilidade preferem o
 *        bloco `deliverability` (Reports API da Omnisend, send-date, sem o
 *        overcount de "únicos" recontados por bucket diário) quando
 *        presente; a soma de rows top-10 é só fallback.
 *  - F5: resolução por PRESENÇA explícita (`num`/`firstPresent`) em vez de
 *        `Number(x) || y` — zero legítimo não cai mais para o fallback e
 *        dado ausente vira `null` no snapshot (slides exibem "—").
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { fetchOmnisendCampaignReports } from "@/lib/integrations/omnisend/reports-api"
import { offsetForCurrency } from "@/lib/integrations/omnisend/timezone"
import { logger } from "@/lib/logger"

const log = logger.child("ReportSnapshot")

// ─── Tipos ───────────────────────────────────────────────────────────────

type Json = Record<string, unknown>

export interface SnapshotRow extends Json {
  id: string
  name: string
  revenue: number
  revenue_estimated?: boolean
}

export interface SnapshotSources {
  reportRes: Json | null
  campaignsRes: Json | null
  flowsRes: Json | null
  shopifyRes: Json | null
  cachedSummary: Json | null
  cacheCampaigns: SnapshotRow[]
  cacheFlows: SnapshotRow[]
  /** Resultado do fetchOmnisendCampaignReports (byDate) ou null. */
  reportsByDate: Array<{
    marketingActivityID: string
    attributedRevenue: number
    byDate?: Map<string, number>
  }> | null
}

export interface SnapshotKpis {
  receita_total: number | null
  /** LEGADO: pedidos da LOJA (semântica histórica mantida). */
  pedidos: number | null
  /** Pedidos da loja no período — explícito. */
  pedidos_loja: number | null
  /** Pedidos atribuídos aos canais de email/SMS (F1). */
  pedidos_atribuidos: number | null
  ticket_medio: number | null
  /** receita_atribuida / pedidos_atribuidos (F1). */
  ticket_medio_atribuido: number | null
  novos_clientes: number | null
  total_leads: number | null
  receita_atribuida: number | null
  receita_campanhas: number | null
  receita_flows: number | null
  atribuicao_pct: number | null
  envios: number | null
  open_rate: number | null
  click_rate: number | null
  ctor: number | null
  bounce_rate: number | null
  unsub_rate: number | null
  /** Únicos consolidados da Reports API (null p/ Klaviyo — sem equivalente). */
  opened_unique: number | null
  clicked_unique: number | null
  spam_rate: number | null
  recovery_rate: number | null
  total_campaigns: number | null
  total_flows: number | null
}

export interface ReportSnapshotCore {
  generated_at: string
  period: { start: string; end: string }
  account: { currency: string; platform: string | null }
  kpis: SnapshotKpis
  email: {
    delivered: number | null
    opened: number | null
    clicked: number | null
    open_rate: number | null
    click_rate: number | null
    ctor: number | null
    bounce_rate: number | null
    unsub_rate: number | null
    /** "reports-api" = agregados consolidados; "rows" = soma dos top-10. */
    source: "reports-api" | "rows"
  }
  campaigns: SnapshotRow[]
  flows: SnapshotRow[]
}

// ─── Helpers de presença explícita (F5) ─────────────────────────────────

/**
 * Lê um campo numérico distinguindo AUSENTE de ZERO:
 *  - objeto null / campo inexistente / NaN → null (ausente)
 *  - 0 → 0 (zero legítimo, NÃO cai pro fallback)
 */
export function num(obj: Json | null | undefined, key: string): number | null {
  if (!obj || !(key in obj)) return null
  const v = obj[key]
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Primeiro valor PRESENTE (0 conta como presente; null/undefined não). */
export function firstPresent(
  ...vals: Array<number | null | undefined>
): number | null {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v
  }
  return null
}

export function sumField(rows: Json[], field: string): number {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
}

// ─── Distribuição de receita per-row (movida das rotas, sem mudanças) ───

/**
 * Atribui revenue real do Reports API matchando pelo dia do sendTime.
 * 1 campanha no dia → valor exato; N campanhas → split por share de
 * delivered com flag `revenue_estimated`.
 */
export function matchByDate<T extends Json>(
  campaigns: T[],
  reports: Array<{
    marketingActivityID: string
    attributedRevenue: number
    byDate?: Map<string, number>
  }>,
): T[] {
  const revenueByDay = new Map<string, number>()
  for (const r of reports) {
    if (!r.byDate) continue
    for (const [day, rev] of r.byDate.entries()) {
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + rev)
    }
  }
  const campaignsByDay = new Map<string, T[]>()
  for (const c of campaigns) {
    const sendTime = c.sendTime as string | undefined
    if (!sendTime) continue
    const day = sendTime.slice(0, 10)
    const arr = campaignsByDay.get(day) ?? []
    arr.push(c)
    campaignsByDay.set(day, arr)
  }
  const result = campaigns.map((c) => ({ ...c } as Json))
  for (const [day, dayCamps] of campaignsByDay.entries()) {
    const dayRevenue = revenueByDay.get(day) ?? 0
    if (dayRevenue <= 0) continue
    const totalDelivered =
      dayCamps.reduce(
        (s, x) => s + (Number(x.delivered) || Number(x.recipients) || 0),
        0,
      ) || 1
    for (const c of dayCamps) {
      const idx = result.findIndex((x) => x.id === c.id)
      if (idx >= 0) {
        const share =
          (Number(c.delivered) || Number(c.recipients) || 0) / totalDelivered
        result[idx].revenue = dayRevenue * share
        // Uma campanha no dia = exata; várias = estimada por share
        result[idx].revenue_estimated = dayCamps.length > 1
      }
    }
  }
  return result as T[]
}

/**
 * Distribuição proporcional por delivered quando per-row revenue vier
 * zerado (fallback se Reports API falhar). Sempre marca revenue_estimated.
 */
export function distributeRevenue<T extends Json>(
  rows: T[],
  totalRevenue: number,
): T[] {
  const sumRow = sumField(rows, "revenue")
  if (sumRow > 0 || totalRevenue <= 0 || rows.length === 0) return rows
  const weights = rows.map(
    (r) => Number(r.delivered) || Number(r.recipients) || 0,
  )
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight === 0) return rows
  return rows.map((r, i) => ({
    ...r,
    revenue: (totalRevenue * weights[i]) / totalWeight,
    revenue_estimated: true,
  }))
}

// ─── Core PURO: resolve KPIs a partir das fontes ─────────────────────────

export function buildReportSnapshot(params: {
  sources: SnapshotSources
  periodStart: string
  periodEnd: string
}): ReportSnapshotCore {
  const { sources, periodStart, periodEnd } = params
  const {
    reportRes,
    campaignsRes,
    flowsRes,
    shopifyRes,
    cachedSummary,
    cacheCampaigns,
    cacheFlows,
    reportsByDate,
  } = sources

  const rv = (reportRes?.revenue ?? null) as Json | null
  const overview = (reportRes?.overview ?? null) as Json | null
  const ep = (reportRes?.emailPerformance ?? null) as Json | null
  const del = (reportRes?.deliverability ?? null) as Json | null
  const account = (reportRes?.account ?? {}) as Json
  const campaignsList = (
    (campaignsRes?.campaigns ?? []) as SnapshotRow[]
  ).slice(0, 10)
  const flowsList = ((flowsRes?.flows ?? []) as SnapshotRow[]).slice(0, 10)
  const cs = (campaignsRes?.summary ?? null) as Json | null
  const fsm = (flowsRes?.summary ?? null) as Json | null
  const sh = (shopifyRes?.orders ?? null) as Json | null
  const shCustomers = (shopifyRes?.customers ?? null) as Json | null

  // Prefere o cache custom quando há receita real (fonte autoritativa
  // per-campaign do live sync com janela exata do relatório).
  const finalCampaigns = cacheCampaigns.some((c) => c.revenue > 0)
    ? cacheCampaigns.slice(0, 10)
    : campaignsList
  const finalFlows = cacheFlows.some((f) => f.revenue > 0)
    ? cacheFlows.slice(0, 10)
    : flowsList

  // ─── Receitas ─────────────────────────────────────────────────────────
  // Prioridade: report endpoint > summary do builder > soma dos rows >
  // store_revenue_summary. Com presença explícita (F5): zero legítimo do
  // endpoint NÃO cai pro fallback.
  const receitaCampanhas = firstPresent(
    num(rv, "campaignRevenue"),
    num(cs, "totalRevenue"),
    finalCampaigns.length > 0 ? sumField(finalCampaigns, "revenue") : null,
    num(cachedSummary, "omnisend_campaign_revenue"),
    num(cachedSummary, "klaviyo_campaign_revenue"),
  )

  const receitaFlows = firstPresent(
    num(rv, "flowRevenue"),
    num(fsm, "totalRevenue"),
    finalFlows.length > 0 ? sumField(finalFlows, "revenue") : null,
    num(cachedSummary, "omnisend_flow_revenue"),
    num(cachedSummary, "klaviyo_flow_revenue"),
  )

  const attributedRevenue = firstPresent(
    num(rv, "klaviyoAttributedRevenue"),
    num(rv, "totalRevenue"),
    receitaCampanhas !== null || receitaFlows !== null
      ? (receitaCampanhas ?? 0) + (receitaFlows ?? 0)
      : null,
    num(cachedSummary, "omnisend_total_revenue"),
    num(cachedSummary, "klaviyo_total_revenue"),
  )

  // Receita total da loja: Statistics API (= dashboard Omnisend) primeiro;
  // Shopify como fallback (conta diferente, diverge ~20%).
  const totalRevenue = firstPresent(
    num(rv, "storeRevenue"),
    num(cachedSummary, "store_total_revenue"),
    num(sh, "totalRevenue"),
    attributedRevenue,
  )

  // ─── Pedidos (F1) ─────────────────────────────────────────────────────
  // pedidos_loja = total da loja; pedidos_atribuidos = canais Convertfy.
  // NUNCA misturar: o snapshot antigo usava um único campo `pedidos`
  // (loja) que os slides rotulavam como "atribuídos" — inflação de ~4,8x.
  const pedidosLoja = firstPresent(
    num(rv, "storeOrders"),
    num(cachedSummary, "store_orders"),
    num(sh, "totalOrders"),
  )
  const pedidosAtribuidos = firstPresent(
    num(rv, "klaviyoAttributedOrders"), // mesmo nome nas 2 plataformas
    num(cachedSummary, "omnisend_total_orders"),
  )

  const novosClientes = num(shCustomers, "newCustomersLast30Days")
  const ticketMedio =
    pedidosLoja !== null && pedidosLoja > 0 && totalRevenue !== null
      ? totalRevenue / pedidosLoja
      : num(sh, "averageOrderValue")
  const ticketMedioAtribuido =
    pedidosAtribuidos !== null &&
    pedidosAtribuidos > 0 &&
    attributedRevenue !== null
      ? attributedRevenue / pedidosAtribuidos
      : null

  // ─── Email metrics (F3/F4) ────────────────────────────────────────────
  // Fonte primária: bloco deliverability (Reports API, send-date, 1 row —
  // sem overcount de únicos e com failed cobrindo campanhas + automations).
  // Fallback: derivação legada por soma de rows top-10 (Klaviyo e
  // snapshots sem o bloco).
  const allRows = [...campaignsList, ...flowsList]
  const hasDeliverability = del !== null && (num(del, "sent") ?? 0) > 0

  const rowsDelivered = firstPresent(
    num(ep, "delivered"),
    allRows.length > 0 ? sumField(allRows, "delivered") : null,
    allRows.length > 0 ? sumField(allRows, "recipients") : null,
  )
  const rowsOpened = firstPresent(
    num(ep, "opened"),
    allRows.length > 0 ? sumField(allRows, "opened") : null,
  )
  const rowsClicked = firstPresent(
    num(ep, "clicked"),
    allRows.length > 0 ? sumField(allRows, "clicked") : null,
  )

  let totalDelivered: number | null
  let totalOpened: number | null
  let totalClicked: number | null
  let openRate: number | null
  let clickRate: number | null
  let ctor: number | null
  let bounceRate: number | null
  let unsubRate: number | null

  if (hasDeliverability) {
    totalDelivered = num(del, "delivered")
    totalOpened = num(del, "opened")
    totalClicked = num(del, "clicked")
    openRate = num(del, "openRate")
    clickRate = num(del, "clickRate")
    const ou = num(del, "openedUnique")
    const cu = num(del, "clickedUnique")
    ctor =
      ou !== null && ou > 0 && cu !== null
        ? (cu / ou) * 100
        : firstPresent(num(ep, "clickToOpenRate"))
    bounceRate = num(del, "failRate")
    unsubRate = num(del, "unsubscribeRate")
  } else {
    totalDelivered = rowsDelivered
    totalOpened = rowsOpened
    totalClicked = rowsClicked
    openRate =
      totalDelivered !== null && totalDelivered > 0 && totalOpened !== null
        ? (totalOpened / totalDelivered) * 100
        : num(ep, "openRate")
    clickRate =
      totalDelivered !== null && totalDelivered > 0 && totalClicked !== null
        ? (totalClicked / totalDelivered) * 100
        : num(ep, "clickRate")
    ctor =
      totalOpened !== null && totalOpened > 0 && totalClicked !== null
        ? (totalClicked / totalOpened) * 100
        : num(ep, "clickToOpenRate")
    const bounced = allRows.length > 0 ? sumField(allRows, "bounced") : null
    bounceRate =
      totalDelivered !== null && totalDelivered > 0 && bounced !== null
        ? (bounced / totalDelivered) * 100
        : num(ep, "bounceRate")
    const unsubed = allRows.length > 0 ? sumField(allRows, "unsubscribed") : null
    unsubRate =
      totalDelivered !== null && totalDelivered > 0 && unsubed !== null
        ? (unsubed / totalDelivered) * 100
        : num(ep, "unsubscribeRate")
  }

  // ─── Contagens do período (F2) ────────────────────────────────────────
  // overview.campaignsInPeriod é filtrada por isInPeriod no report-builder
  // (fonte correta). summary.sentCampaigns conta TODAS as campanhas
  // persistidas da conta (lifetime) — REMOVIDA da cadeia (inflava 4x).
  // campaignsList.length é .slice(0,10): só serve quando < 10 (senão é
  // teto artificial, não contagem).
  const totalCampaigns = firstPresent(
    num(overview, "campaignsInPeriod"),
    campaignsList.length > 0 && campaignsList.length < 10
      ? campaignsList.length
      : null,
  )
  const totalFlows = firstPresent(
    num(overview, "liveFlows"),
    num(fsm, "liveFlows"),
    flowsList.length > 0 && flowsList.length < 10 ? flowsList.length : null,
  )
  const totalLeads = num(cachedSummary, "total_leads")

  // ─── Per-row revenue (matchByDate / distribuição proporcional) ────────
  let enrichedCampaigns = finalCampaigns
  if (
    reportsByDate &&
    reportsByDate.length > 0 &&
    !finalCampaigns.some((c) => Number(c.revenue) > 0)
  ) {
    enrichedCampaigns = matchByDate(campaignsList, reportsByDate)
  }
  enrichedCampaigns = distributeRevenue(enrichedCampaigns, receitaCampanhas ?? 0)
  const enrichedFlows = distributeRevenue(finalFlows, receitaFlows ?? 0)

  return {
    generated_at: new Date().toISOString(),
    period: { start: periodStart, end: periodEnd },
    account: {
      currency:
        (account.currency as string | undefined) ??
        (cachedSummary?.currency as string | undefined) ??
        "BRL",
      platform: (reportRes?.platform as string | undefined) ?? null,
    },
    kpis: {
      receita_total: totalRevenue,
      pedidos: pedidosLoja, // LEGADO: sempre foi loja; semântica mantida
      pedidos_loja: pedidosLoja,
      pedidos_atribuidos: pedidosAtribuidos,
      ticket_medio: ticketMedio,
      ticket_medio_atribuido: ticketMedioAtribuido,
      novos_clientes: novosClientes,
      total_leads: totalLeads,
      receita_atribuida: attributedRevenue,
      receita_campanhas: receitaCampanhas,
      receita_flows: receitaFlows,
      atribuicao_pct:
        totalRevenue !== null && totalRevenue > 0 && attributedRevenue !== null
          ? attributedRevenue / totalRevenue
          : null,
      envios: totalDelivered,
      open_rate: openRate,
      click_rate: clickRate,
      ctor,
      bounce_rate: bounceRate,
      unsub_rate: unsubRate,
      opened_unique: hasDeliverability ? num(del, "openedUnique") : null,
      clicked_unique: hasDeliverability ? num(del, "clickedUnique") : null,
      spam_rate: hasDeliverability ? num(del, "markedAsSpamRate") : null,
      recovery_rate: num(rv, "recoveryRate"),
      total_campaigns: totalCampaigns,
      total_flows: totalFlows,
    },
    email: {
      delivered: totalDelivered,
      opened: totalOpened,
      clicked: totalClicked,
      open_rate: openRate,
      click_rate: clickRate,
      ctor,
      bounce_rate: bounceRate,
      unsub_rate: unsubRate,
      source: hasDeliverability ? "reports-api" : "rows",
    },
    campaigns: enrichedCampaigns,
    flows: enrichedFlows,
  }
}

// ─── IO: busca todas as fontes ───────────────────────────────────────────

/**
 * Fan-out para os endpoints internos + caches Supabase. Sempre
 * Promise.allSettled + AbortController (comportamento do resync — a rota
 * de criação usava Promise.all sem timeout e um fetch lento matava todos).
 *
 * Respostas de degradação graciosa (`rateLimited: true` da Omnisend,
 * `partial: true` do Klaviyo, `success: false`) são tratadas como fonte
 * AUSENTE (null) — sem isso, zeros de rate-limit passariam como zeros
 * legítimos sob a resolução por presença (F5).
 */
export async function fetchSnapshotSources(params: {
  origin: string
  cookie: string
  storeId: string
  periodStart: string
  periodEnd: string
  admin: SupabaseClient
  timeoutMs?: number
}): Promise<SnapshotSources> {
  const { origin, cookie, storeId, periodStart, periodEnd, admin } = params
  const timeoutMs = params.timeoutMs ?? 75_000

  // IMPORTANTE: endpoints esperam period=custom&start_date=&end_date=.
  // force_refresh=true garante live sync no momento da geração.
  const periodParam = `period=custom&start_date=${periodStart}&end_date=${periodEnd}&force_refresh=true`

  async function fetchJson(url: string, tag: string): Promise<Json | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const r = await fetch(url, { headers: { cookie }, signal: controller.signal })
      clearTimeout(timer)
      if (!r.ok) {
        log.warn(`[Snapshot] ${tag} returned ${r.status}`)
        return null
      }
      const json = (await r.json()) as Json
      if (json.rateLimited === true || json.partial === true || json.success === false) {
        log.warn(`[Snapshot] ${tag} degraded response — treating as missing`, {
          rateLimited: json.rateLimited === true,
          partial: json.partial === true,
        })
        return null
      }
      return json
    } catch (err) {
      clearTimeout(timer)
      log.warn(`[Snapshot] ${tag} failed`, {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  const results = await Promise.allSettled([
    fetchJson(`${origin}/api/integrations/email-platform/report?store_id=${storeId}&${periodParam}`, "email-report"),
    fetchJson(`${origin}/api/integrations/email-platform/campaigns?store_id=${storeId}&${periodParam}`, "email-campaigns"),
    fetchJson(`${origin}/api/integrations/email-platform/flows?store_id=${storeId}&${periodParam}`, "email-flows"),
    fetchJson(`${origin}/api/integrations/shopify/report?store_id=${storeId}&${periodParam}`, "shopify-report"),
  ])
  const reportRes = results[0].status === "fulfilled" ? results[0].value : null
  const campaignsRes = results[1].status === "fulfilled" ? results[1].value : null
  const flowsRes = results[2].status === "fulfilled" ? results[2].value : null
  const shopifyRes = results[3].status === "fulfilled" ? results[3].value : null

  // Fallback: store_revenue_summary quando report.revenue não vier.
  const cachedSummary = await (async (): Promise<Json | null> => {
    const periodDays = Math.max(
      1,
      Math.round(
        (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    )
    const candidates = periodDays <= 31 ? ["30d", "90d"] : ["90d", "30d"]
    for (const label of candidates) {
      const { data } = await admin
        .from("store_revenue_summary")
        .select(
          "store_total_revenue, store_orders, total_leads, engaged_leads, currency, omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue, omnisend_total_orders, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue",
        )
        .eq("store_id", storeId)
        .eq("period_label", label)
        .maybeSingle()
      if (data) return { ...data, period_label: label }
    }
    return null
  })()

  // Cache omnisend_*_metrics com period_label custom (o live sync via
  // /email-platform/campaigns acima acabou de gravar com a janela exata).
  // NUNCA filtrar por "30d" aqui — rolling window da cron não cobre o
  // período do relatório (bug 2026-05-18, até 40% de divergência).
  const customPeriodLabel = `custom:${periodStart.slice(0, 10)}:${periodEnd.slice(0, 10)}`
  const { data: omnisendCampaignRows } = await admin
    .from("omnisend_campaign_metrics")
    .select(
      "campaign_id, campaign_name, send_time, subject, recipients, delivered, opened, clicked, conversions, conversion_value, open_rate, click_rate, bounce_rate",
    )
    .eq("store_id", storeId)
    .eq("period_label", customPeriodLabel)
    .order("conversion_value", { ascending: false })
    .limit(20)
  const { data: omnisendFlowRows } = await admin
    .from("omnisend_flow_metrics")
    .select(
      "flow_id, flow_name, flow_status, trigger_type, recipients, delivered, opened, clicked, conversions, conversion_value, open_rate, click_rate",
    )
    .eq("store_id", storeId)
    .eq("period_label", customPeriodLabel)
    .order("conversion_value", { ascending: false })
    .limit(15)

  const cacheCampaigns: SnapshotRow[] = (omnisendCampaignRows ?? []).map((r) => ({
    id: r.campaign_id as string,
    name: r.campaign_name as string,
    sendTime: r.send_time as string,
    subject: r.subject as string | null,
    recipients: Number(r.recipients) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    conversions: Number(r.conversions) || 0,
    openRate: Number(r.open_rate) || 0,
    clickRate: Number(r.click_rate) || 0,
    bounceRate: Number(r.bounce_rate) || 0,
    revenue: Number(r.conversion_value) || 0,
  }))
  const cacheFlows: SnapshotRow[] = (omnisendFlowRows ?? []).map((r) => ({
    id: r.flow_id as string,
    name: r.flow_name as string,
    status: r.flow_status as string,
    triggerType: r.trigger_type as string,
    recipients: Number(r.recipients) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    conversions: Number(r.conversions) || 0,
    openRate: Number(r.open_rate) || 0,
    clickRate: Number(r.click_rate) || 0,
    revenue: Number(r.conversion_value) || 0,
  }))

  // Reports API per-campaign (byDate) — só quando será usada: plataforma
  // Omnisend e nenhuma fonte per-row tem receita real.
  let reportsByDate: SnapshotSources["reportsByDate"] = null
  const campaignsList = ((campaignsRes?.campaigns ?? []) as SnapshotRow[]).slice(0, 10)
  const hasRowRevenue =
    cacheCampaigns.some((c) => c.revenue > 0) ||
    campaignsList.some((c) => Number(c.revenue) > 0)
  if (!hasRowRevenue && reportRes?.platform === "omnisend") {
    try {
      const creds = await getStoreCredentials(storeId)
      if (creds.omnisend_api_key) {
        const account = (reportRes?.account ?? {}) as Json
        const storeCurrency =
          (account.currency as string | undefined) ??
          (cachedSummary?.currency as string | undefined) ??
          "BRL"
        reportsByDate = await fetchOmnisendCampaignReports(
          creds.omnisend_api_key,
          periodStart,
          periodEnd,
          offsetForCurrency(storeCurrency),
        )
      }
    } catch {
      // silent — buildReportSnapshot cai na distribuição proporcional
    }
  }

  return {
    reportRes,
    campaignsRes,
    flowsRes,
    shopifyRes,
    cachedSummary,
    cacheCampaigns,
    cacheFlows,
    reportsByDate,
  }
}
