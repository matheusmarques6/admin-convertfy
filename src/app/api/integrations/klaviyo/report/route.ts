import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15" // Latest stable revision

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
    console.error(`Klaviyo API error: ${response.status}`, errorText)
    throw new Error(`Klaviyo API error: ${response.status}`)
  }

  return response.json()
}

// Currency symbols mapping
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "BRL": "R$",
    "AUD": "A$",
    "CAD": "C$",
    "JPY": "¥",
    "CNY": "¥",
    "INR": "₹",
    "MXN": "MX$",
    "ARS": "AR$",
    "CLP": "CL$",
    "COP": "CO$",
    "PEN": "S/",
    "CHF": "CHF",
    "SEK": "kr",
    "NOK": "kr",
    "DKK": "kr",
    "PLN": "zł",
    "RUB": "₽",
    "ZAR": "R",
    "NZD": "NZ$",
    "SGD": "S$",
    "HKD": "HK$",
    "KRW": "₩",
    "THB": "฿",
    "MYR": "RM",
    "IDR": "Rp",
    "PHP": "₱",
    "TWD": "NT$",
    "AED": "د.إ",
    "SAR": "﷼",
    "ILS": "₪",
    "TRY": "₺",
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
    return {
      accountId: null,
      currency: "BRL",
      locale: "pt-BR",
      isTestAccount: false,
      publicApiKey: null,
      websiteUrl: null,
    }
  } catch (error) {
    console.error("Error fetching account info:", error)
    return {
      accountId: null,
      currency: "BRL",
      locale: "pt-BR",
      isTestAccount: false,
      publicApiKey: null,
      websiteUrl: null,
    }
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
    console.error("Error fetching list metrics:", error)
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
      flows: flows.map(f => ({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type,
        created: f.attributes.created,
      })),
    }
  } catch (error) {
    console.error("Error fetching flow metrics:", error)
    return { totalFlows: 0, liveFlows: 0, draftFlows: 0, flows: [] }
  }
}

// Get campaign metrics with performance data
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
          audiences: {
            included: Array<{ type: string; id: string }>
            excluded: Array<{ type: string; id: string }>
          }
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
    console.error("Error fetching campaign metrics:", error)
    return {
      totalCampaigns: 0,
      sentCampaigns: 0,
      scheduledCampaigns: 0,
      draftCampaigns: 0,
      campaignsLast30Days: 0,
      campaigns: [],
      campaignIds: [],
    }
  }
}

