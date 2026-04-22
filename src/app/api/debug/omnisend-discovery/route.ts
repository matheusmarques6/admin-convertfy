/**
 * TEMPORARY diagnostic endpoint — DELETE after Omnisend integration is confirmed working.
 * Round 3: comprehensive discovery of ALL possible data sources for metrics.
 *
 * GET /api/debug/omnisend-discovery?store_id=277d8efb-5c4f-40a3-a8ed-748c4a8b7964
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"

export const maxDuration = 120
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

  const h = {
    "X-API-KEY": apiKey,
    "Omnisend-Version": "2026-03-15",
    "Content-Type": "application/json",
    "Accept": "application/json",
  }
  const GET_OPTS = { method: "GET" as const, headers: h }

  const results: Record<string, unknown> = {
    store: store.store_name,
    storeId,
    timestamp: new Date().toISOString(),
  }

  // ═══════════════════════════════════════════════
  // A. CAMPAIGNS — list + detail + stats + report
  // ═══════════════════════════════════════════════

  const campList = await safeFetch("https://api.omnisend.com/v5/campaigns?limit=3", GET_OPTS)
  results["A1_campaigns_v5_list"] = campList

  const cBody = campList.body as Record<string, unknown[]> | null
  const firstCampId = cBody?.campaigns?.[0]
    ? (cBody.campaigns[0] as Record<string, string>).id
    : null

  if (firstCampId) {
    const [detail, statsEndpoint, reportEndpoint, v3Detail] = await Promise.all([
      safeFetch(`https://api.omnisend.com/v5/campaigns/${firstCampId}`, GET_OPTS),
      safeFetch(`https://api.omnisend.com/v5/campaigns/${firstCampId}/stats`, GET_OPTS),
      safeFetch(`https://api.omnisend.com/v5/campaigns/${firstCampId}/report`, GET_OPTS),
      safeFetch(`https://api.omnisend.com/v3/campaigns/${firstCampId}`, GET_OPTS),
    ])
    results["A2_campaign_v5_detail"] = detail
    results["A3_campaign_v5_stats"] = statsEndpoint
    results["A4_campaign_v5_report"] = reportEndpoint
    results["A5_campaign_v3_detail"] = v3Detail
  } else {
    results["A2_no_campaign_id"] = "no campaigns returned"
  }

  // ═══════════════════════════════════════════════
  // B. AUTOMATIONS — list + detail + stats
  // ═══════════════════════════════════════════════

  const autoList = await safeFetch("https://api.omnisend.com/v5/automations?limit=3", GET_OPTS)
  results["B1_automations_v5_list"] = autoList

  const aBody = autoList.body as Record<string, unknown[]> | null
  const firstAutoId = aBody?.automations?.[0]
    ? (aBody.automations[0] as Record<string, string>).id
    : null

  if (firstAutoId) {
    const [detail, statsEndpoint, reportEndpoint] = await Promise.all([
      safeFetch(`https://api.omnisend.com/v5/automations/${firstAutoId}`, GET_OPTS),
      safeFetch(`https://api.omnisend.com/v5/automations/${firstAutoId}/stats`, GET_OPTS),
      safeFetch(`https://api.omnisend.com/v5/automations/${firstAutoId}/report`, GET_OPTS),
    ])
    results["B2_automation_v5_detail"] = detail
    results["B3_automation_v5_stats"] = statsEndpoint
    results["B4_automation_v5_report"] = reportEndpoint
  }

  // ═══════════════════════════════════════════════
  // C. EVENTS — all name variations for placed order
  // ═══════════════════════════════════════════════

  const eventVariants = await Promise.all([
    safeFetch("https://api.omnisend.com/v5/events?limit=3", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/events?eventName=placed+order&limit=3", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/events?eventName=order+placed&limit=3", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/events?eventName=Placed+Order&limit=3", GET_OPTS),
    safeFetch("https://api.omnisend.com/v3/events?limit=3", GET_OPTS),
  ])
  results["C1_events_v5_no_filter"] = eventVariants[0]
  results["C2_events_placed_order"] = eventVariants[1]
  results["C3_events_order_placed"] = eventVariants[2]
  results["C4_events_Placed_Order"] = eventVariants[3]
  results["C5_events_v3"] = eventVariants[4]

  // ═══════════════════════════════════════════════
  // D. ORDERS — v3 and v5
  // ═══════════════════════════════════════════════

  const orderVariants = await Promise.all([
    safeFetch("https://api.omnisend.com/v3/orders?limit=3", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/orders?limit=3", GET_OPTS),
    safeFetch("https://api.omnisend.com/v3/orders?dateFrom=2026-04-01&dateTo=2026-04-22&limit=3", GET_OPTS),
  ])
  results["D1_orders_v3"] = orderVariants[0]
  results["D2_orders_v5"] = orderVariants[1]
  results["D3_orders_v3_dated"] = orderVariants[2]

  // ═══════════════════════════════════════════════
  // E. REPORTS / ANALYTICS endpoints (guessing paths)
  // ═══════════════════════════════════════════════

  const reportVariants = await Promise.all([
    safeFetch("https://api.omnisend.com/v5/reports", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/analytics", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/reports/campaigns", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/reports/automations", GET_OPTS),
    safeFetch("https://api.omnisend.com/v5/reports/revenue", GET_OPTS),
    safeFetch("https://api.omnisend.com/v3/reports", GET_OPTS),
  ])
  results["E1_reports_v5"] = reportVariants[0]
  results["E2_analytics_v5"] = reportVariants[1]
  results["E3_reports_campaigns_v5"] = reportVariants[2]
  results["E4_reports_automations_v5"] = reportVariants[3]
  results["E5_reports_revenue_v5"] = reportVariants[4]
  results["E6_reports_v3"] = reportVariants[5]

  // ═══════════════════════════════════════════════
  // F. STATISTICS API — all possible paths + body variants
  // ═══════════════════════════════════════════════

  const statsBody1 = JSON.stringify({
    metrics: ["totalRevenue", "totalOrders", "attributedRevenue", "attributedOrders"],
    dateFrom: "2026-03-23",
    dateTo: "2026-04-22",
  })
  const statsBody2 = JSON.stringify({
    metrics: ["totalRevenue", "totalOrders"],
    filter: { dateFrom: "2026-03-23", dateTo: "2026-04-22" },
  })

  const statsVariants = await Promise.all([
    safeFetch("https://api.omnisend.com/v5/statistics", { method: "POST", headers: h, body: statsBody1 }),
    safeFetch("https://api.omnisend.com/v5/statistics", { method: "POST", headers: { ...h, "Omnisend-Version": "2026-preview" }, body: statsBody1 }),
    safeFetch("https://api.omnisend.com/v5/statistics", { method: "POST", headers: h, body: statsBody2 }),
    safeFetch("https://api.omnisend.com/v5/statistics", { method: "GET", headers: h }),
    safeFetch("https://api.omnisend.com/v3/statistics", { method: "POST", headers: h, body: statsBody1 }),
  ])
  results["F1_stats_v5_POST_flat"] = statsVariants[0]
  results["F2_stats_v5_POST_preview"] = statsVariants[1]
  results["F3_stats_v5_POST_filter"] = statsVariants[2]
  results["F4_stats_v5_GET"] = statsVariants[3]
  results["F5_stats_v3_POST"] = statsVariants[4]

  // ═══════════════════════════════════════════════
  // G. SEGMENTS — detail with contactsCount
  // ═══════════════════════════════════════════════

  const engagedId = "69e904053b8ff34a9533a129"
  const todosLeadsId = "69df0f20548f2a4a9d4bf076"

  const [segEngaged, segTodos] = await Promise.all([
    safeFetch(`https://api.omnisend.com/v5/segments/${engagedId}`, GET_OPTS),
    safeFetch(`https://api.omnisend.com/v5/segments/${todosLeadsId}`, GET_OPTS),
  ])
  results["G1_segment_engaged_90d_detail"] = segEngaged
  results["G2_segment_todos_leads_detail"] = segTodos

  // ═══════════════════════════════════════════════
  // H. CONTACTS — count subscribers + total
  // ═══════════════════════════════════════════════

  const contactInfo = await safeFetch("https://api.omnisend.com/v5/contacts?limit=1", GET_OPTS)
  results["H1_contacts_first_page"] = contactInfo

  return NextResponse.json(results, {
    headers: { "Content-Type": "application/json" },
  })
}
