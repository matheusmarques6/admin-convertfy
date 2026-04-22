/**
 * TEMPORARY — Round 5: Statistics API body format discovery
 * The endpoint EXISTS (400 not 404) but needs { queries: [...] } format
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
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const creds = await getStoreCredentials(storeId, store.org_id)
  const apiKey = creds.omnisend_api_key
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 404 })

  const h = {
    "Authorization": `Omnisend-API-Key ${apiKey}`,
    "Omnisend-Version": "2026-preview",
    "Content-Type": "application/json",
    "Accept": "application/json",
  }

  const url = "https://api.omnisend.com/api/analytics/statistics"
  const results: Record<string, unknown> = { store: store.store_name, timestamp: new Date().toISOString() }

  // Variant 1: queries array with metrics + date range
  results["v1_queries_array"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue", "attributedOrders"],
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22"
    }]
  })})

  // Variant 2: queries with filter object
  results["v2_queries_with_filter"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue", "attributedOrders"],
      filter: { dateFrom: "2026-03-23", dateTo: "2026-04-22" }
    }]
  })})

  // Variant 3: queries with name + period
  results["v3_queries_named"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      name: "revenue_30d",
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue"],
      period: { from: "2026-03-23", to: "2026-04-22" }
    }]
  })})

  // Variant 4: single metric, minimal
  results["v4_single_metric"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      metric: "totalRevenue",
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22"
    }]
  })})

  // Variant 5: queries with dimensions (groupBy)
  results["v5_with_dimensions"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      metrics: ["totalRevenue", "attributedRevenue"],
      dimensions: ["channel"],
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22"
    }]
  })})

  // Variant 6: try the /reports endpoint too
  results["v6_reports_queries"] = await safeFetch("https://api.omnisend.com/api/analytics/reports", { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue"],
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22"
    }]
  })})

  // Variant 7: try with stable version header
  results["v7_stable_version"] = await safeFetch(url, { method: "POST", headers: { ...h, "Omnisend-Version": "2026-03-15" }, body: JSON.stringify({
    queries: [{
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue", "attributedOrders"],
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22"
    }]
  })})

  // Variant 8: metrics as string not array
  results["v8_metrics_string"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      metrics: "totalRevenue,totalOrders,attributedRevenue",
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22"
    }]
  })})

  return NextResponse.json(results, { headers: { "Content-Type": "application/json" } })
}
