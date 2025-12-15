import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15" // Latest stable revision

// CORS headers helper
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

// Handle OPTIONS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// Helper function to make Klaviyo API requests
async function klaviyoRequest<T>(
  apiKey: string,
  endpoint: string,
  options?: {
    method?: "GET" | "POST"
    body?: Record<string, unknown>
    params?: Record<string, string>
  }
): Promise<T> {
  const { method = "GET", body, params } = options || {}

  const url = new URL(`${KLAVIYO_API_URL}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value))
  }

  console.log(`[Klaviyo] ${method} ${endpoint}`, body ? JSON.stringify(body).substring(0, 500) : "")

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "revision": KLAVIYO_REVISION,
    },
    ...(body && { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Klaviyo] API error ${response.status}:`, errorText.substring(0, 500))
    throw new Error(`Klaviyo API error: ${response.status} - ${errorText.substring(0, 200)}`)
  }

  const data = await response.json()
  return data
}

// Currency symbols mapping
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    "USD": "$", "EUR": "€", "GBP": "£", "BRL": "R$",
    "AUD": "A$", "CAD": "C$", "JPY": "¥", "CNY": "¥",
    "INR": "₹", "MXN": "MX$", "ARS": "AR$", "CLP": "CL$",
    "COP": "CO$", "PEN": "S/", "CHF": "CHF", "SEK": "kr",
    "NOK": "kr", "DKK": "kr", "PLN": "zł", "RUB": "₽",
    "ZAR": "R", "NZD": "NZ$", "SGD": "S$", "HKD": "HK$",
    "KRW": "₩", "THB": "฿", "MYR": "RM", "IDR": "Rp",
    "PHP": "₱", "TWD": "NT$", "AED": "د.إ", "SAR": "﷼",
    "ILS": "₪", "TRY": "₺",
  }
  return symbols[currency] || currency
}

// Get account info including currency
async function getAccountInfo(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          test_account: boolean
          contact_information: {
            default_sender_name: string
            default_sender_email: string
            website_url: string
          }
          preferred_currency: string
          public_api_key: string
          locale: string
        }
      }>
    }>(apiKey, "/accounts/")

    const account = response.data?.[0]
    if (account) {
      return {
        accountId: account.id,
        currency: account.attributes.preferred_currency || "BRL",
        locale: account.attributes.locale || "pt-BR",
        isTestAccount: account.attributes.test_account || false,
        publicApiKey: account.attributes.public_api_key,
        websiteUrl: account.attributes.contact_information?.website_url,
      }
    }
    return { accountId: null, currency: "BRL", locale: "pt-BR", isTestAccount: false, publicApiKey: null, websiteUrl: null }
  } catch (error) {
    console.error("[Klaviyo] Error fetching account info:", error)
    return { accountId: null, currency: "BRL", locale: "pt-BR", isTestAccount: false, publicApiKey: null, websiteUrl: null }
  }
}

// Get lists with profile counts
async function getListMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          created: string
          updated: string
          profile_count: number
        }
      }>
    }>(apiKey, "/lists/")

    const lists = response.data || []
    const totalProfiles = lists.reduce((sum, list) => sum + (list.attributes.profile_count || 0), 0)

    return {
      totalLists: lists.length,
      totalSubscribers: totalProfiles,
      lists: lists.map(l => ({
        id: l.id,
        name: l.attributes.name,
        profileCount: l.attributes.profile_count || 0,
        created: l.attributes.created,
      })).sort((a, b) => b.profileCount - a.profileCount),
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching list metrics:", error)
    return { totalLists: 0, totalSubscribers: 0, lists: [] }
  }
}

