/**
 * GET /api/dashboard/email-performance
 *
 * Agrega metricas de email do periodo a partir do cache em DB
 * (klaviyo_*_metrics + omnisend_*_metrics + store_revenue_summary).
 *
 * Retorna rates ponderados por volume (delivered) entre todas as lojas
 * do org, alem de KPIs de footer (volume, perfis ativos, engajados,
 * unsub rate).
 *
 * Usado pelo card "Performance do Email" do dashboard /admin/dashboard.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
  getUnifiedFlows,
} from "@/lib/services/unified-metrics.service"
import { normalizePeriodLabel } from "@/lib/services/sync-persistence.service"
import { logger } from "@/lib/logger"

const log = logger.child("DashboardEmailPerf")

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = normalizePeriodLabel(
      request.nextUrl.searchParams.get("period") || "30d",
      request.nextUrl.searchParams.get("start"),
      request.nextUrl.searchParams.get("end"),
    )

    const [revenueRows, campaignRows, flowRows, storesQ] = await Promise.all([
      getUnifiedRevenue(supabase, orgId, [period]),
      getUnifiedCampaigns(supabase, orgId, period),
      getUnifiedFlows(supabase, orgId, period, undefined, false),
      supabase
        .from("client_stores")
        .select("id, store_name, clients(name)")
        .eq("org_id", orgId)
        .limit(1000),
    ])
    const storeNames = new Map<string, { store: string; client: string }>(
      (storesQ.data ?? []).map((s) => {
        const client = Array.isArray(s.clients) ? s.clients[0] : s.clients
        return [s.id as string, { store: s.store_name as string, client: (client as { name?: string } | null)?.name || "—" }]
      }),
    )

    // Agrega tudo (campaigns + flows do periodo)
    const allRows = [
      ...campaignRows.map((c) => ({
        store_id: c.store_id,
        recipients: c.recipients,
        delivered: c.delivered,
        opened: c.opened,
        clicked: c.clicked,
        bounced: c.bounced,
        unsubscribed: c.unsubscribed,
        conversions: c.conversions,
        revenue: c.conversion_value,
      })),
      ...flowRows.map((f) => ({
        store_id: f.store_id,
        recipients: f.recipients,
        delivered: f.delivered,
        opened: f.opened,
        clicked: f.clicked,
        bounced: f.bounced,
        unsubscribed: f.unsubscribed,
        conversions: f.conversions,
        revenue: f.conversion_value,
      })),
    ]

    // Breakdown por loja (auditoria, ago/2026): MESMAS linhas que compõem
    // as taxas globais do card, agrupadas por store — quem audita soma as
    // linhas e chega exatamente no total do card.
    interface StoreAcc {
      recipients: number
      delivered: number
      opened: number
      clicked: number
      bounced: number
      unsubscribed: number
      conversions: number
      revenue: number
    }
    const byStore = new Map<string, StoreAcc>()
    for (const r of allRows) {
      const acc = byStore.get(r.store_id) ?? {
        recipients: 0, delivered: 0, opened: 0, clicked: 0,
        bounced: 0, unsubscribed: 0, conversions: 0, revenue: 0,
      }
      acc.recipients += r.recipients
      acc.delivered += r.delivered
      acc.opened += r.opened
      acc.clicked += r.clicked
      acc.bounced += r.bounced
      acc.unsubscribed += r.unsubscribed
      acc.conversions += r.conversions
      acc.revenue += r.revenue
      byStore.set(r.store_id, acc)
    }
    // Mesma régua das taxas globais: sem denominador não há taxa. Uma loja
    // sem envio no período mostrava 0% em todas as colunas da auditoria,
    // indistinguível de uma loja que enviou e teve desempenho zero.
    const taxaDaLoja = (num: number, den: number): number | null =>
      den > 0 ? Math.round((num / den) * 100 * 100) / 100 : null
    const storeBreakdown = [...byStore.entries()]
      .map(([storeId, a]) => {
        const names = storeNames.get(storeId)
        return {
          storeId,
          storeName: names?.store ?? "—",
          clientName: names?.client ?? "—",
          ...a,
          openRate: taxaDaLoja(a.opened, a.delivered),
          clickRate: taxaDaLoja(a.clicked, a.delivered),
          ctor: taxaDaLoja(a.clicked, a.opened),
          placedOrderRate: taxaDaLoja(a.conversions, a.delivered),
          deliveryRate: taxaDaLoja(a.delivered, a.recipients),
          unsubRate: taxaDaLoja(a.unsubscribed, a.delivered),
        }
      })
      .sort((a, b) => b.delivered - a.delivered)

    const totalRecipients = allRows.reduce((s, r) => s + r.recipients, 0)
    const totalDelivered = allRows.reduce((s, r) => s + r.delivered, 0)
    const totalOpened = allRows.reduce((s, r) => s + r.opened, 0)
    const totalClicked = allRows.reduce((s, r) => s + r.clicked, 0)
    const totalBounced = allRows.reduce((s, r) => s + r.bounced, 0)
    const totalUnsubs = allRows.reduce((s, r) => s + r.unsubscribed, 0)
    const totalConversions = allRows.reduce((s, r) => s + r.conversions, 0)
    const totalRevenue = allRows.reduce((s, r) => s + r.revenue, 0)

    // Rates (em percentual 0-100). Ponderados por volume real, nao
    // simples media de rates — ainda mais preciso quando lojas tem
    // tamanhos muito diferentes.
    // **Sem denominador não existe taxa** — devolve `null`, e a tela mostra
    // "—". Um `0` ali se lê como "os emails saíram e ninguém abriu", quando
    // a verdade é que não houve envio no período (ou o cache não foi
    // sincronizado): num período de um dia sem campanha, o card publicava
    // "Open Rate 0,0%" e "Deliverability 0,0%" como se tivesse medido. É a
    // mesma armadilha da Taxa média Convertfy, em oito lugares.
    const taxa = (num: number, den: number): number | null =>
      den > 0 ? Math.round((num / den) * 100 * 100) / 100 : null
    const openRate = taxa(totalOpened, totalDelivered)
    const clickRate = taxa(totalClicked, totalDelivered)
    const ctor = taxa(totalClicked, totalOpened)
    const placedOrderRate = taxa(totalConversions, totalDelivered)
    const rpe =
      totalRecipients > 0 ? Math.round((totalRevenue / totalRecipients) * 100) / 100 : null
    const deliveryRate = taxa(totalDelivered, totalRecipients)
    const unsubRate = taxa(totalUnsubs, totalDelivered)
    const bounceRate = taxa(totalBounced, totalRecipients)

    // Footer: agregados de leads
    const totalLeads = revenueRows.reduce((s, r) => s + (r.total_leads || 0), 0)
    const engagedLeads = revenueRows.reduce((s, r) => s + (r.engaged_leads || 0), 0)

    log.info("[EmailPerf] aggregated", {
      period,
      campaigns: campaignRows.length,
      flows: flowRows.length,
      totalDelivered,
      openRate: openRate?.toFixed(2) ?? "sem base",
      clickRate: clickRate?.toFixed(2) ?? "sem base",
    })

    return successResponse(request, {
      period,
      metrics: {
        openRate,
        clickRate,
        ctor,
        placedOrderRate,
        rpe,
        deliveryRate,
        bounceRate,
        unsubRate,
      },
      totals: {
        recipients: totalRecipients,
        delivered: totalDelivered,
        opened: totalOpened,
        clicked: totalClicked,
        bounced: totalBounced,
        unsubscribed: totalUnsubs,
        conversions: totalConversions,
        revenue: totalRevenue,
      },
      audience: {
        totalLeads,
        engagedLeads,
      },
      storeBreakdown,
    })
  } catch (error) {
    // 401/403 nao e erro da rota (sessao expirada em aba aberta gera um
    // por poll) — o errorResponse ja loga o que for 5xx.
    if (!(error instanceof AppError) || error.statusCode >= 500) {
      log.error("EmailPerf error:", error)
    }
    return errorResponse(request, error, "email-performance")
  }
}
