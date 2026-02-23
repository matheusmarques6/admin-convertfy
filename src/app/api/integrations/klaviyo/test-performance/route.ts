import { NextRequest, NextResponse } from "next/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import {
  KLAVIYO_API_URL,
  KLAVIYO_REVISION,
  sleep,
  MIN_REQUEST_INTERVAL,
} from "@/lib/integrations/klaviyo/client"
import {
  getAccountInfo,
  findPlacedOrderMetric,
  getTimezoneOffset,
  parseDateRange,
  formatDateStr,
} from "@/lib/integrations/klaviyo"

export const maxDuration = 120
export const dynamic = "force-dynamic"

/**
 * GET /api/integrations/klaviyo/test-performance?store_id=XXX
 *
 * Temporary debug route to test what the performance endpoint sees.
 * Uses CRON_SECRET for auth (no user session needed).
 */
export async function GET(request: NextRequest) {
  // Temporary debug token - will remove this route after debugging
  const queryToken = request.nextUrl.searchParams.get("token")
  if (queryToken !== "debug-klv-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get("store_id")
  if (!storeId) {
    return NextResponse.json({ error: "store_id required" }, { status: 400 })
  }

  const steps: Array<{ step: string; status: string; detail?: unknown; elapsed?: number }> = []
  const totalStart = Date.now()

  try {
    // Step 1: Get credentials
    let t = Date.now()
    const creds = await getStoreCredentials(storeId)
    const apiKey = creds.klaviyo_private_key || creds.klaviyo_api_key
    steps.push({ step: "getCredentials", status: apiKey ? "OK" : "NO_KEY", elapsed: Date.now() - t })

    if (!apiKey) {
      return NextResponse.json({ steps, error: "No API key found" })
    }

    // Step 2: Get account info
    t = Date.now()
    const accountInfo = await getAccountInfo(apiKey)
    const timezone = accountInfo?.timezone || "America/Sao_Paulo"
    const tzOffset = getTimezoneOffset(timezone)
    steps.push({ step: "getAccountInfo", status: "OK", detail: { timezone, tzOffset }, elapsed: Date.now() - t })

    // Step 3: Find Placed Order metric
    t = Date.now()
    const metricId = await findPlacedOrderMetric(apiKey)
    steps.push({ step: "findPlacedOrderMetric", status: metricId ? "OK" : "NOT_FOUND", detail: { metricId }, elapsed: Date.now() - t })

    // Step 3b: Raw metrics list to debug why findPlacedOrderMetric fails
    if (!metricId) {
      await sleep(MIN_REQUEST_INTERVAL)
      t = Date.now()
      const rawMetricsRes = await fetch(`${KLAVIYO_API_URL}/metrics/?page[size]=50`, {
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
          "revision": KLAVIYO_REVISION,
        },
      })
      const rawMetricsText = await rawMetricsRes.text()
      let metricNames: string[] = []
      try {
        const parsed = JSON.parse(rawMetricsText)
        metricNames = (parsed.data || []).map((m: { id: string; attributes: { name: string } }) => `${m.id}: ${m.attributes.name}`)
      } catch { /* ignore */ }
      steps.push({
        step: "rawMetricsList",
        status: rawMetricsRes.status === 200 ? "OK" : `HTTP_${rawMetricsRes.status}`,
        detail: {
          httpStatus: rawMetricsRes.status,
          count: metricNames.length,
          metrics: metricNames,
          bodyPreview: rawMetricsRes.status !== 200 ? rawMetricsText.substring(0, 500) : undefined,
        },
        elapsed: Date.now() - t,
      })
    }

    // Step 4: Date range
    const { startDate, endDate } = parseDateRange("30d")
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)
    const startISO = `${startDateStr}T00:00:00${tzOffset}`
    const endISO = `${endDateStr}T23:59:59${tzOffset}`
    steps.push({ step: "dateRange", status: "OK", detail: { startISO, endISO } })

    const reportStats = [
      "recipients", "delivered", "opens_unique", "click_rate",
      "click_to_open_rate", "conversion_rate", "conversion_value", "revenue_per_recipient",
    ]

    const headers = {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "revision": KLAVIYO_REVISION,
    }

    // Step 5: Campaign report (raw fetch to see exact response)
    await sleep(MIN_REQUEST_INTERVAL)
    t = Date.now()
    const campBody = {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: reportStats,
          timeframe: { start: startISO, end: endISO },
          ...(metricId ? { conversion_metric_id: metricId } : {}),
        },
      },
    }

    const campRes = await fetch(`${KLAVIYO_API_URL}/campaign-values-reports/`, {
      method: "POST",
      headers,
      body: JSON.stringify(campBody),
    })
    const campText = await campRes.text()
    const campElapsed = Date.now() - t

    let campData = null
    let campRevenue = 0
    let campCount = 0
    try {
      campData = JSON.parse(campText)
      if (campData?.data?.attributes?.results) {
        campCount = campData.data.attributes.results.length
        for (const r of campData.data.attributes.results) {
          campRevenue += Number(r.statistics?.conversion_value) || 0
        }
      }
    } catch { /* ignore */ }

    steps.push({
      step: "campaignReport",
      status: campRes.status === 200 ? "OK" : `HTTP_${campRes.status}`,
      detail: {
        httpStatus: campRes.status,
        resultCount: campCount,
        totalRevenue: campRevenue,
        bodyPreview: campText.substring(0, 300),
        requestBody: campBody,
      },
      elapsed: campElapsed,
    })

    // Step 6: Flow report
    await sleep(MIN_REQUEST_INTERVAL)
    t = Date.now()
    const flowBody = {
      data: {
        type: "flow-values-report",
        attributes: {
          statistics: reportStats,
          timeframe: { start: startISO, end: endISO },
          ...(metricId ? { conversion_metric_id: metricId } : {}),
        },
      },
    }

    const flowRes = await fetch(`${KLAVIYO_API_URL}/flow-values-reports/`, {
      method: "POST",
      headers,
      body: JSON.stringify(flowBody),
    })
    const flowText = await flowRes.text()
    const flowElapsed = Date.now() - t

    let flowData = null
    let flowRevenue = 0
    let flowCount = 0
    try {
      flowData = JSON.parse(flowText)
      if (flowData?.data?.attributes?.results) {
        flowCount = flowData.data.attributes.results.length
        for (const r of flowData.data.attributes.results) {
          flowRevenue += Number(r.statistics?.conversion_value) || 0
        }
      }
    } catch { /* ignore */ }

    steps.push({
      step: "flowReport",
      status: flowRes.status === 200 ? "OK" : `HTTP_${flowRes.status}`,
      detail: {
        httpStatus: flowRes.status,
        resultCount: flowCount,
        totalRevenue: flowRevenue,
        bodyPreview: flowText.substring(0, 300),
        requestBody: flowBody,
      },
      elapsed: flowElapsed,
    })

    return NextResponse.json({
      success: true,
      totalElapsed: Date.now() - totalStart,
      summary: {
        campaignRevenue: campRevenue,
        flowRevenue: flowRevenue,
        totalRevenue: campRevenue + flowRevenue,
        campaignResults: campCount,
        flowResults: flowCount,
      },
      steps,
    })

  } catch (error) {
    steps.push({
      step: "error",
      status: "EXCEPTION",
      detail: error instanceof Error ? { message: error.message, stack: error.stack?.substring(0, 300) } : String(error),
    })
    return NextResponse.json({ success: false, steps, totalElapsed: Date.now() - totalStart }, { status: 500 })
  }
}
