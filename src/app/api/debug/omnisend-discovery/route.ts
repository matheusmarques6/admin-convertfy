/**
 * TEMPORARY — Round 7: Build up from the v4 base that DID parse
 * v4 (round 5) gave detailed errors = JSON parsed OK but fields missing
 * All round 6 variants gave "invalid request body" = JSON rejected
 * Strategy: start from v4 base, add one field at a time
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

  // BASE: exact same as v4 from round 5 (this one got detailed errors = parsing OK)
  results["t01_base_v4"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ metric: "totalRevenue", dateFrom: "2026-03-23", dateTo: "2026-04-22" }]
  })})

  // T02: add alias
  results["t02_add_alias"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metric: "totalRevenue", dateFrom: "2026-03-23", dateTo: "2026-04-22" }]
  })})

  // T03: alias + metrics array (not metric string)
  results["t03_metrics_array"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateFrom: "2026-03-23", dateTo: "2026-04-22" }]
  })})

  // T04: alias + metrics + dateRange as string
  results["t04_dateRange_string"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateRange: "2026-03-23/2026-04-22" }]
  })})

  // T05: alias + metrics + dateRange as object with from/to
  results["t05_dateRange_obj"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateRange: { from: "2026-03-23", to: "2026-04-22" } }]
  })})

  // T06: alias + metrics + dateRange obj + dimensions as object
  results["t06_dims_object"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateRange: { from: "2026-03-23", to: "2026-04-22" }, dimensions: { timestamp: "day" } }]
  })})

  // T07: alias + metrics + dateRange obj + dimensions as array of objects
  results["t07_dims_array_obj"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateRange: { from: "2026-03-23", to: "2026-04-22" }, dimensions: [{ type: "timestamp", granularity: "day" }] }]
  })})

  // T08: alias + metrics + dateRange obj + timestamp dimension as {name,value}
  results["t08_dims_name_value"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], dateRange: { from: "2026-03-23", to: "2026-04-22" }, dimensions: [{ name: "timestamp", value: "day" }] }]
  })})

  // T09: everything flat — alias + metrics + from + to + dimensions as strings array
  results["t09_flat_from_to"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ alias: "test", metrics: ["totalRevenue"], from: "2026-03-23", to: "2026-04-22", dimensions: ["timestamp"] }]
  })})

  // T10: try the /reports endpoint with same base format
  results["t10_reports_base"] = await safeFetch("https://api.omnisend.com/api/analytics/reports", { method: "POST", headers: h, body: JSON.stringify({
    queries: [{ metric: "totalRevenue", dateFrom: "2026-03-23", dateTo: "2026-04-22" }]
  })})

  // T11: try completely different structure — maybe it's not "queries" but "query"
  results["t11_query_singular"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    query: { alias: "test", metrics: ["totalRevenue"], dateRange: { from: "2026-03-23", to: "2026-04-22" }, dimensions: ["timestamp"] }
  })})

  // T12: empty queries to get validation hints
  results["t12_empty_query"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{}]
  })})

  return NextResponse.json(results, { headers: { "Content-Type": "application/json" } })
}
