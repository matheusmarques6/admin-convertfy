/**
 * TEMPORARY diagnostic endpoint — Round 4: NEW API format discovery
 * Tests /api/* base URL + Authorization: Omnisend-API-Key header
 *
 * GET /api/debug/omnisend-discovery?store_id=277d8efb-5c4f-40a3-a8ed-748c4a8b7964
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"

export const maxDuration = 120
export const dynamic = "force-dynamic"

async function safeFetch(url: string, options: RequestInit): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) })
    const text = await res.text()
    let body: unknown
    try { body = JSON.parse(text) } catch { body = text.slice(0, 2000) }
    const h: Record<string, string> = {}
    res.headers.forEach((v, k) => { if (k.startsWith("x-rate") || k === "content-type") h[k] = v })
    return { status: res.status, body, headers: h }
  } catch (err) {
    return { status: 0, body: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET(request: NextRequest) {
  const uc = await createClient()
  await requireAuth(uc)

  const storeId = request.nextUrl.searchParams.get("store_id")
  if (!storeId) return NextResponse.json({ error: "store_id required" }, { status: 400 })

  const admin = createAdminClient()
  const { data: store } = await admin.from("client_stores").select("id, store_name, org_id").eq("id", storeId).single()
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const creds = await getStoreCredentials(storeId, store.org_id)
  const apiKey = creds.omnisend_api_key
  if (!apiKey) return NextResponse.json({ error: "No Omnisend API key" }, { status: 404 })

  // ═══ NEW FORMAT (2026-03-15) ═══
  const newH = {
    "Authorization": `Omnisend-API-Key ${apiKey}`,
    "Omnisend-Version": "2026-03-15",
    "Content-Type": "application/json",
    "Accept": "application/json",
  }
  const newPreviewH = { ...newH, "Omnisend-Version": "2026-preview" }

  // ═══ OLD FORMAT (v5) ═══
  const oldH = {
    "X-API-KEY": apiKey,
    "Omnisend-Version": "2026-03-15",
    "Content-Type": "application/json",
    "Accept": "application/json",
  }

  const results: Record<string, unknown> = {
    store: store.store_name,
    storeId,
    timestamp: new Date().toISOString(),
    note: "Testing NEW /api/ base + Authorization header vs OLD /v5/ + X-API-KEY",
  }

  // ═══════════════════════════════════════════════════════
  // 1. STATISTICS API — the big prize
  // ═══════════════════════════════════════════════════════

  const statsBody = JSON.stringify({
    metrics: ["totalRevenue", "totalOrders", "attributedRevenue", "attributedOrders"],
    dateFrom: "2026-03-23",
    dateTo: "2026-04-22",
  })

  const [stats1, stats2, stats3, stats4] = await Promise.all([
    safeFetch("https://api.omnisend.com/api/analytics/statistics", { method: "POST", headers: newPreviewH, body: statsBody }),
    safeFetch("https://api.omnisend.com/api/analytics/statistics", { method: "POST", headers: newH, body: statsBody }),
    safeFetch("https://api.omnisend.com/api/analytics/reports", { method: "POST", headers: newPreviewH, body: statsBody }),
    safeFetch("https://api.omnisend.com/api/analytics/reports", { method: "POST", headers: newH, body: statsBody }),
  ])
  results["1a_stats_api_analytics_statistics_preview"] = stats1
  results["1b_stats_api_analytics_statistics_stable"] = stats2
  results["1c_stats_api_analytics_reports_preview"] = stats3
  results["1d_stats_api_analytics_reports_stable"] = stats4

  // ═══════════════════════════════════════════════════════
  // 2. CAMPAIGNS — new /api/ vs old /v5/
  // ═══════════════════════════════════════════════════════

  const [campNew, campOld] = await Promise.all([
    safeFetch("https://api.omnisend.com/api/campaigns?limit=2", { method: "GET", headers: newH }),
    safeFetch("https://api.omnisend.com/v5/campaigns?limit=2", { method: "GET", headers: oldH }),
  ])
  results["2a_campaigns_api_new"] = campNew
  results["2b_campaigns_v5_old"] = campOld

  // Campaign detail — test both bases
  const campId = "69e14d8f79a3cd36b467613b" // first Azzurro campaign
  const [campDetailNew, campDetailOld, campDetailV3] = await Promise.all([
    safeFetch(`https://api.omnisend.com/api/campaigns/${campId}`, { method: "GET", headers: newH }),
    safeFetch(`https://api.omnisend.com/v5/campaigns/${campId}`, { method: "GET", headers: oldH }),
    safeFetch(`https://api.omnisend.com/v3/campaigns/${campId}`, { method: "GET", headers: oldH }),
  ])
  results["2c_campaign_detail_api_new"] = campDetailNew
  results["2d_campaign_detail_v5_old"] = campDetailOld
  results["2e_campaign_detail_v3_old"] = campDetailV3

  // ═══════════════════════════════════════════════════════
  // 3. AUTOMATIONS — new /api/ vs old /v5/
  // ═══════════════════════════════════════════════════════

  const autoId = "69d7f14d6b68a572d0746102" // Welcome Flow
  const [autoNew, autoDetailNew, autoDetailOld] = await Promise.all([
    safeFetch("https://api.omnisend.com/api/automations?limit=2", { method: "GET", headers: newH }),
    safeFetch(`https://api.omnisend.com/api/automations/${autoId}`, { method: "GET", headers: newH }),
    safeFetch(`https://api.omnisend.com/v5/automations/${autoId}`, { method: "GET", headers: oldH }),
  ])
  results["3a_automations_api_new"] = autoNew
  results["3b_automation_detail_api_new"] = autoDetailNew
  results["3c_automation_detail_v5_old"] = autoDetailOld

  // ═══════════════════════════════════════════════════════
  // 4. EVENTS — new /api/ format
  // ═══════════════════════════════════════════════════════

  const [eventsNew, eventsNewPlaced] = await Promise.all([
    safeFetch("https://api.omnisend.com/api/events?limit=2", { method: "GET", headers: newH }),
    safeFetch("https://api.omnisend.com/api/events?eventName=placed+order&limit=2", { method: "GET", headers: newH }),
  ])
  results["4a_events_api_new_no_filter"] = eventsNew
  results["4b_events_api_new_placed_order"] = eventsNewPlaced

  // ═══════════════════════════════════════════════════════
  // 5. ORDERS — new /api/ format
  // ═══════════════════════════════════════════════════════

  const ordersNew = await safeFetch("https://api.omnisend.com/api/orders?limit=2", { method: "GET", headers: newH })
  results["5a_orders_api_new"] = ordersNew

  // ═══════════════════════════════════════════════════════
  // 6. SEGMENTS — new /api/ with contactsCount?
  // ═══════════════════════════════════════════════════════

  const engagedId = "69e904053b8ff34a9533a129"
  const [segNew, segDetailNew, segContactsNew] = await Promise.all([
    safeFetch("https://api.omnisend.com/api/segments?limit=5", { method: "GET", headers: newH }),
    safeFetch(`https://api.omnisend.com/api/segments/${engagedId}`, { method: "GET", headers: newH }),
    safeFetch(`https://api.omnisend.com/api/segments/${engagedId}/contacts?limit=1`, { method: "GET", headers: newH }),
  ])
  results["6a_segments_api_new"] = segNew
  results["6b_segment_detail_api_new"] = segDetailNew
  results["6c_segment_contacts_api_new"] = segContactsNew

  // ═══════════════════════════════════════════════════════
  // 7. CONTACTS — new /api/ (check paging.total)
  // ═══════════════════════════════════════════════════════

  const contactsNew = await safeFetch("https://api.omnisend.com/api/contacts?limit=1", { method: "GET", headers: newH })
  results["7a_contacts_api_new"] = contactsNew

  return NextResponse.json(results, { headers: { "Content-Type": "application/json" } })
}
