import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { getCachedAccountInfo } from "@/lib/integrations/klaviyo/cached-metadata"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
  getUnifiedFlows,
} from "@/lib/services/unified-metrics.service"
import { logger } from "@/lib/logger"

const log = logger.child("StoresOverview")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = request.nextUrl.searchParams.get("period") || "30d"

    const { data: stores, error: storesErr } = await supabase
      .from("client_stores")
      .select("id, store_name, store_url, platform, email_platform, is_active, client_id, clients(name)")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("store_name")
      .limit(500)

    if (storesErr) throw storesErr
    if (!stores || stores.length === 0) {
      return successResponse(request, { stores: [], period })
    }

    const storeIds = stores.map((s) => s.id)

    const [revenueRows, campaignRows, flowRows] = await Promise.all([
      getUnifiedRevenue(supabase, orgId, [period], storeIds),
      getUnifiedCampaigns(supabase, orgId, period, storeIds),
      getUnifiedFlows(supabase, orgId, period, storeIds, true),
    ])

    const revMap = new Map(revenueRows.map((r) => [r.store_id, r]))
    const campByStore = new Map<string, typeof campaignRows>()
    for (const c of campaignRows) {
      if (!campByStore.has(c.store_id)) campByStore.set(c.store_id, [])
      campByStore.get(c.store_id)!.push(c)
    }
    const flowByStore = new Map<string, typeof flowRows>()
    for (const f of flowRows) {
      if (!flowByStore.has(f.store_id)) flowByStore.set(f.store_id, [])
      flowByStore.get(f.store_id)!.push(f)
    }

    const results = await Promise.all(stores.map(async (store) => {
      const rev = revMap.get(store.id)
      const campaigns = campByStore.get(store.id) || []
      const flows = flowByStore.get(store.id) || []

      // Detecta plataforma: prioriza email_platform do banco; fallback pela fonte com dados
      let platform = (store.email_platform as string) || rev?.platform || "none"
      if (platform !== "klaviyo" && platform !== "omnisend" && platform !== "none") {
        platform = "none"
      }

      // Currency: Klaviyo pega da account info; Omnisend ja esta em currency da loja
      let currency = "BRL"
      if (platform === "klaviyo") {
        try {
          const info = await getCachedAccountInfo(store.id)
          currency = info?.currency || rev?.currency || "BRL"
        } catch { /* fallback */ }
      } else {
        currency = rev?.currency || "BRL"
      }

      const totalRevenue = rev?.total_revenue ?? 0
      const campaignRevenue = rev?.campaign_revenue ?? 0
      const flowRevenue = rev?.flow_revenue ?? 0

      const emailCamps = campaigns.filter((c) => c.channel === "email" || !c.channel)
      const smsCamps = campaigns.filter((c) => c.channel === "sms")

      const emailRevenueOriginal = emailCamps.reduce((s, c) => s + c.conversion_value, 0)
      const smsRevenueOriginal = smsCamps.reduce((s, c) => s + c.conversion_value, 0)
      const emailRecipients = emailCamps.reduce((s, c) => s + c.recipients, 0)
      const smsRecipients = smsCamps.reduce((s, c) => s + c.recipients, 0)

      // Paraleliza as 5 conversoes BRL por loja
      const [totalBRL, campaignBRL, flowBRL, emailBRL, smsBRL] = await Promise.all([
        convertToBRL(totalRevenue, currency),
        convertToBRL(campaignRevenue, currency),
        convertToBRL(flowRevenue, currency),
        convertToBRL(emailRevenueOriginal, currency),
        convertToBRL(smsRevenueOriginal, currency),
      ])

      const campRecipients = campaigns.reduce((s, c) => s + c.recipients, 0)
      const campOpened = campaigns.reduce((s, c) => s + c.opened, 0)
      const campClicked = campaigns.reduce((s, c) => s + c.clicked, 0)
      const campDelivered = campaigns.reduce((s, c) => s + c.delivered, 0)
      const campBounced = campaigns.reduce((s, c) => s + c.bounced, 0)
      const campUnsubs = campaigns.reduce((s, c) => s + c.unsubscribed, 0)

      const flowOpened = flows.reduce((s, f) => s + f.opened, 0)
      const flowClicked = flows.reduce((s, f) => s + f.clicked, 0)
      const flowDelivered = flows.reduce((s, f) => s + f.delivered, 0)
      const flowConversions = flows.reduce((s, f) => s + f.conversions, 0)

      const avgOpenRate = campDelivered > 0 ? (campOpened / campDelivered) * 100 : 0
      const avgClickRate = campDelivered > 0 ? (campClicked / campDelivered) * 100 : 0
      const avgCTOR = campOpened > 0 ? (campClicked / campOpened) * 100 : 0
      const avgBounceRate = campRecipients > 0 ? (campBounced / campRecipients) * 100 : 0
      const avgUnsubRate = campDelivered > 0 ? (campUnsubs / campDelivered) * 100 : 0

      const flowOpenRate = flowDelivered > 0 ? (flowOpened / flowDelivered) * 100 : 0
      const flowClickRate = flowDelivered > 0 ? (flowClicked / flowDelivered) * 100 : 0

      const client = Array.isArray(store.clients) ? store.clients[0] : store.clients

      return {
        id: store.id,
        storeName: store.store_name,
        storeUrl: store.store_url,
        platform: store.platform,
        emailPlatform: platform as "klaviyo" | "omnisend" | "none",
        clientId: store.client_id,
        clientName: client?.name || "—",
        currency,
        totalRevenueBRL: Math.round(totalBRL * 100) / 100,
        email: {
          revenue: Math.round(emailBRL * 100) / 100,
          recipients: emailRecipients,
        },
        sms: {
          revenue: Math.round(smsBRL * 100) / 100,
          recipients: smsRecipients,
        },
        campaigns: {
          revenueBRL: Math.round(campaignBRL * 100) / 100,
          recipients: campRecipients,
          envios: campDelivered,
          openRate: Math.round(avgOpenRate * 100) / 100,
          clickRate: Math.round(avgClickRate * 100) / 100,
          ctor: Math.round(avgCTOR * 100) / 100,
          bounceRate: Math.round(avgBounceRate * 100) / 100,
          unsubRate: Math.round(avgUnsubRate * 100) / 100,
        },
        automations: {
          revenueBRL: Math.round(flowBRL * 100) / 100,
          envios: flowDelivered,
          openRate: Math.round(flowOpenRate * 100) / 100,
          clickRate: Math.round(flowClickRate * 100) / 100,
          conversions: flowConversions,
        },
        audience: {
          totalLeads: rev?.total_leads ?? 0,
          engagedLeads: rev?.engaged_leads ?? 0,
          engagementRate: rev?.engagement_rate ?? 0,
        },
        syncStatus: rev?.sync_status || "pending",
      }
    }))

    results.sort((a, b) => b.totalRevenueBRL - a.totalRevenueBRL)

    return successResponse(request, { stores: results, period })
  } catch (error) {
    log.error("StoresOverview error:", error)
    return errorResponse(request, error, "stores-overview")
  }
}