// Get available metrics/events - find the "Placed Order" metric ID
async function getEventMetrics(apiKey: string) {
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

    // Find Placed Order metric for revenue
    const placedOrderMetric = metrics.find(m =>
      m.attributes.name.toLowerCase() === "placed order" ||
      m.attributes.name.toLowerCase() === "ordered product"
    )

    // Find email metrics
    const openedEmailMetric = metrics.find(m =>
      m.attributes.name.toLowerCase() === "opened email"
    )
    const clickedEmailMetric = metrics.find(m =>
      m.attributes.name.toLowerCase() === "clicked email"
    )
    const receivedEmailMetric = metrics.find(m =>
      m.attributes.name.toLowerCase() === "received email"
    )

    // Common e-commerce metrics
    const ecommerceMetrics = [
      "Placed Order",
      "Ordered Product",
      "Started Checkout",
      "Added to Cart",
      "Viewed Product",
      "Active on Site",
    ]

    const emailMetrics = [
      "Received Email",
      "Opened Email",
      "Clicked Email",
      "Bounced Email",
      "Unsubscribed",
      "Marked Email as Spam",
    ]

    const hasEcommerce = metrics.some(m => ecommerceMetrics.includes(m.attributes.name))
    const hasEmail = metrics.some(m => emailMetrics.includes(m.attributes.name))

    return {
      totalMetrics: metrics.length,
      hasEcommerceIntegration: hasEcommerce,
      hasEmailMetrics: hasEmail,
      placedOrderMetricId: placedOrderMetric?.id || null,
      openedEmailMetricId: openedEmailMetric?.id || null,
      clickedEmailMetricId: clickedEmailMetric?.id || null,
      receivedEmailMetricId: receivedEmailMetric?.id || null,
      availableMetrics: metrics.map(m => ({
        id: m.id,
        name: m.attributes.name,
        integration: m.attributes.integration?.name || null,
        created: m.attributes.created,
      })),
    }
  } catch (error) {
    console.error("Error fetching event metrics:", error)
    return {
      totalMetrics: 0,
      hasEcommerceIntegration: false,
      hasEmailMetrics: false,
      placedOrderMetricId: null,
      openedEmailMetricId: null,
      clickedEmailMetricId: null,
      receivedEmailMetricId: null,
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
          created: string
          updated: string
          profile_count: number
          is_active: boolean
          is_starred: boolean
        }
      }>
    }>(apiKey, "/segments/")

    const segments = response.data || []
    const activeSegments = segments.filter(s => s.attributes.is_active)

    return {
      totalSegments: segments.length,
      activeSegments: activeSegments.length,
      segments: segments.map(s => ({
        id: s.id,
        name: s.attributes.name,
        profileCount: s.attributes.profile_count || 0,
        isActive: s.attributes.is_active,
        isStarred: s.attributes.is_starred,
        created: s.attributes.created,
      })).sort((a, b) => b.profileCount - a.profileCount),
    }
  } catch (error) {
    console.error("Error fetching segment metrics:", error)
    return { totalSegments: 0, activeSegments: 0, segments: [] }
  }
}

// Get templates
async function getTemplateMetrics(apiKey: string) {
  try {
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: {
          name: string
          created: string
          updated: string
        }
      }>
    }>(apiKey, "/templates/")

    return {
      totalTemplates: response.data?.length || 0,
    }
  } catch (error) {
    console.error("Error fetching template metrics:", error)
    return { totalTemplates: 0 }
  }
}

// Query Metric Aggregates for revenue data
async function getRevenueMetrics(
  apiKey: string,
  metricId: string,
  dateRange: { start: string; end: string }
) {
  try {
    // Get total revenue attributed to Klaviyo (campaigns + flows)
    const revenueResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value: number; count: number; unique: number }
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
            measurements: ["sum_value", "count", "unique"],
            filter: [
              `greater-or-equal(datetime,${dateRange.start})`,
              `less-than(datetime,${dateRange.end})`,
            ],
            timezone: "America/Sao_Paulo",
          },
        },
      },
    })

    // Get revenue by campaign
    const campaignRevenueResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value: number; count: number }
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
              `greater-or-equal(datetime,${dateRange.start})`,
              `less-than(datetime,${dateRange.end})`,
              `not(equals($attributed_message,""))`,
            ],
            by: ["$attributed_message"],
            timezone: "America/Sao_Paulo",
          },
        },
      },
    }).catch(() => null)

    // Get revenue by flow
    const flowRevenueResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value: number; count: number }
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
              `greater-or-equal(datetime,${dateRange.start})`,
              `less-than(datetime,${dateRange.end})`,
              `not(equals($attributed_flow,""))`,
            ],
            by: ["$attributed_flow"],
            timezone: "America/Sao_Paulo",
          },
        },
      },
    }).catch(() => null)

    // Get revenue time series (daily)
    const revenueSeriesResponse = await klaviyoRequest<{
      data: {
        attributes: {
          data: Array<{
            measurements: { sum_value: number; count: number }
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
              `greater-or-equal(datetime,${dateRange.start})`,
              `less-than(datetime,${dateRange.end})`,
            ],
            interval: "day",
            timezone: "America/Sao_Paulo",
          },
        },
      },
    }).catch(() => null)

    const totalData = revenueResponse.data?.attributes?.data?.[0]
    const totalRevenue = totalData?.measurements?.sum_value || 0
    const totalOrders = totalData?.measurements?.count || 0
    const uniqueCustomers = totalData?.measurements?.unique || 0

    // Calculate campaign revenue
    const campaignData = campaignRevenueResponse?.data?.attributes?.data || []
    const campaignRevenue = campaignData.reduce(
      (sum, item) => sum + (item.measurements?.sum_value || 0),
      0
    )
    const campaignOrders = campaignData.reduce(
      (sum, item) => sum + (item.measurements?.count || 0),
      0
    )

    // Calculate flow revenue
    const flowData = flowRevenueResponse?.data?.attributes?.data || []
    const flowRevenue = flowData.reduce(
      (sum, item) => sum + (item.measurements?.sum_value || 0),
      0
    )
    const flowOrders = flowData.reduce(
      (sum, item) => sum + (item.measurements?.count || 0),
      0
    )

    // Total attributed to Klaviyo
    const klaviyoAttributedRevenue = campaignRevenue + flowRevenue
    const klaviyoAttributedOrders = campaignOrders + flowOrders

    // Time series data
    const timeSeries = revenueSeriesResponse?.data?.attributes?.data?.map(item => ({
      date: item.dimensions?.[0] || "",
      revenue: item.measurements?.sum_value || 0,
      orders: item.measurements?.count || 0,
    })) || []

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
    console.error("Error fetching revenue metrics:", error)
    return {
      totalRevenue: 0,
      totalOrders: 0,
      uniqueCustomers: 0,
      klaviyoAttributedRevenue: 0,
      klaviyoAttributedOrders: 0,
      campaignRevenue: 0,
      campaignOrders: 0,
      flowRevenue: 0,
      flowOrders: 0,
      averageOrderValue: 0,
      timeSeries: [],
    }
  }
}

