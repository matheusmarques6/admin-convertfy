/**
 * POST /api/admin/stores/reports/[reportId]/resync
 *
 * Recomputa o snapshot do relatório a partir dos dados atuais (Omnisend
 * cache + Shopify + soma dos rows). Usado quando o snapshot original ficou
 * com KPIs zerados ou o periodo nao matched o cache.
 *
 * Mantem os campos editorial (proximos_passos, insights) intactos.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ReportResync")

export const dynamic = "force-dynamic"
export const maxDuration = 90

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: report, error: fetchErr } = await admin
      .from("client_monthly_reports")
      .select("id, store_id, period_start, period_end, snapshot")
      .eq("id", reportId)
      .single()
    if (fetchErr || !report) throw new AppError("Relatório não encontrado", 404)

    const origin = request.nextUrl.origin
    const periodParam = `period=custom&start_date=${report.period_start}&end_date=${report.period_end}`
    const cookie = request.headers.get("cookie") ?? ""

    // Timeout individual de 25s por fetch — evita que um endpoint lento
    // (Omnisend rate limit, Klaviyo cold) bloqueie a operacao toda.
    async function fetchJson(url: string, tag: string): Promise<Record<string, unknown> | null> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 25_000)
      try {
        const r = await fetch(url, { headers: { cookie }, signal: controller.signal })
        clearTimeout(timer)
        if (!r.ok) {
          log.warn(`[Resync] ${tag} returned ${r.status}`)
          return null
        }
        return (await r.json()) as Record<string, unknown>
      } catch (err) {
        clearTimeout(timer)
        log.warn(`[Resync] ${tag} failed`, {
          error: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    }

    // Promise.allSettled garante que UM fetch lento nao mata todos os outros.
    const results = await Promise.allSettled([
      fetchJson(`${origin}/api/integrations/email-platform/report?store_id=${report.store_id}&${periodParam}`, "email-report"),
      fetchJson(`${origin}/api/integrations/email-platform/campaigns?store_id=${report.store_id}&${periodParam}`, "email-campaigns"),
      fetchJson(`${origin}/api/integrations/email-platform/flows?store_id=${report.store_id}&${periodParam}`, "email-flows"),
      fetchJson(`${origin}/api/integrations/shopify/report?store_id=${report.store_id}&${periodParam}`, "shopify-report"),
    ])
    const reportRes = results[0].status === "fulfilled" ? results[0].value : null
    const campaignsRes = results[1].status === "fulfilled" ? results[1].value : null
    const flowsRes = results[2].status === "fulfilled" ? results[2].value : null
    const shopifyRes = results[3].status === "fulfilled" ? results[3].value : null

    // Cached fallback
    const cachedSummary = await (async () => {
      const periodDays = Math.max(1, Math.round(
        (new Date(report.period_end).getTime() - new Date(report.period_start).getTime()) / (1000 * 60 * 60 * 24),
      ))
      const candidates = periodDays <= 31 ? ["30d", "90d"] : ["90d", "30d"]
      for (const label of candidates) {
        const { data } = await admin
          .from("store_revenue_summary")
          .select("store_total_revenue, store_orders, total_leads, engaged_leads, currency, omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue, omnisend_total_orders, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue")
          .eq("store_id", report.store_id)
          .eq("period_label", label)
          .maybeSingle()
        if (data) return data
      }
      return null
    })()

    const rv = (reportRes?.revenue ?? {}) as Record<string, number>
    const overview = (reportRes?.overview ?? {}) as Record<string, number>
    const ep = (reportRes?.emailPerformance ?? {}) as Record<string, number>
    const account = (reportRes?.account ?? {}) as Record<string, unknown>
    const campaignsList = ((campaignsRes?.campaigns ?? []) as Array<Record<string, unknown>>).slice(0, 10)
    const flowsList = ((flowsRes?.flows ?? []) as Array<Record<string, unknown>>).slice(0, 10)
    const cs = (campaignsRes?.summary ?? {}) as Record<string, number>
    const fs = (flowsRes?.summary ?? {}) as Record<string, number>
    const sh = (shopifyRes?.orders ?? {}) as Record<string, number>
    const shCustomers = (shopifyRes?.customers ?? {}) as Record<string, number>

    function sumField(rows: Array<Record<string, unknown>>, field: string): number {
      return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
    }

    // Distribuição proporcional por delivered quando per-row revenue
    // vier zerado (limitação API Omnisend Statistics: marketingActivityID
    // != campaignID).
    function distributeRevenue<T extends Record<string, unknown>>(rows: T[], totalRevenue: number): T[] {
      const sumRow = sumField(rows, "revenue")
      if (sumRow > 0 || totalRevenue <= 0 || rows.length === 0) return rows
      const weights = rows.map((r) => Number(r.delivered) || Number(r.recipients) || 0)
      const totalWeight = weights.reduce((s, w) => s + w, 0)
      if (totalWeight === 0) return rows
      return rows.map((r, i) => ({
        ...r,
        revenue: (totalRevenue * weights[i]) / totalWeight,
        revenue_estimated: true,
      }))
    }

    const receitaCampanhas =
      Number(rv.campaignRevenue) ||
      Number(cs.totalRevenue) ||
      sumField(campaignsList, "revenue") ||
      Number(cachedSummary?.omnisend_campaign_revenue ?? cachedSummary?.klaviyo_campaign_revenue) || 0

    const receitaFlows =
      Number(rv.flowRevenue) ||
      Number(fs.totalRevenue) ||
      sumField(flowsList, "revenue") ||
      Number(cachedSummary?.omnisend_flow_revenue ?? cachedSummary?.klaviyo_flow_revenue) || 0

    const attributedRevenue =
      Number(rv.klaviyoAttributedRevenue) ||
      Number(rv.totalRevenue) ||
      (receitaCampanhas + receitaFlows) ||
      Number(cachedSummary?.omnisend_total_revenue ?? cachedSummary?.klaviyo_total_revenue) || 0

    const totalRevenue =
      Number(sh.totalRevenue) ||
      Number(rv.storeRevenue) ||
      Number(cachedSummary?.store_total_revenue) ||
      attributedRevenue

    const pedidos =
      Number(sh.totalOrders) ||
      Number(rv.storeOrders) ||
      Number(cachedSummary?.store_orders) ||
      Number(rv.klaviyoAttributedOrders) ||
      Number(cachedSummary?.omnisend_total_orders) || 0

    const novosClientes = Number(shCustomers.newCustomersLast30Days) || 0
    const ticketMedio = pedidos > 0 ? totalRevenue / pedidos : (Number(sh.averageOrderValue) || 0)

    const allRows = [...campaignsList, ...flowsList]
    const totalDelivered = Number(ep.delivered) || sumField(allRows, "delivered") || sumField(allRows, "recipients")
    const totalOpened = Number(ep.opened) || sumField(allRows, "opened")
    const totalClicked = Number(ep.clicked) || sumField(allRows, "clicked")
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : Number(ep.openRate) || 0
    const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : Number(ep.clickRate) || 0
    const ctor = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : Number(ep.clickToOpenRate) || 0
    const bounced = sumField(allRows, "bounced")
    const bounceRate = totalDelivered > 0 ? (bounced / totalDelivered) * 100 : Number(ep.bounceRate) || 0
    const unsubed = sumField(allRows, "unsubscribed")
    const unsubRate = totalDelivered > 0 ? (unsubed / totalDelivered) * 100 : 0

    const totalCampaigns = Number(cs.sentCampaigns) || Number(overview.campaignsInPeriod) || campaignsList.length
    const totalFlows = Number(fs.liveFlows) || Number(overview.liveFlows) || flowsList.length
    const totalLeads = Number(cachedSummary?.total_leads ?? 0)

    const enrichedCampaigns = distributeRevenue(campaignsList, receitaCampanhas)
    const enrichedFlows = distributeRevenue(flowsList, receitaFlows)

    // Preserva insights existentes do snapshot anterior
    const oldSnapshot = (report.snapshot ?? {}) as Record<string, unknown>
    const oldInsights = (oldSnapshot.insights ?? {}) as Record<string, unknown>

    const snapshot = {
      ...oldSnapshot,
      generated_at: new Date().toISOString(),
      period: { start: report.period_start, end: report.period_end },
      account: {
        currency: account.currency ?? cachedSummary?.currency ?? "BRL",
        platform: reportRes?.platform ?? null,
      },
      kpis: {
        receita_total: totalRevenue,
        pedidos,
        ticket_medio: ticketMedio,
        novos_clientes: novosClientes,
        total_leads: totalLeads,
        receita_atribuida: attributedRevenue,
        receita_campanhas: receitaCampanhas,
        receita_flows: receitaFlows,
        atribuicao_pct: totalRevenue > 0 ? attributedRevenue / totalRevenue : 0,
        envios: totalDelivered,
        open_rate: openRate,
        click_rate: clickRate,
        ctor,
        bounce_rate: bounceRate,
        unsub_rate: unsubRate,
        recovery_rate: Number(rv.recoveryRate ?? 0),
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
      },
      campaigns: enrichedCampaigns,
      flows: enrichedFlows,
      insights: oldInsights,
    }

    const { error: updateErr } = await admin
      .from("client_monthly_reports")
      .update({ snapshot })
      .eq("id", reportId)
    if (updateErr) throw updateErr

    return successResponse(request, {
      resynced: true,
      kpis: snapshot.kpis,
    })
  } catch (error) {
    return errorResponse(request, error, "report-resync")
  }
}
