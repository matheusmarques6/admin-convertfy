/**
 * TEMPORARY — Round 9: ISOLATE each field type
 * Strategy: use unknown field names for "padding" so only ONE known field
 * is tested at a time. If it parses → that type is correct.
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
    try { body = JSON.parse(text) } catch { body = text.slice(0, 3000) }
    return { status: res.status, body }
  } catch (err) {
    return { status: 0, body: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET(request: NextRequest) {
  const uc = await createClient()
  await requireAuth(uc)

  const storeId = request.nextUrl.searchParams.get("store_id") || "277d8efb-5c4f-40a3-a8ed-748c4a8b7964"
  const admin = createAdminClient()
  const { data: store } = await admin.from("client_stores").select("id, store_name, org_id").eq("id", storeId).single()
  if (!store) return NextResponse.json({ error: "not found" }, { status: 404 })

  const creds = await getStoreCredentials(storeId, store.org_id)
  const apiKey = creds.omnisend_api_key
  if (!apiKey) return NextResponse.json({ error: "no key" }, { status: 404 })

  const h = {
    "Authorization": `Omnisend-API-Key ${apiKey}`,
    "Omnisend-Version": "2026-preview",
    "Content-Type": "application/json",
    "Accept": "application/json",
  }

  const url = "https://api.omnisend.com/api/analytics/statistics"
  const results: Record<string, unknown> = { store: store.store_name }

  // BASELINE: alias only (all others missing = get validation errors)
  results["a_baseline"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test" }]
  })})

  // TEST metrics — is it an array of strings?
  results["b1_metrics_array"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"] }]
  })})

  // TEST metrics — array of objects?
  results["b2_metrics_obj_array"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: [{ name: "totalRevenue" }] }]
  })})

  // TEST dateRange — object with from/to?
  results["c1_dateRange_obj"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", dateRange: { from: "2026-03-23", to: "2026-04-22" } }]
  })})

  // TEST dateRange — object with start/end?
  results["c2_dateRange_start_end"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", dateRange: { start: "2026-03-23", end: "2026-04-22" } }]
  })})

  // TEST dateRange — object with startDate/endDate?
  results["c3_dateRange_startDate"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", dateRange: { startDate: "2026-03-23", endDate: "2026-04-22" } }]
  })})

  // TEST dimensions — array of strings?
  results["d1_dims_str_array"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", dimensions: ["timestamp"] }]
  })})

  // TEST dimensions — array of objects?
  results["d2_dims_obj_array"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", dimensions: [{ name: "timestamp" }] }]
  })})

  // TEST dimensions — object?
  results["d3_dims_obj"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", dimensions: { timestamp: "day" } }]
  })})

  // COMBO: metrics + dateRange (if b1 and c1 both parse)
  results["e1_metrics_dateRange"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateRange: { from: "2026-03-23", to: "2026-04-22" } }]
  })})

  // COMBO: all 4 fields
  results["e2_all_four"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateRange: { from: "2026-03-23", to: "2026-04-22" }, dimensions: ["timestamp"] }]
  })})

  return NextResponse.json(results, { headers: { "Content-Type": "application/json" } })
}
