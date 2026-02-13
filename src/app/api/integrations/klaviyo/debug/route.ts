import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15"

// Debug endpoint to test Klaviyo API directly
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 })
    }

    // Get store with Klaviyo API key
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("klaviyo_api_key, klaviyo_private_key, store_name")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 })
    }

    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({ error: "API Key não configurada" }, { status: 400 })
    }

    const results: Record<string, unknown> = {
      storeName: store.store_name,
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
                  statistics: ["delivered", "opens_unique", "clicks_unique", "conversion_value", "conversion_uniques"],
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

    return NextResponse.json(results, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (error) {
    console.error("Debug error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro no debug" },
      { status: 500 }
    )
  }
}
