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
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { fetchOmnisendCampaignReports } from "@/lib/integrations/omnisend/reports-api"
import { offsetForCurrency } from "@/lib/integrations/omnisend/timezone"

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
    // force_refresh=true e CRITICO no resync — sem isso o Omnisend report
    // builder retorna cache de ate 35min, mostrando dados antigos. O usuario
    // clicou em "resincronizar" justamente pra ter dados frescos.
    const periodParam = `period=custom&start_date=${report.period_start}&end_date=${report.period_end}&force_refresh=true`
    const cookie = request.headers.get("cookie") ?? ""

    // Timeout individual de 75s por fetch — antes era 25s, mas o
    // /email-platform/campaigns faz um live sync da Omnisend que combina
    // Statistics + Reports + /v5/campaigns + /v5/automations e leva
    // 30-50s pra Blessed Choice. Timeout curto abortava ANTES do sync
    // persistir, deixando o cache vazio — causa do resync produzir
    // numeros diferentes da criacao nova (que nao tem timeout). 75s
    // mantem margem de seguranca dentro do maxDuration=90s da route.
    async function fetchJson(url: string, tag: string): Promise<Record<string, unknown> | null> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 75_000)
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

    // Cache omnisend_campaign_metrics — le pelo period_label custom que o
    // live sync (via /email-platform/campaigns?period=custom acima) acabou
    // de gravar. Antes filtravamos por period_label="30d" + send_time IN
    // range, mas isso so cobria a janela rolling da cron (ex: 18/abr-18/mai)
    // e perdia tudo enviado antes dessa janela. Confirmado pelo suporte
    // Omnisend (2026-05-18): dateRange e timezone-aware, com `to` exclusivo.
    const customPeriodLabel = `custom:${report.period_start.slice(0, 10)}:${report.period_end.slice(0, 10)}`
    const { data: omnisendCampaignRows } = await admin
      .from("omnisend_campaign_metrics")
      .select(
        "campaign_id, campaign_name, send_time, subject, recipients, delivered, opened, clicked, conversions, conversion_value, open_rate, click_rate, bounce_rate",
      )
      .eq("store_id", report.store_id)
      .eq("period_label", customPeriodLabel)
      .order("conversion_value", { ascending: false })
      .limit(20)
    const { data: omnisendFlowRows } = await admin
      .from("omnisend_flow_metrics")
      .select("flow_id, flow_name, flow_status, trigger_type, recipients, delivered, opened, clicked, conversions, conversion_value, open_rate, click_rate")
      .eq("store_id", report.store_id)
      .eq("period_label", customPeriodLabel)
      .order("conversion_value", { ascending: false })
      .limit(15)

    const cacheCampaigns = (omnisendCampaignRows ?? []).map((r) => ({
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
    const cacheFlows = (omnisendFlowRows ?? []).map((r) => ({
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

    const finalCampaigns = cacheCampaigns.some((c) => c.revenue > 0) ? cacheCampaigns.slice(0, 10) : campaignsList
    const finalFlows = cacheFlows.some((f) => f.revenue > 0) ? cacheFlows.slice(0, 10) : flowsList

    function sumField(rows: Array<Record<string, unknown>>, field: string): number {
      return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
    }

    // Tenta atribuir revenue real do Reports API matchando pelo dia do
    // sendTime. Quando há 1 campanha no dia → valor exato. Quando há
    // múltiplas → split por share de delivered (flag estimated).
    function matchByDate<T extends Record<string, unknown>>(
      campaigns: T[],
      reports: Array<{ marketingActivityID: string; attributedRevenue: number; byDate?: Map<string, number> }>,
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
      const result = campaigns.map((c) => ({ ...c } as Record<string, unknown>))
      for (const [day, dayCamps] of campaignsByDay.entries()) {
        const dayRevenue = revenueByDay.get(day) ?? 0
        if (dayRevenue <= 0) continue
        const totalDelivered = dayCamps.reduce((s, x) => s + (Number(x.delivered) || Number(x.recipients) || 0), 0) || 1
        for (const c of dayCamps) {
          const idx = result.findIndex((x) => x.id === c.id)
          if (idx >= 0) {
            const share = (Number(c.delivered) || Number(c.recipients) || 0) / totalDelivered
            result[idx].revenue = dayRevenue * share
            result[idx].revenue_estimated = dayCamps.length > 1
          }
        }
      }
      return result as T[]
    }

    // Distribuição proporcional por delivered quando per-row revenue
    // vier zerado (fallback se Reports API falhar).
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
      sumField(finalCampaigns, "revenue") ||
      Number(cachedSummary?.omnisend_campaign_revenue ?? cachedSummary?.klaviyo_campaign_revenue) || 0

    const receitaFlows =
      Number(rv.flowRevenue) ||
      Number(fs.totalRevenue) ||
      sumField(finalFlows, "revenue") ||
      Number(cachedSummary?.omnisend_flow_revenue ?? cachedSummary?.klaviyo_flow_revenue) || 0

    const attributedRevenue =
      Number(rv.klaviyoAttributedRevenue) ||
      Number(rv.totalRevenue) ||
      (receitaCampanhas + receitaFlows) ||
      Number(cachedSummary?.omnisend_total_revenue ?? cachedSummary?.klaviyo_total_revenue) || 0

    // Total store revenue: prefere Omnisend Statistics API (totalRevenue)
    // que e a fonte do dashboard. Shopify direto fica como fallback porque
    // diverge (filtros de status, refunds) — confirmado pelo suporte 2026-05-18.
    const totalRevenue =
      Number(rv.storeRevenue) ||
      Number(cachedSummary?.store_total_revenue) ||
      Number(sh.totalRevenue) ||
      attributedRevenue

    const pedidos =
      Number(rv.storeOrders) ||
      Number(cachedSummary?.store_orders) ||
      Number(sh.totalOrders) ||
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

    let enrichedCampaigns = finalCampaigns
    if (!finalCampaigns.some((c) => Number((c as Record<string, unknown>).revenue) > 0) && reportRes?.platform === "omnisend") {
      try {
        const creds = await getStoreCredentials(report.store_id)
        if (creds.omnisend_api_key) {
          const storeCurrency = (account.currency as string | undefined) ?? cachedSummary?.currency ?? "BRL"
          const reportsData = await fetchOmnisendCampaignReports(
            creds.omnisend_api_key,
            report.period_start,
            report.period_end,
            offsetForCurrency(storeCurrency),
          )
          if (reportsData && reportsData.length > 0) {
            enrichedCampaigns = matchByDate(campaignsList, reportsData)
          }
        }
      } catch {
        // silent — fica com fallback
      }
    }
    enrichedCampaigns = distributeRevenue(enrichedCampaigns, receitaCampanhas)
    const enrichedFlows = distributeRevenue(finalFlows, receitaFlows)

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

    // pdf_url: null — os dados mudaram; o PDF gerado ficou obsoleto e o
    // botão volta a "Gerar PDF" (regenera no próximo clique).
    const { error: updateErr } = await admin
      .from("client_monthly_reports")
      .update({ snapshot, pdf_url: null })
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