// Get flow metrics
async function getFlowMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          status: string
          created: string
          trigger_type: string
        }
      }>
    }>(apiKey, "/flows/")

    const flows = response.data || []
    const liveFlows = flows.filter(f => f.attributes.status === "live")
    const draftFlows = flows.filter(f => f.attributes.status === "draft")

    return {
      totalFlows: flows.length,
      liveFlows: liveFlows.length,
      draftFlows: draftFlows.length,
      flowIds: liveFlows.map(f => f.id),
      flows: flows.map(f => ({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type,
        created: f.attributes.created,
      })),
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching flow metrics:", error)
    return { totalFlows: 0, liveFlows: 0, draftFlows: 0, flowIds: [], flows: [] }
  }
}

// Get campaign metrics
async function getCampaignMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          status: string
          send_time: string | null
          created_at: string
          archived: boolean
        }
      }>
    }>(apiKey, "/campaigns/")

    const campaigns = response.data || []
    const sentCampaigns = campaigns.filter(c => c.attributes.status === "sent")
    const scheduledCampaigns = campaigns.filter(c => c.attributes.status === "scheduled")
    const draftCampaigns = campaigns.filter(c => c.attributes.status === "draft")

    // Get last 30 days campaigns
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentCampaigns = sentCampaigns.filter(c => {
      const sendTime = c.attributes.send_time ? new Date(c.attributes.send_time) : null
      return sendTime && sendTime >= thirtyDaysAgo
    })

    return {
      totalCampaigns: campaigns.length,
      sentCampaigns: sentCampaigns.length,
      scheduledCampaigns: scheduledCampaigns.length,
      draftCampaigns: draftCampaigns.length,
      campaignsLast30Days: recentCampaigns.length,
      campaigns: sentCampaigns.slice(0, 20).map(c => ({
        id: c.id,
        name: c.attributes.name,
        status: c.attributes.status,
        sendTime: c.attributes.send_time,
        createdAt: c.attributes.created_at,
      })),
      campaignIds: sentCampaigns.slice(0, 10).map(c => c.id),
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching campaign metrics:", error)
    return {
      totalCampaigns: 0, sentCampaigns: 0, scheduledCampaigns: 0,
      draftCampaigns: 0, campaignsLast30Days: 0, campaigns: [], campaignIds: [],
    }
  }
}

// Get all metrics to find Placed Order metric ID
async function getMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          created: string
          integration: { name: string } | null
        }
      }>
    }>(apiKey, "/metrics/")

    const metrics = response.data || []
    console.log("[Klaviyo] Available metrics:", metrics.map(m => ({ id: m.id, name: m.attributes.name })))

    // Find Placed Order metric (can be named differently based on integration)
    const placedOrderMetric = metrics.find(m =>
      m.attributes.name.toLowerCase() === "placed order" ||
      m.attributes.name.toLowerCase() === "ordered product" ||
      m.attributes.name.toLowerCase().includes("order")
    )

    // Find email metrics
    const openedEmailMetric = metrics.find(m => m.attributes.name.toLowerCase() === "opened email")
    const clickedEmailMetric = metrics.find(m => m.attributes.name.toLowerCase() === "clicked email")
    const receivedEmailMetric = metrics.find(m => m.attributes.name.toLowerCase() === "received email")

    const hasEcommerce = metrics.some(m =>
      ["placed order", "ordered product", "started checkout", "added to cart"].includes(m.attributes.name.toLowerCase())
    )

    return {
      totalMetrics: metrics.length,
      hasEcommerceIntegration: hasEcommerce,
      placedOrderMetricId: placedOrderMetric?.id || null,
      placedOrderMetricName: placedOrderMetric?.attributes.name || null,
      openedEmailMetricId: openedEmailMetric?.id || null,
      clickedEmailMetricId: clickedEmailMetric?.id || null,
      receivedEmailMetricId: receivedEmailMetric?.id || null,
      availableMetrics: metrics.map(m => ({
        id: m.id,
        name: m.attributes.name,
        integration: m.attributes.integration?.name || null,
      })),
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching metrics:", error)
    return {
      totalMetrics: 0, hasEcommerceIntegration: false,
      placedOrderMetricId: null, placedOrderMetricName: null,
      openedEmailMetricId: null, clickedEmailMetricId: null, receivedEmailMetricId: null,
      availableMetrics: [],
    }
  }
}