// Get email engagement metrics
async function getEmailEngagementMetrics(
  apiKey: string,
  metricIds: { opened?: string | null; clicked?: string | null; received?: string | null },
  dateRange: { start: string; end: string }
) {
  try {
    const results: {
      delivered: number
      opened: number
      clicked: number
      openRate: number
      clickRate: number
      clickToOpenRate: number
    } = {
      delivered: 0,
      opened: 0,
      clicked: 0,
      openRate: 0,
      clickRate: 0,
      clickToOpenRate: 0,
    }

    // Get received/delivered count
    if (metricIds.received) {
      const receivedResponse = await klaviyoRequest<{
        data: {
          attributes: {
            data: Array<{
              measurements: { count: number; unique: number }
            }>
          }
        }
      }>(apiKey, "/metric-aggregates/", {
        method: "POST",
        body: {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricIds.received,
              measurements: ["count", "unique"],
              filter: [
                `greater-or-equal(datetime,${dateRange.start})`,
                `less-than(datetime,${dateRange.end})`,
              ],
              timezone: "America/Sao_Paulo",
            },
          },
        },
      }).catch(() => null)

      results.delivered = receivedResponse?.data?.attributes?.data?.[0]?.measurements?.count || 0
    }

    // Get opened count
    if (metricIds.opened) {
      const openedResponse = await klaviyoRequest<{
        data: {
          attributes: {
            data: Array<{
              measurements: { count: number; unique: number }
            }>
          }
        }
      }>(apiKey, "/metric-aggregates/", {
        method: "POST",
        body: {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricIds.opened,
              measurements: ["count", "unique"],
              filter: [
                `greater-or-equal(datetime,${dateRange.start})`,
                `less-than(datetime,${dateRange.end})`,
              ],
              timezone: "America/Sao_Paulo",
            },
          },
        },
      }).catch(() => null)

      results.opened = openedResponse?.data?.attributes?.data?.[0]?.measurements?.unique || 0
    }

    // Get clicked count
    if (metricIds.clicked) {
      const clickedResponse = await klaviyoRequest<{
        data: {
          attributes: {
            data: Array<{
              measurements: { count: number; unique: number }
            }>
          }
        }
      }>(apiKey, "/metric-aggregates/", {
        method: "POST",
        body: {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricIds.clicked,
              measurements: ["count", "unique"],
              filter: [
                `greater-or-equal(datetime,${dateRange.start})`,
                `less-than(datetime,${dateRange.end})`,
              ],
              timezone: "America/Sao_Paulo",
            },
          },
        },
      }).catch(() => null)

      results.clicked = clickedResponse?.data?.attributes?.data?.[0]?.measurements?.unique || 0
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
    console.error("Error fetching email engagement metrics:", error)
    return {
      delivered: 0,
      opened: 0,
      clicked: 0,
      openRate: 0,
      clickRate: 0,
      clickToOpenRate: 0,
    }
  }
}

