import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { getCachedAccountInfo } from "@/lib/integrations/klaviyo/cached-metadata"
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
      .select("id, store_name, store_url, platform, is_active, client_id, clients(name)")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("store_name")

    if (storesErr) throw storesErr
    if (!stores || stores.length === 0) {
      return successResponse(request, { stores: [], period })
    }

    const storeIds = stores.map((s) => s.id)

    const [{ data: revRows }, { data: campRows }, { data: flowRows }] = await Promise.all([
      supabase
        .from("store_revenue_summary")
        .select("store_id, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue, store_total_revenue, total_leads, engaged_leads, engagement_rate, store_orders, currency, sync_status")
        .eq("org_id", orgId)
        .eq("period_label", period)
        .in("store_id", storeIds),
      supabase
        .from("klaviyo_campaign_metrics")
        .select("store_id, campaign_id, campaign_name, channel, recipients, delivered, opened, open_rate, clicked, click_rate, click_to_open_rate, conversions, conversion_rate, conversion_value, bounced, bounce_rate, unsubscribed, unsubscribe_rate")
        .eq("org_id", orgId)
        .eq("period_label", period)
        .in("store_id", storeIds),
      supabase
        .from("klaviyo_flow_metrics")
        .select("store_id, flow_id, flow_name, flow_status, recipients, delivered, opened, open_rate, clicked, click_rate, click_to_open_rate, conversions, conversion_rate, conversion_value, bounced, bounce_rate, unsubscribed, unsubscribe_rate")
        .eq("org_id", orgId)
        .eq("period_label", period)
        .eq("flow_status", "live")
        .in("store_id", storeIds),
    ])

    const revMap = new Map((revRows || []).map((r) => [r.store_id, r]))
    const campByStore = new Map<string, typeof campRows>()
    for (const c of campRows || []) {
      if (!campByStore.has(c.store_id)) campByStore.set(c.store_id, [])
      campByStore.get(c.store_id)!.push(c)
    }
    const flowByStore = new Map<string, typeof flowRows>()
    for (const f of flowRows || []) {
      if (!flowByStore.has(f.store_id)) flowByStore.set(f.store_id, [])
      flowByStore.get(f.store_id)!.push(f)
    }

    const results = await Promise.all(stores.map(async (store) => {
      const rev = revMap.get(store.id)
      const campaigns = campByStore.get(store.id) || []
      const flows = flowByStore.get(store.id) || []

      let currency = "BRL"
      try {
        const info = await getCachedAccountInfo(store.id)
        currency = info?.currency || rev?.currency || "BRL"
      } catch { /* fallback */ }

      const totalRevenue = Number(rev?.klaviyo_total_revenue) || 0
      const campaignRevenue = Number(rev?.klaviyo_campaign_revenue) || 0
      const flowRevenue = Number(rev?.klaviyo_flow_revenue) || 0

      const totalBRL = await convertToBRL(totalRevenue, currency)
      const campaignBRL = await convertToBRL(campaignRevenue, currency)
      const flowBRL = await convertToBRL(flowRevenue, currency)

      const emailCamps = campaigns.filter((c) => c.channel === "email" || !c.channel)
      const smsCamps = campaigns.filter((c) => c.channel === "sms")

      const emailRevenue = emailCamps.reduce((s, c) => s + (Number(c.conversion_value) || 0), 0)
      const smsRevenue = smsCamps.reduce((s, c) => s + (Number(c.conversion_value) || 0), 0)

      const emailRecipients = emailCamps.reduce((s, c) => s + (Number(c.recipients) || 0), 0)
      const smsRecipients = smsCamps.reduce((s, c) => s + (Number(c.recipients) || 0), 0)

      const campRecipients = campaigns.reduce((s, c) => s + (Number(c.recipients) || 0), 0)
      const campOpened = campaigns.reduce((s, c) => s + (Number(c.opened) || 0), 0)
      const campClicked = campaigns.reduce((s, c) => s + (Number(c.clicked) || 0), 0)
      const campDelivered = campaigns.reduce((s, c) => s + (Number(c.delivered) || 0), 0)
      const campBounced = campaigns.reduce((s, c) => s + (Number(c.bounced) || 0), 0)
      const campUnsubs = campaigns.reduce((s, c) => s + (Number(c.unsubscribed) || 0), 0)

      const _flowRecipients = flows.reduce((s, f) => s + (Number(f.recipients) || 0), 0)
      const flowOpened = flows.reduce((s, f) => s + (Number(f.opened) || 0), 0)
      const flowClicked = flows.reduce((s, f) => s + (Number(f.clicked) || 0), 0)
      const flowDelivered = flows.reduce((s, f) => s + (Number(f.delivered) || 0), 0)
      const flowConversions = flows.reduce((s, f) => s + (Number(f.conversions) || 0), 0)

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
        clientId: store.client_id,
        clientName: client?.name || "—",
        currency,
        totalRevenueBRL: Math.round(totalBRL * 100) / 100,
        email: {
          revenue: await convertToBRL(emailRevenue, currency),
          recipients: emailRecipients,
        },
        sms: {
          revenue: await convertToBRL(smsRevenue, currency),
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
          totalLeads: Number(rev?.total_leads) || 0,
          engagedLeads: Number(rev?.engaged_leads) || 0,
          engagementRate: Number(rev?.engagement_rate) || 0,
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