// Get segments
async function getSegmentMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          profile_count: number
          is_active: boolean
          is_starred: boolean
        }
      }>
    }>(apiKey, "/segments/")

    const segments = response.data || []
    return {
      totalSegments: segments.length,
      activeSegments: segments.filter(s => s.attributes.is_active).length,
      segments: segments.map(s => ({
        id: s.id,
        name: s.attributes.name,
        profileCount: s.attributes.profile_count || 0,
        isActive: s.attributes.is_active,
        isStarred: s.attributes.is_starred,
      })).sort((a, b) => b.profileCount - a.profileCount),
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching segment metrics:", error)
    return { totalSegments: 0, activeSegments: 0, segments: [] }
  }
}

// Query Metric Aggregates for revenue - FIXED version
async function getRevenueMetrics(
  apiKey: string,
  metricId: string,
  dateRange: { start: string; end: string }
) {
  try {
    console.log("[Klaviyo] Fetching revenue metrics for metric:", metricId)
    console.log("[Klaviyo] Date range:", dateRange)

    // Format dates properly for Klaviyo API (YYYY-MM-DDTHH:MM:SS format)
    const startDate = dateRange.start.split('.')[0] // Remove milliseconds
    const endDate = dateRange.end.split('.')[0]

    // 1. Get TOTAL revenue (all placed orders, regardless of attribution)
    const totalRevenueResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value?: number; count?: number; unique?: number }
          }>
        }
      }
    }>(apiKey, "/metric-aggregates/", {
      method: "POST",
      body: {
        data: {
          type: "metric-aggregate",
          attributes: {
            metric_id: metricId,
            measurements: ["sum_value", "count", "unique"],
            filter: [
              `greater-or-equal(datetime,${startDate})`,
              `less-than(datetime,${endDate})`,
            ],
            timezone: "America/Sao_Paulo",
          },
        },
      },
    }).catch(e => {
      console.error("[Klaviyo] Total revenue query error:", e)
      return null
    })

    const totalData = totalRevenueResponse?.data?.attributes?.data?.[0]
    const totalRevenue = totalData?.measurements?.sum_value || 0
    const totalOrders = totalData?.measurements?.count || 0
    const uniqueCustomers = totalData?.measurements?.unique || 0

    console.log("[Klaviyo] Total revenue data:", { totalRevenue, totalOrders, uniqueCustomers })

    // 2. Get revenue attributed to CAMPAIGNS ($attributed_message not empty)
    const campaignRevenueResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value?: number; count?: number }
            dimensions: string[]
          }>
        }
      }
    }>(apiKey, "/metric-aggregates/", {
      method: "POST",
      body: {
        data: {
          type: "metric-aggregate",
          attributes: {
            metric_id: metricId,
            measurements: ["sum_value", "count"],
            filter: [
              `greater-or-equal(datetime,${startDate})`,
              `less-than(datetime,${endDate})`,
            ],
            by: ["$attributed_message"],
            timezone: "America/Sao_Paulo",
          },
        },
      },
    }).catch(e => {
      console.error("[Klaviyo] Campaign revenue query error:", e)
      return null
    })

    // Sum up campaign attributed revenue (filter out empty/null attributed_message)
    const campaignData = campaignRevenueResponse?.data?.attributes?.data || []
    let campaignRevenue = 0
    let campaignOrders = 0
    campaignData.forEach(item => {
      // The dimension is the attributed_message ID - if it's not empty, it's attributed
      if (item.dimensions?.[0] && item.dimensions[0] !== "") {
        campaignRevenue += item.measurements?.sum_value || 0
        campaignOrders += item.measurements?.count || 0
      }
    })

    console.log("[Klaviyo] Campaign revenue data:", { campaignRevenue, campaignOrders, entries: campaignData.length })

    // 3. Get revenue attributed to FLOWS ($attributed_flow not empty)
    const flowRevenueResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value?: number; count?: number }
            dimensions: string[]
          }>
        }
      }
    }>(apiKey, "/metric-aggregates/", {
      method: "POST",
      body: {
        data: {
          type: "metric-aggregate",
          attributes: {
            metric_id: metricId,
            measurements: ["sum_value", "count"],
            filter: [
              `greater-or-equal(datetime,${startDate})`,
              `less-than(datetime,${endDate})`,
            ],
            by: ["$attributed_flow"],
            timezone: "America/Sao_Paulo",
          },
        },
      },
    }).catch(e => {
      console.error("[Klaviyo] Flow revenue query error:", e)
      return null
    })

    // Sum up flow attributed revenue
    const flowData = flowRevenueResponse?.data?.attributes?.data || []
    let flowRevenue = 0
    let flowOrders = 0
    flowData.forEach(item => {
      if (item.dimensions?.[0] && item.dimensions[0] !== "") {
        flowRevenue += item.measurements?.sum_value || 0
        flowOrders += item.measurements?.count || 0
      }
    })

    console.log("[Klaviyo] Flow revenue data:", { flowRevenue, flowOrders, entries: flowData.length })

    // 4. Get daily time series
    const revenueSeriesResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value?: number; count?: number }
            dimensions: string[]
          }>
        }
      }
    }>(apiKey, "/metric-aggregates/", {
      method: "POST",
      body: {
        data: {
          type: "metric-aggregate",
          attributes: {
            metric_id: metricId,
            measurements: ["sum_value", "count"],
            filter: [
              `greater-or-equal(datetime,${startDate})`,
              `less-than(datetime,${endDate})`,
            ],
            interval: "day",
            timezone: "America/Sao_Paulo",
          },
        },
      },
    }).catch(() => null)

    const timeSeries = revenueSeriesResponse?.data?.attributes?.data?.map(item => ({
      date: item.dimensions?.[0] || "",
      revenue: item.measurements?.sum_value || 0,
      orders: item.measurements?.count || 0,
    })) || []

    // Total Klaviyo attributed = campaigns + flows
    const klaviyoAttributedRevenue = campaignRevenue + flowRevenue
    const klaviyoAttributedOrders = campaignOrders + flowOrders

    return {
      totalRevenue,
      totalOrders,
      uniqueCustomers,
      klaviyoAttributedRevenue,
      klaviyoAttributedOrders,
      campaignRevenue,
      campaignOrders,
      flowRevenue,
      flowOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      timeSeries,
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching revenue metrics:", error)
    return {
      totalRevenue: 0, totalOrders: 0, uniqueCustomers: 0,
      klaviyoAttributedRevenue: 0, klaviyoAttributedOrders: 0,
      campaignRevenue: 0, campaignOrders: 0,
      flowRevenue: 0, flowOrders: 0,
      averageOrderValue: 0, timeSeries: [],
    }
  }
}

