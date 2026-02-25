import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse } from "@/lib/api/errors"
import { KLAVIYO_API_URL, KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"
import { findPlacedOrderMetric } from "@/lib/integrations/klaviyo/metrics"
import { decryptStoreCredentials } from "@/lib/crypto"

/**
 * GET /api/integrations/klaviyo/debug-agg?store_id=XXX
 *
 * Debug: test metric-aggregates endpoint to see raw response.
 * TEMPORARY - remove after fixing storeRevenue.
 */
export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      return NextResponse.json({ error: "store_id required" }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data: rawStore, error: storeErr } = await adminClient
      .from("client_stores")
      .select("id, store_name, klaviyo_api_key, klaviyo_private_key")
      .eq("id", storeId)
      .single()

    if (storeErr || !rawStore) {
      return NextResponse.json({ error: "Store not found", storeId, dbError: storeErr?.message }, { status: 404 })
    }

    const store = decryptStoreCredentials(rawStore)
    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({ error: "No API key", storeName: rawStore.store_name }, { status: 400 })
    }

    const headers = {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "revision": KLAVIYO_REVISION,
    }

    // Find metric
    const metricId = await findPlacedOrderMetric(apiKey)

    const now = new Date()
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, "0")
    const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
    const endStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    // Use interval:"day" for accurate totals matching Klaviyo dashboard
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const nextDayStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`

    const body = {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements: ["sum_value", "count"],
          interval: "day",
          page_size: 500,
          filter: [
            `greater-or-equal(datetime,${startStr}T00:00:00)`,
            `less-than(datetime,${nextDayStr}T00:00:00)`,
          ],
          timezone: "America/Sao_Paulo",
        },
      },
    }

    const res = await fetch(`${KLAVIYO_API_URL}/metric-aggregates/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    const json = await res.json()

    return NextResponse.json({
      metricId,
      period: { start: startStr, end: endStr },
      status: res.status,
      fullResponse: json,
    })
  } catch (error) {
    return errorResponse(request, error, "KlaviyoDebugAgg")
  }
}
