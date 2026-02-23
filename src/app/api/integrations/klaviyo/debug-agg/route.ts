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
    const startStr = start.toISOString().split("T")[0]
    const endStr = now.toISOString().split("T")[0]

    // Test 1: Simple format (no timezone offset in filter)
    const body1 = {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements: ["value", "count"],
          filter: [
            `greater-or-equal(datetime,${startStr}T00:00:00)`,
            `less-than(datetime,${endStr}T23:59:59)`,
          ],
          timezone: "America/Sao_Paulo",
        },
      },
    }

    const res1 = await fetch(`${KLAVIYO_API_URL}/metric-aggregates/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body1),
    })
    const text1 = await res1.text()

    // Test 2: With interval
    const body2 = {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements: ["value", "count"],
          filter: [
            `greater-or-equal(datetime,${startStr}T00:00:00)`,
            `less-than(datetime,${endStr}T23:59:59)`,
          ],
          interval: "month",
          timezone: "America/Sao_Paulo",
        },
      },
    }

    await new Promise(r => setTimeout(r, 1200))
    const res2 = await fetch(`${KLAVIYO_API_URL}/metric-aggregates/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body2),
    })
    const text2 = await res2.text()

    // Test 3: With timezone offset in filter (what performance route sends)
    const body3 = {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements: ["value", "count"],
          filter: [
            `greater-or-equal(datetime,${startStr}T00:00:00-03:00)`,
            `less-than(datetime,${endStr}T23:59:59-03:00)`,
          ],
          timezone: "America/Sao_Paulo",
        },
      },
    }

    await new Promise(r => setTimeout(r, 1200))
    const res3 = await fetch(`${KLAVIYO_API_URL}/metric-aggregates/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body3),
    })
    const text3 = await res3.text()

    return NextResponse.json({
      metricId,
      period: { start: startStr, end: endStr },
      test1_noOffset: {
        status: res1.status,
        body: text1.slice(0, 800),
      },
      test2_withInterval: {
        status: res2.status,
        body: text2.slice(0, 800),
      },
      test3_withTzOffset: {
        status: res3.status,
        body: text3.slice(0, 800),
      },
    })
  } catch (error) {
    return errorResponse(request, error, "KlaviyoDebugAgg")
  }
}