// Get email engagement metrics using Metric Aggregates
async function getEmailEngagementMetrics(
  apiKey: string,
  metricIds: { opened?: string | null; clicked?: string | null; received?: string | null },
  dateRange: { start: string; end: string }
) {
  const startDate = dateRange.start.split('.')[0]
  const endDate = dateRange.end.split('.')[0]

  const results = {
    delivered: 0, opened: 0, clicked: 0,
    openRate: 0, clickRate: 0, clickToOpenRate: 0,
  }

  try {
    // Get received/delivered count
    if (metricIds.received) {
      const res = await klaviyoRequest<{
        data: { attributes: { data: Array<{ measurements: { count?: number; unique?: number } }> } }
      }>(apiKey, "/metric-aggregates/", {
        method: "POST",
        body: {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricIds.received,
              measurements: ["count", "unique"],
              filter: [`greater-or-equal(datetime,${startDate})`, `less-than(datetime,${endDate})`],
              timezone: "America/Sao_Paulo",
            },
          },
        },
      }).catch(() => null)
      results.delivered = res?.data?.attributes?.data?.[0]?.measurements?.count || 0
    }

    // Get opened count
    if (metricIds.opened) {
      const res = await klaviyoRequest<{
        data: { attributes: { data: Array<{ measurements: { count?: number; unique?: number } }> } }
      }>(apiKey, "/metric-aggregates/", {
        method: "POST",
        body: {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricIds.opened,
              measurements: ["count", "unique"],
              filter: [`greater-or-equal(datetime,${startDate})`, `less-than(datetime,${endDate})`],
              timezone: "America/Sao_Paulo",
            },
          },
        },
      }).catch(() => null)
      results.opened = res?.data?.attributes?.data?.[0]?.measurements?.unique || 0
    }

    // Get clicked count
    if (metricIds.clicked) {
      const res = await klaviyoRequest<{
        data: { attributes: { data: Array<{ measurements: { count?: number; unique?: number } }> } }
      }>(apiKey, "/metric-aggregates/", {
        method: "POST",
        body: {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricIds.clicked,
              measurements: ["count", "unique"],
              filter: [`greater-or-equal(datetime,${startDate})`, `less-than(datetime,${endDate})`],
              timezone: "America/Sao_Paulo",
            },
          },
        },
      }).catch(() => null)
      results.clicked = res?.data?.attributes?.data?.[0]?.measurements?.unique || 0
    }

    // Calculate rates
    if (results.delivered > 0) {
      results.openRate = (results.opened / results.delivered) * 100
      results.clickRate = (results.clicked / results.delivered) * 100
    }
    if (results.opened > 0) {
      results.clickToOpenRate = (results.clicked / results.opened) * 100
    }

    return results
  } catch (error) {
    console.error("[Klaviyo] Error fetching email engagement:", error)
    return results
  }
}

