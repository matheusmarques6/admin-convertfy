/**
 * TEMPORARY diagnostic endpoint — DELETE after Omnisend integration is confirmed working.
 *
 * GET /api/debug/omnisend-discovery?store_id=277d8efb-5c4f-40a3-a8ed-748c4a8b7964
 *
 * Makes 3 discovery calls to the Omnisend API and returns raw responses
 * so we can see the exact shape of campaigns, events, and statistics.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"

export const maxDuration = 60
export const dynamic = "force-dynamic"

async function safeFetch(url: string, options: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) })
    const text = await res.text()
    let body: unknown
    try { body = JSON.parse(text) } catch { body = text.slice(0, 2000) }
    return { status: res.status, body }
  } catch (err) {
    return { status: 0, body: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET(request: NextRequest) {
  const uc = await createClient()
  await requireAuth(uc)

  const storeId = request.nextUrl.searchParams.get("store_id")
  if (!storeId) {
    return NextResponse.json({ error: "store_id required" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: store } = await admin
    .from("client_stores")
    .select("id, store_name, org_id")
    .eq("id", storeId)
    .single()

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 })
  }

  const creds = await getStoreCredentials(storeId, store.org_id)
  const apiKey = creds.omnisend_api_key
  if (!apiKey) {
    return NextResponse.json({ error: "No Omnisend API key for this store" }, { status: 404 })
  }

  const headers = {
    "X-API-KEY": apiKey,
    "Omnisend-Version": "2026-03-15",
    "Content-Type": "application/json",
    "Accept": "application/json",
  }

  // 1. Statistics API discovery
  const statsBody = JSON.stringify({
    metrics: ["totalRevenue", "totalOrders", "attributedRevenue", "attributedOrders"],
    dateFrom: "2026-03-23",
    dateTo: "2026-04-22",
  })

  const [statsV5, statsApi, statsPreview] = await Promise.all([
    safeFetch("https://api.omnisend.com/v5/statistics", { method: "POST", headers, body: statsBody }),
    safeFetch("https://api.omnisend.com/api/statistics", { method: "POST", headers, body: statsBody }),
    safeFetch("https://api.omnisend.com/v5/statistics", {
      method: "POST",
      headers: { ...headers, "Omnisend-Version": "2026-preview" },
      body: statsBody,
    }),
  ])

  // 2. Campaigns v5 (first 3)
  const campaignsV5 = await safeFetch(
    "https://api.omnisend.com/v5/campaigns?limit=3",
    { method: "GET", headers }
  )

  // 2b. Campaign DETAIL (first campaign — does it have stats?)
  const firstCampaignId = (campaignsV5.body as Record<string, unknown[]>)?.campaigns?.[0]
    ? ((campaignsV5.body as Record<string, unknown[]>).campaigns[0] as Record<string, string>).id
    : null
  const campaignDetail = firstCampaignId
    ? await safeFetch(`https://api.omnisend.com/v5/campaigns/${firstCampaignId}`, { method: "GET", headers })
    : { status: 0, body: "no campaign id" }

  // 3. Events — try multiple approaches
  const [eventsPlacedOrder, eventsOrderPlaced, eventsNoFilter, eventsV3] = await Promise.all([
    safeFetch("https://api.omnisend.com/v5/events?eventName=placed%20order&from=2026-03-23T00:00:00Z&to=2026-04-22T23:59:59Z&limit=2", { method: "GET", headers }),
    safeFetch("https://api.omnisend.com/v5/events?eventName=order%20placed&from=2026-03-23T00:00:00Z&to=2026-04-22T23:59:59Z&limit=2", { method: "GET", headers }),
    safeFetch("https://api.omnisend.com/v5/events?limit=2", { method: "GET", headers }),
    safeFetch("https://api.omnisend.com/v3/events?limit=2", { method: "GET", headers }),
  ])

  // 4. Segments + detail of engaged segment
  const segmentsV5 = await safeFetch(
    "https://api.omnisend.com/v5/segments?limit=20",
    { method: "GET", headers }
  )

  // 4b. Segment detail (get contactsCount)
  const engagedSegmentId = "69e904053b8ff34a9533a129"
  const segmentDetail = await safeFetch(
    `https://api.omnisend.com/v5/segments/${engagedSegmentId}`,
    { method: "GET", headers }
  )

  // 5. Orders v3 — try different params
  const [ordersV3default, ordersV3list] = await Promise.all([
    safeFetch("https://api.omnisend.com/v3/orders?limit=2", { method: "GET", headers }),
    safeFetch("https://api.omnisend.com/v3/orders?dateFrom=2026-04-01&dateTo=2026-04-22&limit=2", { method: "GET", headers }),
  ])

  return NextResponse.json({
    store: store.store_name,
    storeId,
    timestamp: new Date().toISOString(),

    "1_statistics_v5": statsV5,
    "2_statistics_api": statsApi,
    "3_statistics_preview": statsPreview,
    "4_campaigns_v5_list": campaignsV5,
    "4b_campaign_detail": campaignDetail,
    "5a_events_placed_order": eventsPlacedOrder,
    "5b_events_order_placed": eventsOrderPlaced,
    "5c_events_no_filter": eventsNoFilter,
    "5d_events_v3": eventsV3,
    "6_segments_list": segmentsV5,
    "6b_segment_detail_engaged": segmentDetail,
    "7a_orders_v3_default": ordersV3default,
    "7b_orders_v3_dated": ordersV3list,
  }, {
    headers: { "Content-Type": "application/json" },
  })
}