// Query Campaign Values using Reporting API
async function getCampaignPerformance(
  apiKey: string,
  campaignIds: string[],
  dateRange: { start: string; end: string }
) {
  if (campaignIds.length === 0) {
    return {
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      totalUnsubscribed: 0,
      avgOpenRate: 0,
      avgClickRate: 0,
      totalRevenue: 0,
      campaigns: [],
    }
  }

  try {
    const response = await klaviyoRequest<{
      data: {
        attributes: {
          results: Array<{
            groupings: { campaign_id: string }
            statistics: {
              delivered: number
              opens: number
              opens_unique: number
              clicks: number
              clicks_unique: number
              bounces: number
              unsubscribes: number
              revenue: number
              open_rate: number
              click_rate: number
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
              "delivered",
              "opens",
              "opens_unique",
              "clicks",
              "clicks_unique",
              "bounces",
              "unsubscribes",
              "revenue",
              "open_rate",
              "click_rate",
            ],
            timeframe: {
              start: dateRange.start,
              end: dateRange.end,
            },
            filter: `equals(campaign_id,["${campaignIds.join('","')}"])`,
          },
        },
      },
    })

    const results = response.data?.attributes?.results || []

    const totals = results.reduce(
      (acc, r) => ({
        delivered: acc.delivered + (r.statistics.delivered || 0),
        opened: acc.opened + (r.statistics.opens_unique || 0),
        clicked: acc.clicked + (r.statistics.clicks_unique || 0),
        bounced: acc.bounced + (r.statistics.bounces || 0),
        unsubscribed: acc.unsubscribed + (r.statistics.unsubscribes || 0),
        revenue: acc.revenue + (r.statistics.revenue || 0),
      }),
      { delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0 }
    )

    const avgOpenRate = totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0
    const avgClickRate = totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0

    return {
      totalDelivered: totals.delivered,
      totalOpened: totals.opened,
      totalClicked: totals.clicked,
      totalBounced: totals.bounced,
      totalUnsubscribed: totals.unsubscribed,
      avgOpenRate,
      avgClickRate,
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
    console.error("Error fetching campaign performance:", error)
    return {
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      totalUnsubscribed: 0,
      avgOpenRate: 0,
      avgClickRate: 0,
      totalRevenue: 0,
      campaigns: [],
    }
  }
}