// Get Campaign Performance using Reporting API
async function getCampaignPerformance(
  apiKey: string,
  campaignIds: string[],
  dateRange: { start: string; end: string }
) {
  if (campaignIds.length === 0) {
    return {
      totalDelivered: 0, totalOpened: 0, totalClicked: 0,
      totalBounced: 0, totalUnsubscribed: 0,
      avgOpenRate: 0, avgClickRate: 0, totalRevenue: 0, campaigns: [],
    }
  }

  try {
    // Format dates for reporting API (YYYY-MM-DD format)
    const startDate = dateRange.start.split('T')[0]
    const endDate = dateRange.end.split('T')[0]

    console.log("[Klaviyo] Fetching campaign performance for", campaignIds.length, "campaigns")

    const response = await klaviyoRequest<{
      data: {
        attributes: {
          results: Array<{
            groupings: { campaign_id: string }
            statistics: {
              delivered?: number
              opens?: number
              opens_unique?: number
              clicks?: number
              clicks_unique?: number
              bounces?: number
              unsubscribes?: number
              revenue?: number
              open_rate?: number
              click_rate?: number
            }
          }>
        }
      }
    }>(apiKey, "/campaign-values-reports/", {
      method: "POST",
      body: {
        data: {
          type: "campaign-values-report",
          attributes: {
            statistics: [
              "delivered", "opens", "opens_unique",
              "clicks", "clicks_unique", "bounces",
              "unsubscribes", "revenue", "open_rate", "click_rate",
            ],
            timeframe: { start: startDate, end: endDate },
            filter: `equals(campaign_id,["${campaignIds.join('","')}"])`,
          },
        },
      },
    }).catch(e => {
      console.error("[Klaviyo] Campaign values report error:", e)
      return null
    })

    if (!response) {
      return {
        totalDelivered: 0, totalOpened: 0, totalClicked: 0,
        totalBounced: 0, totalUnsubscribed: 0,
        avgOpenRate: 0, avgClickRate: 0, totalRevenue: 0, campaigns: [],
      }
    }

    const results = response.data?.attributes?.results || []
    console.log("[Klaviyo] Campaign performance results:", results.length, "entries")

    const totals = results.reduce((acc, r) => ({
      delivered: acc.delivered + (r.statistics.delivered || 0),
      opened: acc.opened + (r.statistics.opens_unique || 0),
      clicked: acc.clicked + (r.statistics.clicks_unique || 0),
      bounced: acc.bounced + (r.statistics.bounces || 0),
      unsubscribed: acc.unsubscribed + (r.statistics.unsubscribes || 0),
      revenue: acc.revenue + (r.statistics.revenue || 0),
    }), { delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0 })

    return {
      totalDelivered: totals.delivered,
      totalOpened: totals.opened,
      totalClicked: totals.clicked,
      totalBounced: totals.bounced,
      totalUnsubscribed: totals.unsubscribed,
      avgOpenRate: totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0,
      avgClickRate: totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0,
      totalRevenue: totals.revenue,
      campaigns: results.map(r => ({
        campaignId: r.groupings.campaign_id,
        delivered: r.statistics.delivered || 0,
        opens: r.statistics.opens_unique || 0,
        clicks: r.statistics.clicks_unique || 0,
        openRate: r.statistics.open_rate || 0,
        clickRate: r.statistics.click_rate || 0,
        revenue: r.statistics.revenue || 0,
      })),
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching campaign performance:", error)
    return {
      totalDelivered: 0, totalOpened: 0, totalClicked: 0,
      totalBounced: 0, totalUnsubscribed: 0,
      avgOpenRate: 0, avgClickRate: 0, totalRevenue: 0, campaigns: [],
    }
  }
}

// Get Flow Performance using Reporting API
async function getFlowPerformance(
  apiKey: string,
  dateRange: { start: string; end: string }
) {
  try {
    const startDate = dateRange.start.split('T')[0]
    const endDate = dateRange.end.split('T')[0]

    console.log("[Klaviyo] Fetching flow performance")

    const response = await klaviyoRequest<{
      data: {
        attributes: {
          results: Array<{
            groupings: { flow_id: string }
            statistics: {
              delivered?: number
              opens_unique?: number
              clicks_unique?: number
              bounces?: number
              unsubscribes?: number
              revenue?: number
              open_rate?: number
              click_rate?: number
            }
          }>
        }
      }
    }>(apiKey, "/flow-values-reports/", {
      method: "POST",
      body: {
        data: {
          type: "flow-values-report",
          attributes: {
            statistics: [
              "delivered", "opens_unique", "clicks_unique",
              "bounces", "unsubscribes", "revenue",
              "open_rate", "click_rate",
            ],
            timeframe: { start: startDate, end: endDate },
          },
        },
      },
    }).catch(e => {
      console.error("[Klaviyo] Flow values report error:", e)
      return null
    })

    if (!response) {
      return {
        totalDelivered: 0, totalOpened: 0, totalClicked: 0,
        totalBounced: 0, totalUnsubscribed: 0,
        avgOpenRate: 0, avgClickRate: 0, totalRevenue: 0, flows: [],
      }
    }

    const results = response.data?.attributes?.results || []
    console.log("[Klaviyo] Flow performance results:", results.length, "entries")

    const totals = results.reduce((acc, r) => ({
      delivered: acc.delivered + (r.statistics.delivered || 0),
      opened: acc.opened + (r.statistics.opens_unique || 0),
      clicked: acc.clicked + (r.statistics.clicks_unique || 0),
      bounced: acc.bounced + (r.statistics.bounces || 0),
      unsubscribed: acc.unsubscribed + (r.statistics.unsubscribes || 0),
      revenue: acc.revenue + (r.statistics.revenue || 0),
    }), { delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0 })

    return {
      totalDelivered: totals.delivered,
      totalOpened: totals.opened,
      totalClicked: totals.clicked,
      totalBounced: totals.bounced,
      totalUnsubscribed: totals.unsubscribed,
      avgOpenRate: totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0,
      avgClickRate: totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0,
      totalRevenue: totals.revenue,
      flows: results.map(r => ({
        flowId: r.groupings.flow_id,
        delivered: r.statistics.delivered || 0,
        opens: r.statistics.opens_unique || 0,
        clicks: r.statistics.clicks_unique || 0,
        openRate: r.statistics.open_rate || 0,
        clickRate: r.statistics.click_rate || 0,
        revenue: r.statistics.revenue || 0,
      })),
    }
  } catch (error) {
    console.error("[Klaviyo] Error fetching flow performance:", error)
    return {
      totalDelivered: 0, totalOpened: 0, totalClicked: 0,
      totalBounced: 0, totalUnsubscribed: 0,
      avgOpenRate: 0, avgClickRate: 0, totalRevenue: 0, flows: [],
    }
  }
}

// Main GET handler
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 })
    }

    // Get store with Klaviyo API key
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("klaviyo_api_key, klaviyo_private_key, klaviyo_list_id, store_name, client_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 })
    }

    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "API Key não configurada",
      })
    }

    console.log("[Klaviyo] Starting report generation for store:", store.store_name)

    // Calculate date range
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (period === "custom" && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
      endDate.setHours(23, 59, 59, 999)
    } else {
      switch (period) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case "all":
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }
    }

    const dateRange = {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    }

    console.log("[Klaviyo] Date range:", dateRange)

    // Fetch basic metrics in parallel
    const [accountInfo, listMetrics, flowMetrics, campaignMetrics, eventMetrics, segmentMetrics] = await Promise.all([
      getAccountInfo(apiKey),
      getListMetrics(apiKey),
      getFlowMetrics(apiKey),
      getCampaignMetrics(apiKey),
      getMetrics(apiKey),
      getSegmentMetrics(apiKey),
    ])

    console.log("[Klaviyo] Found Placed Order metric:", eventMetrics.placedOrderMetricId, eventMetrics.placedOrderMetricName)

    // Fetch revenue and performance data
    let revenueMetrics = null
    let emailEngagement = null
    let campaignPerformance = null
    let flowPerformance = null

    // Get revenue data if we have the Placed Order metric
    if (eventMetrics.placedOrderMetricId) {
      revenueMetrics = await getRevenueMetrics(apiKey, eventMetrics.placedOrderMetricId, dateRange)
    }

    // Get email engagement metrics
    emailEngagement = await getEmailEngagementMetrics(apiKey, {
      received: eventMetrics.receivedEmailMetricId,
      opened: eventMetrics.openedEmailMetricId,
      clicked: eventMetrics.clickedEmailMetricId,
    }, dateRange)

    // Get campaign performance
    if (campaignMetrics.campaignIds.length > 0) {
      campaignPerformance = await getCampaignPerformance(apiKey, campaignMetrics.campaignIds, dateRange)
    }

    // Get flow performance
    flowPerformance = await getFlowPerformance(apiKey, dateRange)

    // Calculate totals - prefer Reporting API data over Metric Aggregates for accuracy
    const totalKlaviyoRevenue =
      (campaignPerformance?.totalRevenue || 0) + (flowPerformance?.totalRevenue || 0) ||
      revenueMetrics?.klaviyoAttributedRevenue || 0

    console.log("[Klaviyo] Final revenue calculation:", {
      campaignRevenue: campaignPerformance?.totalRevenue,
      flowRevenue: flowPerformance?.totalRevenue,
      totalKlaviyoRevenue,
      metricAggregatesRevenue: revenueMetrics?.klaviyoAttributedRevenue,
    })

    const reportData = {
      success: true,
      connected: true,
      storeName: store.store_name,
      generatedAt: new Date().toISOString(),
      period,
      dateRange,

      // Account info
      account: {
        currency: accountInfo.currency,
        currencySymbol: getCurrencySymbol(accountInfo.currency),
        locale: accountInfo.locale,
        isTestAccount: accountInfo.isTestAccount,
      },

      // Revenue & Financial Metrics
      revenue: {
        totalRevenue: revenueMetrics?.totalRevenue || 0,
        klaviyoAttributedRevenue: totalKlaviyoRevenue,
        campaignRevenue: campaignPerformance?.totalRevenue || revenueMetrics?.campaignRevenue || 0,
        flowRevenue: flowPerformance?.totalRevenue || revenueMetrics?.flowRevenue || 0,
        totalOrders: revenueMetrics?.totalOrders || 0,
        klaviyoAttributedOrders: revenueMetrics?.klaviyoAttributedOrders || 0,
        averageOrderValue: revenueMetrics?.averageOrderValue || 0,
        uniqueCustomers: revenueMetrics?.uniqueCustomers || 0,
        timeSeries: revenueMetrics?.timeSeries || [],
      },

      // Overview
      overview: {
        totalSubscribers: listMetrics.totalSubscribers,
        totalLists: listMetrics.totalLists,
        totalSegments: segmentMetrics.totalSegments,
        totalFlows: flowMetrics.totalFlows,
        liveFlows: flowMetrics.liveFlows,
        totalCampaigns: campaignMetrics.totalCampaigns,
        sentCampaigns: campaignMetrics.sentCampaigns,
      },

      // Email Performance (prefer email engagement over campaign performance)
      emailPerformance: {
        delivered: emailEngagement?.delivered || campaignPerformance?.totalDelivered || 0,
        opened: emailEngagement?.opened || campaignPerformance?.totalOpened || 0,
        clicked: emailEngagement?.clicked || campaignPerformance?.totalClicked || 0,
        bounced: campaignPerformance?.totalBounced || 0,
        unsubscribed: campaignPerformance?.totalUnsubscribed || 0,
        openRate: emailEngagement?.openRate || campaignPerformance?.avgOpenRate || 0,
        clickRate: emailEngagement?.clickRate || campaignPerformance?.avgClickRate || 0,
        clickToOpenRate: emailEngagement?.clickToOpenRate || 0,
      },

      // Campaign Performance
      campaignPerformance: {
        totalDelivered: campaignPerformance?.totalDelivered || 0,
        totalOpened: campaignPerformance?.totalOpened || 0,
        totalClicked: campaignPerformance?.totalClicked || 0,
        avgOpenRate: campaignPerformance?.avgOpenRate || 0,
        avgClickRate: campaignPerformance?.avgClickRate || 0,
        totalRevenue: campaignPerformance?.totalRevenue || 0,
        campaigns: campaignPerformance?.campaigns || [],
      },

      // Flow Performance
      flowPerformance: {
        totalDelivered: flowPerformance?.totalDelivered || 0,
        totalOpened: flowPerformance?.totalOpened || 0,
        totalClicked: flowPerformance?.totalClicked || 0,
        avgOpenRate: flowPerformance?.avgOpenRate || 0,
        avgClickRate: flowPerformance?.avgClickRate || 0,
        totalRevenue: flowPerformance?.totalRevenue || 0,
        flows: flowPerformance?.flows || [],
      },

      // Lists
      lists: listMetrics.lists.slice(0, 10),

      // Segments
      segments: segmentMetrics.segments.slice(0, 10),

      // Flows
      flows: flowMetrics.flows.slice(0, 10),

      // Campaigns
      campaigns: {
        total: campaignMetrics.totalCampaigns,
        sent: campaignMetrics.sentCampaigns,
        scheduled: campaignMetrics.scheduledCampaigns,
        drafts: campaignMetrics.draftCampaigns,
        last30Days: campaignMetrics.campaignsLast30Days,
        recentCampaigns: campaignMetrics.campaigns.slice(0, 10),
      },

      // Integration status
      integrations: {
        hasEcommerce: eventMetrics.hasEcommerceIntegration,
        placedOrderMetric: eventMetrics.placedOrderMetricName,
        totalMetrics: eventMetrics.totalMetrics,
      },
    }

    return NextResponse.json(reportData)
  } catch (error) {
    console.error("[Klaviyo] Error generating report:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar relatório" },
      { status: 500 }
    )
  }
}
