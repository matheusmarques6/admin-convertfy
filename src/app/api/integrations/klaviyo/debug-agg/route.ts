import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { corsHeaders } from "@/lib/cors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { KLAVIYO_API_URL, KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"
import { findPlacedOrderMetric } from "@/lib/integrations/klaviyo/metrics"

/**
 * GET /api/integrations/klaviyo/debug-agg?store_id=XXX
 *
 * Debug: test metric-aggregates endpoint to see raw response.
 * TEMPORARY - remove after fixing storeRevenue.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) throw new AppError("store_id required", 400)

    const creds = await getStoreCredentials(storeId)
    const apiKey = creds.klaviyo_private_key || creds.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({ error: "No API key" }, { status: 400, headers: corsHeaders(request.headers.get("origin")) })
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
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "KlaviyoDebugAgg")
  }
}