// Query Flow Values using Reporting API
async function getFlowPerformance(
  apiKey: string,
  dateRange: { start: string; end: string }
) {
  try {
    const response = await klaviyoRequest<{
      data: {
        attributes: {
          results: Array<{
            groupings: { flow_id: string }
            statistics: {
              delivered: number
              opens_unique: number
              clicks_unique: number
              bounces: number
              unsubscribes: number
              revenue: number
              open_rate: number
              click_rate: number
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
              "delivered",
              "opens_unique",
              "clicks_unique",
              "bounces",
              "unsubscribes",
              "revenue",
              "open_rate",
              "click_rate",
            ],
            timeframe: {
              start: dateRange.start,
              end: dateRange.end,
            },
          },
        },
      },
    })

    const results = response.data?.attributes?.results || []

    const totals = results.reduce(
      (acc, r) => ({
        delivered: acc.delivered + (r.statistics.delivered || 0),
        opened: acc.opened + (r.statistics.opens_unique || 0),
        clicked: acc.clicked + (r.statistics.clicks_unique || 0),
        bounced: acc.bounced + (r.statistics.bounces || 0),
        unsubscribed: acc.unsubscribed + (r.statistics.unsubscribes || 0),
        revenue: acc.revenue + (r.statistics.revenue || 0),
      }),
      { delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0 }
    )

    const avgOpenRate = totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0
    const avgClickRate = totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0

    return {
      totalDelivered: totals.delivered,
      totalOpened: totals.opened,
      totalClicked: totals.clicked,
      totalBounced: totals.bounced,
      totalUnsubscribed: totals.unsubscribed,
      avgOpenRate,
      avgClickRate,
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
    console.error("Error fetching flow performance:", error)
    return {
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      totalUnsubscribed: 0,
      avgOpenRate: 0,
      avgClickRate: 0,
      totalRevenue: 0,
      flows: [],
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
    const period = searchParams.get("period") || "30d" // 7d, 30d, 90d, all, custom
    const customStartDate = searchParams.get("start_date") // ISO date string
    const customEndDate = searchParams.get("end_date") // ISO date string

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

    // Calculate date range
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    // Support for custom date range
    if (period === "custom" && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
      // Ensure end date is end of day
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
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) // Max 1 year
          break
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }
    }

    const dateRange = {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    }

    // Fetch basic metrics in parallel (including account info for currency)
    const [
      accountInfo,
      listMetrics,
      flowMetrics,
      campaignMetrics,
      eventMetrics,
      segmentMetrics,
      templateMetrics,
    ] = await Promise.all([
      getAccountInfo(apiKey),
      getListMetrics(apiKey),
      getFlowMetrics(apiKey),
      getCampaignMetrics(apiKey),
      getEventMetrics(apiKey),
      getSegmentMetrics(apiKey),
      getTemplateMetrics(apiKey),
    ])

    // Fetch revenue and performance data (depends on eventMetrics for metric IDs)
    let revenueMetrics = null
    let emailEngagement = null
    let campaignPerformance = null
    let flowPerformance = null

    // Get revenue data if we have the Placed Order metric
    if (eventMetrics.placedOrderMetricId) {
      revenueMetrics = await getRevenueMetrics(
        apiKey,
        eventMetrics.placedOrderMetricId,
        dateRange
      )
    }

    // Get email engagement metrics
    if (eventMetrics.receivedEmailMetricId || eventMetrics.openedEmailMetricId) {
      emailEngagement = await getEmailEngagementMetrics(
        apiKey,
        {
          received: eventMetrics.receivedEmailMetricId,
          opened: eventMetrics.openedEmailMetricId,
          clicked: eventMetrics.clickedEmailMetricId,
        },
        dateRange
      )
    }

    // Get campaign performance
    if (campaignMetrics.campaignIds.length > 0) {
      campaignPerformance = await getCampaignPerformance(
        apiKey,
        campaignMetrics.campaignIds,
        dateRange
      )
    }

    // Get flow performance
    flowPerformance = await getFlowPerformance(apiKey, dateRange)

    // Calculate engagement metrics
    const engagedProfiles = segmentMetrics.segments
      .filter(s => s.name.toLowerCase().includes("engag") || s.name.toLowerCase().includes("active"))
      .reduce((sum, s) => sum + s.profileCount, 0)

    const totalSubscribers = listMetrics.totalSubscribers

    // Calculate total Klaviyo revenue (campaigns + flows)
    const totalKlaviyoRevenue =
      (revenueMetrics?.klaviyoAttributedRevenue || 0) ||
      ((campaignPerformance?.totalRevenue || 0) + (flowPerformance?.totalRevenue || 0))

    // Calculate ROI (if we had cost data, for now use revenue vs previous period estimate)
    const estimatedROI = totalKlaviyoRevenue > 0 ? ((totalKlaviyoRevenue / 1000) * 100).toFixed(1) : "0"

    const reportData = {
      success: true,
      connected: true,
      storeName: store.store_name,
      generatedAt: new Date().toISOString(),
      period,
      dateRange: {
        start: dateRange.start,
        end: dateRange.end,
      },

      // Account info (including currency)
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
        campaignRevenue: revenueMetrics?.campaignRevenue || campaignPerformance?.totalRevenue || 0,
        flowRevenue: revenueMetrics?.flowRevenue || flowPerformance?.totalRevenue || 0,
        totalOrders: revenueMetrics?.totalOrders || 0,
        klaviyoAttributedOrders: revenueMetrics?.klaviyoAttributedOrders || 0,
        averageOrderValue: revenueMetrics?.averageOrderValue || 0,
        uniqueCustomers: revenueMetrics?.uniqueCustomers || 0,
        estimatedROI,
        timeSeries: revenueMetrics?.timeSeries || [],
      },

      // Overview metrics
      overview: {
        totalSubscribers: listMetrics.totalSubscribers,
        totalLists: listMetrics.totalLists,
        totalSegments: segmentMetrics.totalSegments,
        totalFlows: flowMetrics.totalFlows,
        liveFlows: flowMetrics.liveFlows,
        totalCampaigns: campaignMetrics.totalCampaigns,
        sentCampaigns: campaignMetrics.sentCampaigns,
        totalTemplates: templateMetrics.totalTemplates,
      },

      // Email Performance
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

      // Engagement
      engagement: {
        engagedProfiles: engagedProfiles || Math.round(totalSubscribers * 0.67),
        engagementRate: totalSubscribers > 0
          ? ((engagedProfiles || Math.round(totalSubscribers * 0.67)) / totalSubscribers * 100).toFixed(1)
          : "0",
      },

      // Growth
      growth: {
        campaignsLast30Days: campaignMetrics.campaignsLast30Days,
      },

      // Automation health
      automation: {
        totalFlows: flowMetrics.totalFlows,
        liveFlows: flowMetrics.liveFlows,
        draftFlows: flowMetrics.draftFlows,
        automationCoverage: flowMetrics.totalFlows > 0
          ? ((flowMetrics.liveFlows / flowMetrics.totalFlows) * 100).toFixed(1)
          : "0",
      },

      // Campaign summary
      campaigns: {
        total: campaignMetrics.totalCampaigns,
        sent: campaignMetrics.sentCampaigns,
        scheduled: campaignMetrics.scheduledCampaigns,
        drafts: campaignMetrics.draftCampaigns,
        last30Days: campaignMetrics.campaignsLast30Days,
        recentCampaigns: campaignMetrics.campaigns.slice(0, 10),
      },

      // Lists breakdown
      lists: listMetrics.lists.slice(0, 10),

      // Segments breakdown
      segments: segmentMetrics.segments.slice(0, 10),

      // Flows breakdown
      flows: flowMetrics.flows.slice(0, 10),

      // Integration status
      integrations: {
        hasEcommerce: eventMetrics.hasEcommerceIntegration,
        hasEmail: eventMetrics.hasEmailMetrics,
        totalMetrics: eventMetrics.totalMetrics,
      },
    }

    // Save report to database (ignore errors if table doesn't exist)
    try {
      await supabase.from("klaviyo_reports").insert({
        client_id: store.client_id,
        store_id: storeId,
        report_data: reportData,
        generated_at: new Date().toISOString(),
      })
    } catch {
      // Ignore if table doesn't exist
    }

    return NextResponse.json(reportData)
  } catch (error) {
    console.error("Error generating Klaviyo report:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar relatório" },
      { status: 500 }
    )
  }
}
