/**
 * GET  /api/admin/stores/[id]/reports                 — lista
 * POST /api/admin/stores/[id]/reports                 — gera novo
 *
 * Tabela: client_monthly_reports
 *  - status: draft | sent | presented
 *  - snapshot: jsonb cristalizado no momento da geracao (dados imutaveis)
 *  - sections: jsonb { resumo: true, financeiro: true, ... }
 *  - tone: editorial | corporate | casual
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const sectionsSchema = z.object({
  resumo: z.boolean().default(true),
  financeiro: z.boolean().default(true),
  email_perf: z.boolean().default(true),
  top_campanhas: z.boolean().default(true),
  top_flows: z.boolean().default(true),
  trabalho: z.boolean().default(true),
  proximos: z.boolean().default(true),
})

const createSchema = z.object({
  period_start: z.string().min(1, "period_start é obrigatório"),
  period_end: z.string().min(1, "period_end é obrigatório"),
  month_label: z.string().optional(),
  sections: sectionsSchema.default({
    resumo: true,
    financeiro: true,
    email_perf: true,
    top_campanhas: true,
    top_flows: true,
    trabalho: true,
    proximos: true,
  }),
  tone: z.enum(["editorial", "corporate", "casual"]).default("editorial"),
  // Aceita null pra UI poder mandar `proximos_passos: proximos || null`
  // sem disparar 400 Zod (era a causa principal do bug "Gerar falhou").
  proximos_passos: z.string().nullable().optional(),
  ai_filled: z.boolean().default(true),
})

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("client_monthly_reports")
      .select(
        "id, month_label, period_start, period_end, status, " +
          "generated_at, presented_at, sent_to, tone, ai_filled, pdf_url, " +
          "snapshot, generated_by, " +
          "generator:profiles!client_monthly_reports_generated_by_fkey(name, avatar_url)",
      )
      .eq("store_id", storeId)
      .order("period_start", { ascending: false })
    if (error) throw error
    return successResponse(request, { reports: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "store-reports-list")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data

    // Deriva month_label se nao veio
    const ps = new Date(body.period_start + "T12:00:00")
    const monthLabel =
      body.month_label ||
      `${MONTH_LABELS[ps.getMonth()]} ${ps.getFullYear()}`

    // Snapshot real — chama os endpoints de email-platform internamente
    // pra cristalizar dados de campanhas, flows e KPIs no momento da geracao.
    // Se algo falhar (sem credencial, rate limit), cai pra snapshot parcial
    // pra nao bloquear a criacao do relatorio.
    //
    // IMPORTANTE: os endpoints email-platform/* esperam
    // `period=custom&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
    // (nao `start=` / `end=`).
    const origin = request.nextUrl.origin
    const periodParam = `period=custom&start_date=${body.period_start}&end_date=${body.period_end}`
    const cookie = request.headers.get("cookie") ?? ""

    async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
      try {
        const r = await fetch(url, { headers: { cookie } })
        if (!r.ok) return null
        return (await r.json()) as Record<string, unknown>
      } catch {
        return null
      }
    }

    const [reportRes, campaignsRes, flowsRes, shopifyRes] = await Promise.all([
      fetchJson(`${origin}/api/integrations/email-platform/report?store_id=${storeId}&${periodParam}`),
      fetchJson(`${origin}/api/integrations/email-platform/campaigns?store_id=${storeId}&${periodParam}`),
      fetchJson(`${origin}/api/integrations/email-platform/flows?store_id=${storeId}&${periodParam}`),
      fetchJson(`${origin}/api/integrations/shopify/report?store_id=${storeId}&${periodParam}`),
    ])

    // Fallback: store_revenue_summary (cached) quando report.revenue vier
    // zerado por period_label não match. Tenta primeiro o período do
    // relatorio, depois 30d como aproximação.
    const cachedSummary = await (async () => {
      const periodDays = Math.max(1, Math.round(
        (new Date(body.period_end).getTime() - new Date(body.period_start).getTime()) / (1000 * 60 * 60 * 24),
      ))
      const candidates = periodDays <= 31 ? ["30d", "90d"] : ["90d", "30d"]
      for (const label of candidates) {
        const { data } = await admin
          .from("store_revenue_summary")
          .select("store_total_revenue, store_orders, total_leads, engaged_leads, currency, omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue, omnisend_total_orders, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue")
          .eq("store_id", storeId)
          .eq("period_label", label)
          .maybeSingle()
        if (data) return { ...data, period_label: label }
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

    // Helper: soma um campo de uma lista de objetos
    function sumField(rows: Array<Record<string, unknown>>, field: string): number {
      return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
    }

    // ─── Distribuição proporcional de receita ────────────
    // Omnisend Statistics API retorna marketingActivityID que NÃO bate com
    // campaignID de /v5/campaigns (confirmado pelo suporte 2026-05-16). O
    // total agregado vem certo, mas as rows individuais ficam com revenue=0.
    // Pra preservar o ranking visual com valores significativos, distribui
    // proporcionalmente por delivered (reach) quando há total conhecido mas
    // per-row zerado.
    function distributeRevenue<T extends Record<string, unknown>>(
      rows: T[],
      totalRevenue: number,
    ): T[] {
      const sumRow = sumField(rows, "revenue")
      if (sumRow > 0 || totalRevenue <= 0 || rows.length === 0) return rows
      // Distribui pelo delivered (ou recipients) como proxy de share
      const weights = rows.map((r) => Number(r.delivered) || Number(r.recipients) || 0)
      const totalWeight = weights.reduce((s, w) => s + w, 0)
      if (totalWeight === 0) return rows
      return rows.map((r, i) => ({
        ...r,
        revenue: (totalRevenue * weights[i]) / totalWeight,
        // Marca como estimado pra UI poder sinalizar se quiser
        revenue_estimated: true,
      }))
    }

    // ─── Receitas ─────────────────────────────────
    // Prioridade: report endpoint > soma dos rows > store_revenue_summary
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

    // Receita total da loja (Shopify > store_revenue_summary > attributed)
    const totalRevenue =
      Number(sh.totalRevenue) ||
      Number(rv.storeRevenue) ||
      Number(cachedSummary?.store_total_revenue) ||
      attributedRevenue // fallback: se nao temos receita total, usa atribuida como denominador

    const pedidos =
      Number(sh.totalOrders) ||
      Number(rv.storeOrders) ||
      Number(cachedSummary?.store_orders) ||
      Number(rv.klaviyoAttributedOrders) ||
      Number(cachedSummary?.omnisend_total_orders) || 0

    const novosClientes = Number(shCustomers.newCustomersLast30Days) || 0
    const ticketMedio = pedidos > 0 ? totalRevenue / pedidos : (Number(sh.averageOrderValue) || 0)

    // ─── Email metrics (derivar de rows quando summary nao tem) ───
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

    // Total de contagens
    const totalCampaigns = Number(cs.sentCampaigns) || Number(overview.campaignsInPeriod) || campaignsList.length
    const totalFlows = Number(fs.liveFlows) || Number(overview.liveFlows) || flowsList.length
    const totalLeads = Number(cachedSummary?.total_leads ?? 0)

    // Aplica distribuição proporcional quando per-campaign revenue ficou 0
    // mas total agregado é conhecido (limitação API Omnisend).
    const enrichedCampaigns = distributeRevenue(campaignsList, receitaCampanhas)
    const enrichedFlows = distributeRevenue(flowsList, receitaFlows)

    const snapshot = {
      generated_at: new Date().toISOString(),
      period: { start: body.period_start, end: body.period_end },
      tone: body.tone,
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
      insights: {},
    }

    const { data, error } = await admin
      .from("client_monthly_reports")
      .insert({
        store_id: storeId,
        month_label: monthLabel,
        period_start: body.period_start,
        period_end: body.period_end,
        sections: body.sections,
        tone: body.tone,
        snapshot,
        proximos_passos: body.proximos_passos || null,
        ai_filled: body.ai_filled,
        generated_by: user.id,
        status: "draft",
      })
      .select("id")
      .single()
    if (error) {
      // Unique (store_id, month_label) violation: surface 409 com msg clara
      // ao inves de 500 generico.
      if (error.code === "23505") {
        throw new AppError(
          `Já existe um relatório para ${monthLabel}. Abra o relatório existente ou ajuste o período.`,
          409,
        )
      }
      throw new AppError(`Erro ao salvar relatório: ${error.message}`, 500)
    }
    return successResponse(request, { id: data.id, month_label: monthLabel })
  } catch (error) {
    return errorResponse(request, error, "store-reports-create")
  }
}
