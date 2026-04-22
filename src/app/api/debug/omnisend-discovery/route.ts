/**
 * TEMPORARY — Round 6: Statistics API with CORRECT body format
 * Required fields: alias, metrics[], dateRange{from,to}, dimensions[]
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

  // V1: all required fields from error message
  results["v1_correct_format"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "revenue_30d",
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue", "attributedOrders"],
      dateRange: { from: "2026-03-23", to: "2026-04-22" },
      dimensions: ["timestamp"]
    }]
  })})

  // V2: date range as ISO datetime
  results["v2_iso_dates"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "revenue",
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue"],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: ["timestamp"]
    }]
  })})

  // V3: dimension as "day" instead of "timestamp"
  results["v3_day_dimension"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: ["totalRevenue", "totalOrders"],
      dateRange: { from: "2026-03-23", to: "2026-04-22" },
      dimensions: ["day"]
    }]
  })})

  // V4: dimension as "date"
  results["v4_date_dimension"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: ["totalRevenue"],
      dateRange: { from: "2026-03-23", to: "2026-04-22" },
      dimensions: ["date"]
    }]
  })})

  // V5: multiple dimensions including campaign
  results["v5_campaign_dimension"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "by_campaign",
      metrics: ["totalRevenue", "attributedRevenue"],
      dateRange: { from: "2026-03-23", to: "2026-04-22" },
      dimensions: ["timestamp", "campaign"]
    }]
  })})

  // V6: try "month" dimension
  results["v6_month_dimension"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: ["totalRevenue", "attributedRevenue", "totalOrders"],
      dateRange: { from: "2026-03-23", to: "2026-04-22" },
      dimensions: ["month"]
    }]
  })})

  // V7: try with just totalRevenue as single metric
  results["v7_single_totalRevenue"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "test",
      metrics: ["totalRevenue"],
      dateRange: { from: "2026-03-23", to: "2026-04-22" },
      dimensions: ["timestamp"]
    }]
  })})

  // V8: stable version header instead of preview
  results["v8_stable_version"] = await safeFetch(url, { method: "POST", headers: { ...h, "Omnisend-Version": "2026-03-15" }, body: JSON.stringify({
    queries: [{
      alias: "revenue",
      metrics: ["totalRevenue", "totalOrders", "attributedRevenue"],
      dateRange: { from: "2026-03-23", to: "2026-04-22" },
      dimensions: ["timestamp"]
    }]
  })})

  return NextResponse.json(results, { headers: { "Content-Type": "application/json" } })
}
