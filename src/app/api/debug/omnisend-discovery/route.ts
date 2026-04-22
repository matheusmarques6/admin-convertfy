/**
 * TEMPORARY — Round 10: FINAL FORMAT — all types confirmed
 * metrics: [{ name: "..." }]
 * dateRange: { from: "RFC3339", to: "RFC3339" }
 * dimensions: [{ name: "timestamp", granularity: "..." }]
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
    try { body = JSON.parse(text) } catch { body = text.slice(0, 5000) }
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

  // F1: granularity "day"
  results["f1_day"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "revenue_30d",
      metrics: [
        { name: "totalRevenue" },
        { name: "totalOrders" },
        { name: "attributedRevenue" },
        { name: "attributedOrders" }
      ],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: [{ name: "timestamp", granularity: "day" }]
    }]
  })})

  // F2: granularity "month"
  results["f2_month"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: [{ name: "totalRevenue" }, { name: "attributedRevenue" }],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: [{ name: "timestamp", granularity: "month" }]
    }]
  })})

  // F3: granularity "total" (aggregate)
  results["f3_total"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: [{ name: "totalRevenue" }],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: [{ name: "timestamp", granularity: "total" }]
    }]
  })})

  // F4: single metric totalRevenue with day granularity
  results["f4_single_metric"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "test",
      metrics: [{ name: "totalRevenue" }],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: [{ name: "timestamp", granularity: "day" }]
    }]
  })})

  // F5: with campaign dimension
  results["f5_campaign_dim"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "by_campaign",
      metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: [
        { name: "timestamp", granularity: "month" },
        { name: "campaign" }
      ]
    }]
  })})

  // F6: with workflow/automation dimension
  results["f6_workflow_dim"] = await safeFetch(url, { method: "POST", headers: h, body: JSON.stringify({
    queries: [{
      alias: "by_workflow",
      metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: [
        { name: "timestamp", granularity: "month" },
        { name: "workflow" }
      ]
    }]
  })})

  // F7: stable version header
  results["f7_stable"] = await safeFetch(url, { method: "POST", headers: { ...h, "Omnisend-Version": "2026-03-15" }, body: JSON.stringify({
    queries: [{
      alias: "rev",
      metrics: [{ name: "totalRevenue" }, { name: "totalOrders" }],
      dateRange: { from: "2026-03-23T00:00:00Z", to: "2026-04-22T23:59:59Z" },
      dimensions: [{ name: "timestamp", granularity: "day" }]
    }]
  })})

  return NextResponse.json(results, { headers: { "Content-Type": "application/json" } })
}
