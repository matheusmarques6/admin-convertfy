import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { corsHeaders } from "@/lib/cors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { KLAVIYO_API_URL, KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"

const log = logger.child("KlaviyoDebug")

// Debug endpoint to test Klaviyo API directly
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const storeData = await getStoreCredentials(storeId)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key
    if (!apiKey) {
      throw new AppError("API Key do Klaviyo não configurada", 400)
    }

    const results: Record<string, unknown> = {
      storeName: storeData.store_name,
      apiKeyPresent: !!apiKey,
      apiKeyLast4: apiKey.slice(-4),
    }

    // 1. Test basic connection - Get Account
    try {
      const accountRes = await fetch(`${KLAVIYO_API_URL}/accounts/`, {
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "Accept": "application/json",
          "revision": KLAVIYO_REVISION,
        },
      })
      const accountData = await accountRes.json()
      results.account = {
        status: accountRes.status,
        data: accountData,
      }
    } catch (e) {
      results.account = { error: String(e) }
    }

    // 2. Get all metrics to find Placed Order
    try {
      const metricsRes = await fetch(`${KLAVIYO_API_URL}/metrics/`, {
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "Accept": "application/json",
          "revision": KLAVIYO_REVISION,
        },
      })
      const metricsData = await metricsRes.json()

      const metrics = metricsData.data || []
      const placedOrderMetric = metrics.find((m: { attributes: { name: string } }) =>
        m.attributes.name.toLowerCase() === "placed order" ||
        m.attributes.name.toLowerCase().includes("order")
      )

      results.metrics = {
        status: metricsRes.status,
        totalMetrics: metrics.length,
        allMetrics: metrics.map((m: { id: string; attributes: { name: string; integration?: { name: string } } }) => ({
          id: m.id,
          name: m.attributes.name,
          integration: m.attributes.integration?.name,
        })),
        placedOrderMetric: placedOrderMetric ? {
          id: placedOrderMetric.id,
          name: placedOrderMetric.attributes.name,
        } : null,
      }

      // 3. If we found Placed Order metric, test metric aggregates
      if (placedOrderMetric) {
        const now = new Date()
        const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        // Test 1: Simple total revenue query
        try {
          const totalRevenueRes = await fetch(`${KLAVIYO_API_URL}/metric-aggregates/`, {
            method: "POST",
            headers: {
              "Authorization": `Klaviyo-API-Key ${apiKey}`,
              "Accept": "application/json",
              "Content-Type": "application/json",
              "revision": KLAVIYO_REVISION,
            },
            body: JSON.stringify({
              data: {
                type: "metric-aggregate",
                attributes: {
                  metric_id: placedOrderMetric.id,
                  measurements: ["value", "count", "unique"],
                  filter: [
                    `greater-or-equal(datetime,${startDate.toISOString().split('.')[0]})`,
                    `less-than(datetime,${now.toISOString().split('.')[0]})`,
                  ],
                  timezone: "UTC",
                },
              },
            }),
          })
          const totalRevenueData = await totalRevenueRes.json()
          results.metricAggregates_totalRevenue = {
            status: totalRevenueRes.status,
            request: {
              metric_id: placedOrderMetric.id,
              dateRange: {
                start: startDate.toISOString(),
                end: now.toISOString(),
              },
            },
            response: totalRevenueData,
          }
        } catch (e) {
          results.metricAggregates_totalRevenue = { error: String(e) }
        }

        // Test 2: Flow values report
        try {
          const flowReportRes = await fetch(`${KLAVIYO_API_URL}/flow-values-reports/`, {
            method: "POST",
            headers: {
              "Authorization": `Klaviyo-API-Key ${apiKey}`,
              "Accept": "application/json",
              "Content-Type": "application/json",
              "revision": KLAVIYO_REVISION,
            },
            body: JSON.stringify({
              data: {
                type: "flow-values-report",
                attributes: {
                  statistics: ["delivered", "opened_unique", "clicked_unique", "conversion_value", "conversion_uniques"],
                  timeframe: {
                    start: startDate.toISOString().split('.')[0] + "+00:00",
                    end: now.toISOString().split('.')[0] + "+00:00",
                  },
                  conversion_metric_id: placedOrderMetric.id,
                },
              },
            }),
          })
          const flowReportData = await flowReportRes.json()
          results.flowValuesReport = {
            status: flowReportRes.status,
            request: {
              conversion_metric_id: placedOrderMetric.id,
              timeframe: {
                start: startDate.toISOString().split('.')[0] + "+00:00",
                end: now.toISOString().split('.')[0] + "+00:00",
              },
            },
            response: flowReportData,
          }
        } catch (e) {
          results.flowValuesReport = { error: String(e) }
        }
      }
    } catch (e) {
      results.metrics = { error: String(e) }
    }

    // 4. Get campaigns
    try {
      const campaignsRes = await fetch(`${KLAVIYO_API_URL}/campaigns/`, {
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "Accept": "application/json",
          "revision": KLAVIYO_REVISION,
        },
      })
      const campaignsData = await campaignsRes.json()
      const campaigns = campaignsData.data || []
      const sentCampaigns = campaigns.filter((c: { attributes: { status: string } }) => c.attributes.status === "sent")

      results.campaigns = {
        status: campaignsRes.status,
        total: campaigns.length,
        sent: sentCampaigns.length,
        first5Sent: sentCampaigns.slice(0, 5).map((c: { id: string; attributes: { name: string; status: string; send_time: string } }) => ({
          id: c.id,
          name: c.attributes.name,
          status: c.attributes.status,
          sendTime: c.attributes.send_time,
        })),
      }
    } catch (e) {
      results.campaigns = { error: String(e) }
    }

    // 5. Get flows
    try {
      const flowsRes = await fetch(`${KLAVIYO_API_URL}/flows/`, {
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "Accept": "application/json",
          "revision": KLAVIYO_REVISION,
        },
      })
      const flowsData = await flowsRes.json()
      const flows = flowsData.data || []

      results.flows = {
        status: flowsRes.status,
        total: flows.length,
        flows: flows.slice(0, 10).map((f: { id: string; attributes: { name: string; status: string } }) => ({
          id: f.id,
          name: f.attributes.name,
          status: f.attributes.status,
        })),
      }
    } catch (e) {
      results.flows = { error: String(e) }
    }

    const origin = request.headers.get("origin")
    return NextResponse.json(results, {
      headers: corsHeaders(origin),
    })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoDebug")
  }
}
