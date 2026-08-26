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
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
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
    const r2 = (v: number) => Math.round(v * 100) / 100
    const storeBreakdown = [...byStore.entries()]
      .map(([storeId, a]) => {
        const names = storeNames.get(storeId)
        return {
          storeId,
          storeName: names?.store ?? "—",
          clientName: names?.client ?? "—",
          ...a,
          openRate: a.delivered > 0 ? r2((a.opened / a.delivered) * 100) : 0,
          clickRate: a.delivered > 0 ? r2((a.clicked / a.delivered) * 100) : 0,
          ctor: a.opened > 0 ? r2((a.clicked / a.opened) * 100) : 0,
          placedOrderRate: a.delivered > 0 ? r2((a.conversions / a.delivered) * 100) : 0,
          deliveryRate: a.recipients > 0 ? r2((a.delivered / a.recipients) * 100) : 0,
          unsubRate: a.delivered > 0 ? r2((a.unsubscribed / a.delivered) * 100) : 0,
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
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0
    const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0
    const ctor = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0
    const placedOrderRate = totalDelivered > 0 ? (totalConversions / totalDelivered) * 100 : 0
    const rpe = totalRecipients > 0 ? totalRevenue / totalRecipients : 0
    const deliveryRate = totalRecipients > 0 ? (totalDelivered / totalRecipients) * 100 : 0
    const unsubRate = totalDelivered > 0 ? (totalUnsubs / totalDelivered) * 100 : 0
    const bounceRate = totalRecipients > 0 ? (totalBounced / totalRecipients) * 100 : 0

    // Footer: agregados de leads
    const totalLeads = revenueRows.reduce((s, r) => s + (r.total_leads || 0), 0)
    const engagedLeads = revenueRows.reduce((s, r) => s + (r.engaged_leads || 0), 0)

    log.info("[EmailPerf] aggregated", {
      period,
      campaigns: campaignRows.length,
      flows: flowRows.length,
      totalDelivered,
      openRate: openRate.toFixed(2),
      clickRate: clickRate.toFixed(2),
    })

    return successResponse(request, {
      period,
      metrics: {
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
        ctor: Math.round(ctor * 100) / 100,
        placedOrderRate: Math.round(placedOrderRate * 100) / 100,
        rpe: Math.round(rpe * 100) / 100,
        deliveryRate: Math.round(deliveryRate * 100) / 100,
        bounceRate: Math.round(bounceRate * 100) / 100,
        unsubRate: Math.round(unsubRate * 100) / 100,
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
    log.error("EmailPerf error:", error)
    return errorResponse(request, error, "email-performance")
  }
}
