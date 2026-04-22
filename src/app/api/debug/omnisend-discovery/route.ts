/**
 * TEMPORARY — Round 8: ALL FLAT STRINGS (no arrays/objects in query items)
 *
 * Pattern: queries with array values = "invalid request body"
 *          queries with only string values = detailed validation errors
 *
 * Hypothesis: metrics/dimensions/dateRange must be strings, not arrays/objects
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

  const statsUrl = "https://api.omnisend.com/api/analytics/statistics"
  const reportsUrl = "https://api.omnisend.com/api/analytics/reports"
  const results: Record<string, unknown> = { store: store.store_name }

  // ALL FLAT STRINGS — no arrays, no nested objects

  // S1: all 4 required fields as strings
  results["s1_all_strings"] = await safeFetch(statsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      dateRange: "2026-03-23/2026-04-22",
      dimensions: "timestamp"
    }]
  })})

  // S2: metrics comma-separated
  results["s2_metrics_csv"] = await safeFetch(statsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue,totalOrders,attributedRevenue",
      dateRange: "2026-03-23/2026-04-22",
      dimensions: "timestamp"
    }]
  })})

  // S3: dateRange as from/to strings
  results["s3_dateRange_from_to"] = await safeFetch(statsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22",
      dimensions: "timestamp"
    }]
  })})

  // S4: dimensions as "day"
  results["s4_dim_day"] = await safeFetch(statsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      dateRange: "2026-03-23/2026-04-22",
      dimensions: "day"
    }]
  })})

  // S5: dimensions as "date"
  results["s5_dim_date"] = await safeFetch(statsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      dateRange: "2026-03-23/2026-04-22",
      dimensions: "date"
    }]
  })})

  // S6: try metric (singular) instead of metrics
  results["s6_metric_singular"] = await safeFetch(statsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metric: "totalRevenue",
      dateRange: "2026-03-23/2026-04-22",
      dimensions: "timestamp"
    }]
  })})

  // S7: interval field (from /reports error hint)
  results["s7_with_interval"] = await safeFetch(statsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      dateRange: "2026-03-23/2026-04-22",
      dimensions: "timestamp",
      interval: "day"
    }]
  })})

  // REPORTS endpoint — different required fields (interval instead of dimensions)
  // R1: all flat strings
  results["r1_reports_flat"] = await safeFetch(reportsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      interval: "day",
      dateFrom: "2026-03-23",
      dateTo: "2026-04-22"
    }]
  })})

  // R2: with dateRange string
  results["r2_reports_dateRange"] = await safeFetch(reportsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      interval: "month",
      dateRange: "2026-03-23/2026-04-22"
    }]
  })})

  // R3: interval as part of dateRange
  results["r3_reports_interval_in_dateRange"] = await safeFetch(reportsUrl, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: "totalRevenue",
      dateRange: "2026-03-23/2026-04-22",
      interval: "day"
    }]
  })})

  return NextResponse.json(results, { headers: { "Content-Type": "application/json" } })
}
