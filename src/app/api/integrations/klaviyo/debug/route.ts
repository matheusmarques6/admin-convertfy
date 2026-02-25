import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { corsHeaders } from "@/lib/cors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { KLAVIYO_API_URL, KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"

/**
 * GET /api/integrations/klaviyo/debug?store_id=XXX
 *
 * Tests which statistics the Klaviyo Reporting API accepts for
 * flow-values-reports in revision 2024-10-15.
 * Tests each statistic individually to find which ones are valid.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const creds = await getStoreCredentials(storeId)
    const apiKey = creds.klaviyo_private_key || creds.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({ error: "No API key" }, { status: 400, headers: corsHeaders(request.headers.get("origin")) })
    }

    const postHeaders = {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "revision": KLAVIYO_REVISION,
    }

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, "0")
    const startStr = `${thirtyDaysAgo.getFullYear()}-${pad(thirtyDaysAgo.getMonth() + 1)}-${pad(thirtyDaysAgo.getDate())}`
    const endStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    // Valid statistics per Klaviyo Reporting API docs (revision 2024-10-15)
    // API uses "opens"/"clicks" (NOT "opened"/"clicked")
    const allStats = [
      "average_order_value",
      "bounce_rate",
      "bounced",
      "click_rate",
      "click_to_open_rate",
      "clicks",
      "clicks_unique",
      "conversion_rate",
      "conversion_uniques",
      "conversion_value",
      "conversions",
      "delivered",
      "delivery_rate",
      "opens",
      "opens_unique",
      "recipients",
      "revenue_per_recipient",
      "unsubscribe_rate",
      "unsubscribes",
    ]

    // Test each statistic individually against flow-values-reports
    const statResults: Record<string, string> = {}

    for (const stat of allStats) {
      const body = {
        data: {
          type: "flow-values-report",
          attributes: {
            statistics: [stat],
            timeframe: {
              start: `${startStr}T00:00:00-03:00`,
              end: `${endStr}T23:59:59-03:00`,
            },
            conversion_metric_id: "RuR2Vf",
          },
        },
      }

      try {
        const res = await fetch(`${KLAVIYO_API_URL}/flow-values-reports/`, {
          method: "POST",
          headers: postHeaders,
          body: JSON.stringify(body),
        })

        if (res.status === 200) {
          const json = await res.json()
          const results = json?.data?.attributes?.results || []
          statResults[stat] = `OK (${results.length} results)`
        } else {
          const json = await res.json()
          const detail = json?.errors?.[0]?.detail || `HTTP ${res.status}`
          statResults[stat] = `FAIL: ${detail}`
        }
      } catch (e) {
        statResults[stat] = `ERROR: ${String(e)}`
      }

      await sleep(1200) // Reporting API: 1 req/s
    }

    // Separate into valid and invalid
    const validStats = Object.entries(statResults)
      .filter(([, v]) => v.startsWith("OK"))
      .map(([k]) => k)
    const invalidStats = Object.entries(statResults)
      .filter(([, v]) => !v.startsWith("OK"))
      .map(([k, v]) => ({ stat: k, error: v }))

    // Test the full valid set together
    let fullTestResult = "NOT_TESTED"
    if (validStats.length > 0) {
      await sleep(1500)
      const body = {
        data: {
          type: "flow-values-report",
          attributes: {
            statistics: validStats,
            timeframe: {
              start: `${startStr}T00:00:00-03:00`,
              end: `${endStr}T23:59:59-03:00`,
            },
            conversion_metric_id: "RuR2Vf",
          },
        },
      }
      try {
        const res = await fetch(`${KLAVIYO_API_URL}/flow-values-reports/`, {
          method: "POST",
          headers: postHeaders,
          body: JSON.stringify(body),
        })
        if (res.status === 200) {
          const json = await res.json()
          const results = json?.data?.attributes?.results || []
          let totalRev = 0
          let totalDel = 0
          for (const r of results) {
            totalRev += r.statistics?.conversion_value || 0
            totalDel += r.statistics?.delivered || 0
          }
          fullTestResult = `OK - ${results.length} results, revenue=${totalRev.toFixed(2)}, delivered=${totalDel}`
        } else {
          const json = await res.json()
          fullTestResult = `FAIL: ${json?.errors?.[0]?.detail || res.status}`
        }
      } catch (e) {
        fullTestResult = `ERROR: ${String(e)}`
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      revision: KLAVIYO_REVISION,
      storeName: creds.store_name,
      totalTested: allStats.length,
      validCount: validStats.length,
      invalidCount: invalidStats.length,
      validStats,
      invalidStats,
      fullValidSetTest: fullTestResult,
      individualResults: statResults,
    }, { headers: corsHeaders(request.headers.get("origin")) })

  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoDebug")
  }
}
