import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoReport")
import {
  KLAVIYO_API_URL,
  KLAVIYO_REVISION,
  MIN_REQUEST_INTERVAL,
  sleep,
  klaviyoRequest,
  getCurrencySymbol,
  parseDateRangeInTimezone,
  getAccountInfo,
  getTimezoneOffset,
  findPlacedOrderMetric,
} from "@/lib/integrations/klaviyo"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

// Vercel serverless function configuration
// Extended timeout to allow fetching all Klaviyo data
export const maxDuration = 300 // 5 minutes (Pro plan limit)
export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Get total profiles count using a single API call with page[size]=1
// The /profiles/ endpoint returns a total count header or we use the first page cursor logic
// Much more efficient than paginating ALL profiles
async function getTotalProfilesEstimate(apiKey: string): Promise<number> {
  log.info("[Klaviyo] Estimating total profiles (lightweight)...")

  // Fetch just 1 profile to check if there are profiles at all
  // The real count comes from list/segment profile_count fields
  const response = await klaviyoRequest<{
    data: Array<{ id: string }>
    links?: { next?: string }
  }>(apiKey, "/profiles/?page[size]=1")

  if (!response?.data) {
    log.info("[Klaviyo] No profiles found")
    return 0
  }

  // If there's a next page, we know there are more than 1 profile
  // Return -1 to signal "has profiles but count unknown" - callers will use list/segment counts
  const hasMore = !!response.links?.next
  log.info(`[Klaviyo] Profiles exist: ${response.data.length > 0}, hasMore: ${hasMore}`)
  return hasMore ? -1 : response.data.length
}

// Types for paginated responses
type ListsResponse = {
  data: Array<{
    id: string
    attributes: { name: string; profile_count: number; created: string }
  }>
  links?: { next?: string }
}

type FlowsResponse = {
  data: Array<{
    id: string
    attributes: { name: string; status: string; created: string; trigger_type: string; archived: boolean }
  }>
  links?: { next?: string }
}

type CampaignsResponse = {
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
  links?: { next?: string }
}

// Get ALL lists with profile counts and pagination
async function getLists(apiKey: string) {
  const allLists: Array<{
    id: string
    name: string
    profileCount: number
    created: string
  }> = []

  // Klaviyo API revision 2024-10-15 rejects page[size] and additional-fields for lists
  // Use simplest URL possible and fetch profile_count individually via fallback below
  let nextPage: string | null = "/lists/"

  log.info("[Klaviyo] Fetching lists...")

  while (nextPage) {
    const response: ListsResponse | null = await klaviyoRequest<ListsResponse>(apiKey, nextPage)

    if (!response?.data) {
      log.info("[Klaviyo] No data in lists response")
      break
    }

    log.info(`[Klaviyo] Lists page returned ${response.data.length} lists`)

    for (const l of response.data) {
      // Log raw attributes for debugging
      log.info(`[Klaviyo] Raw list attributes:`, JSON.stringify(l.attributes))
      const profileCount = l.attributes.profile_count ?? 0
      log.info(`[Klaviyo] List: "${l.attributes.name}" - ${profileCount} profiles`)
      allLists.push({
        id: l.id,
        name: l.attributes.name,
        profileCount,
        created: l.attributes.created
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  let totalSubscribers = allLists.reduce((sum, l) => sum + l.profileCount, 0)

  log.info(`[Klaviyo] Fetched ${allLists.length} total lists with ${totalSubscribers} subscribers (from bulk)`)

  // If profile_count is 0 for all lists, fetch count individually for the largest lists
  if (totalSubscribers === 0 && allLists.length > 0) {
    log.info("[Klaviyo] profile_count not in bulk response, fetching individually...")

    // Fetch profile count for up to 5 lists to find the one with most profiles
    const listsToCheck = allLists.slice(0, 5)
    for (const list of listsToCheck) {
      const detailResponse = await klaviyoRequest<{
        data: {
          id: string
          attributes: { name: string; profile_count?: number }
        }
      }>(apiKey, `/lists/${list.id}/?additional-fields[list]=profile_count`)

      if (detailResponse?.data?.attributes?.profile_count) {
        list.profileCount = detailResponse.data.attributes.profile_count
        log.info(`[Klaviyo] List "${list.name}" individual count: ${list.profileCount}`)
      }
      await sleep(200)
    }

    totalSubscribers = allLists.reduce((sum, l) => sum + l.profileCount, 0)
    log.info(`[Klaviyo] Total after individual fetch: ${totalSubscribers}`)
  }

  // Sort by profileCount descending
  const sortedLists = allLists.sort((a, b) => b.profileCount - a.profileCount)

  return {
    totalLists: allLists.length,
    totalSubscribers,
    lists: sortedLists
  }
}

// Get ALL flows with pagination
async function getFlows(apiKey: string) {
  const allFlows: Array<{
    id: string
    name: string
    status: string
    triggerType: string
    created: string
    archived: boolean
  }> = []

  // page[size] works for flows (unlike lists/segments which reject it)
  let nextPage: string | null = "/flows/?page[size]=50"

  while (nextPage) {
    const response: FlowsResponse | null = await klaviyoRequest<FlowsResponse>(apiKey, nextPage)

    if (!response?.data) break

    for (const f of response.data) {
      allFlows.push({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type,
        created: f.attributes.created,
        archived: f.attributes.archived ?? false,
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  log.info(`[Klaviyo] Fetched ${allFlows.length} total flows`)
  return allFlows
}

// Get ALL segments with profile counts
type SegmentsResponse = {
  data: Array<{
    id: string
    attributes: { name: string; profile_count: number; created: string; is_active: boolean; is_starred: boolean }
  }>
  links?: { next?: string }
}

// Search for engaged segment from already-fetched segments list
// Uses profile_count attribute instead of counting profiles manually (saves hundreds of API calls)
function findEngagedSegmentFromList(segments: Array<{
  id: string
  name: string
  profileCount: number
}>): { id: string; name: string; profileCount: number } | null {
  log.info("[Klaviyo] Searching for engaged segment in fetched segments...")

  const engagedSegment = segments.find(s => {
    const name = s.name.toLowerCase()
    const hasEngaged = name.includes("engajados") || name.includes("engaged")
    const has90 = name.includes("90")
    return hasEngaged && has90
  })

  if (engagedSegment) {
    log.info(`[Klaviyo] Found engaged segment: "${engagedSegment.name}" (${engagedSegment.id}) - ${engagedSegment.profileCount} profiles`)
    return engagedSegment
  }

  // Fallback: any segment with "engaged" or "engajados" in the name
  const anyEngaged = segments.find(s => {
    const name = s.name.toLowerCase()
    return name.includes("engajados") || name.includes("engaged")
  })

  if (anyEngaged) {
    log.info(`[Klaviyo] Found fallback engaged segment: "${anyEngaged.name}" (${anyEngaged.id}) - ${anyEngaged.profileCount} profiles`)
    return anyEngaged
  }

  log.info("[Klaviyo] No engaged segment found")
  return null
}

async function getSegments(apiKey: string) {
  const allSegments: Array<{
    id: string
    name: string
    profileCount: number
    isActive: boolean
    isStarred: boolean
    created: string
  }> = []

  // Klaviyo API revision 2024-10-15 rejects page[size] and additional-fields for segments
  // Use simplest URL possible and fetch profile_count individually via fallback below
  let nextPage: string | null = "/segments/"

  log.info("[Klaviyo] Fetching segments...")

  while (nextPage) {
    const response: SegmentsResponse | null = await klaviyoRequest<SegmentsResponse>(apiKey, nextPage)

    if (!response?.data) {
      log.info("[Klaviyo] No data in segments response")
      break
    }

    log.info(`[Klaviyo] Segments page returned ${response.data.length} segments`)

    for (const s of response.data) {
      // Log raw attributes for debugging
      log.info(`[Klaviyo] Raw segment attributes:`, JSON.stringify(s.attributes))
      const profileCount = s.attributes.profile_count ?? 0
      allSegments.push({
        id: s.id,
        name: s.attributes.name,
        profileCount,
        isActive: s.attributes.is_active,
        isStarred: s.attributes.is_starred,
        created: s.attributes.created
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  log.info(`[Klaviyo] Fetched ${allSegments.length} total segments`)

  // Log ALL segments for debugging
  log.info(`[Klaviyo] ========== ALL SEGMENTS ==========`)
  allSegments.forEach((s, i) => {
    log.info(`[Klaviyo] [${i}] "${s.name}" (ID: ${s.id}) - profileCount: ${s.profileCount}`)
  })
  log.info(`[Klaviyo] ==================================`)

  // Search for engaged segment from already-fetched data (no extra API calls)
  const engagedResult = findEngagedSegmentFromList(allSegments)

  // Find a segment that represents total active profiles
  // Look for "Newsletter", "All Subscribers", "Master List", etc.
  const totalProfilesPatterns = [
    /newsletter/i,
    /all\s*(subscribers?|contacts?|profiles?)/i,
    /master\s*list/i,
    /main\s*list/i,
    /todos?\s*(os\s*)?(contatos?|inscritos?)/i,
    /lista\s*principal/i,
    /base\s*(completa|total|geral)/i,
  ]

  let totalProfilesSegment = null
  for (const pattern of totalProfilesPatterns) {
    totalProfilesSegment = allSegments.find(s => pattern.test(s.name))
    if (totalProfilesSegment) {
      log.info(`[Klaviyo] Found total profiles segment: "${totalProfilesSegment.name}" with ${totalProfilesSegment.profileCount} profiles`)
      break
    }
  }

  // If no specific segment found, use the largest segment as an approximation
  let largestSegment = allSegments.length > 0
    ? allSegments.reduce((max, s) => s.profileCount > max.profileCount ? s : max, allSegments[0])
    : null

  // If all segments have 0 profiles, fetch counts individually for up to 5 segments
  const allZero = allSegments.every(s => s.profileCount === 0)
  if (allZero && allSegments.length > 0) {
    log.info("[Klaviyo] All segments have 0 profiles, fetching individually...")
    const segmentsToCheck = allSegments.slice(0, 5)
    for (const seg of segmentsToCheck) {
      const detailResponse = await klaviyoRequest<{
        data: {
          id: string
          attributes: { name: string; profile_count?: number }
        }
      }>(apiKey, `/segments/${seg.id}/?additional-fields[segment]=profile_count`)

      if (detailResponse?.data?.attributes?.profile_count) {
        seg.profileCount = detailResponse.data.attributes.profile_count
        log.info(`[Klaviyo] Segment "${seg.name}" individual count: ${seg.profileCount}`)
      }
      await sleep(200)
    }

    // Re-find largest after individual fetches
    largestSegment = allSegments.reduce((max, s) => s.profileCount > max.profileCount ? s : max, allSegments[0])
  }

  if (largestSegment) {
    log.info(`[Klaviyo] Largest segment: "${largestSegment.name}" with ${largestSegment.profileCount} profiles`)
  } else {
    log.info(`[Klaviyo] No segments found`)
  }

  // Log final engaged result
  log.info(`[Klaviyo] ========== ENGAGED SEGMENT FINAL ==========`)
  log.info(`[Klaviyo] engagedResult: ${engagedResult ? JSON.stringify(engagedResult) : 'null'}`)
  log.info(`[Klaviyo] ==============================================`)

  return {
    totalSegments: allSegments.length,
    segments: allSegments.sort((a, b) => b.profileCount - a.profileCount),
    engaged90dProfiles: engagedResult?.profileCount || 0,
    engaged90dSegmentName: engagedResult?.name || null,
    totalActiveProfiles: totalProfilesSegment?.profileCount || largestSegment?.profileCount || 0,
    totalActiveProfilesSource: totalProfilesSegment?.name || largestSegment?.name || null
  }
}

// Helper: check if a campaign counts as "sent"
// Klaviyo API status may be "sent", "Sent", or campaign may have a sendTime even with different status
function isSentCampaign(c: { status: string; sendTime: string | null }): boolean {
  return c.status.toLowerCase() === "sent" || c.sendTime !== null
}

// Get ALL campaigns with pagination
// Klaviyo requires a channel filter (messages.channel) and does NOT support page[size]
async function getCampaigns(apiKey: string) {
  const allCampaigns: Array<{
    id: string
    name: string
    status: string
    sendTime: string | null
    createdAt: string
    archived: boolean
  }> = []

  // Fetch email and SMS campaigns separately (channel filter is required by Klaviyo API)
  // Do NOT use page[size] - Klaviyo rejects it for campaigns too
  for (const channel of ['email', 'sms']) {
    let nextPage: string | null = `/campaigns/?filter=equals(messages.channel,'${channel}')`

    while (nextPage) {
      const response: CampaignsResponse | null = await klaviyoRequest<CampaignsResponse>(apiKey, nextPage)

      if (!response?.data) break

      for (const c of response.data) {
        const status = c.attributes.status
        const sendTime = c.attributes.send_time
        log.info(`[Klaviyo] Campaign: "${c.attributes.name}" | channel: ${channel} | status: ${status} | sendTime: ${sendTime || 'null'}`)

        allCampaigns.push({
          id: c.id,
          name: c.attributes.name,
          status,
          sendTime,
          createdAt: c.attributes.created_at,
          archived: c.attributes.archived
        })
      }

      // Get next page URL if exists
      nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

      // Rate limit between pages
      if (nextPage) await sleep(300)
    }
  }

  // Log all unique statuses for debugging
  const statusCounts = allCampaigns.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  log.info(`[Klaviyo] Campaign statuses: ${JSON.stringify(statusCounts)}`)

  // Accept both "sent" and "Sent" (Klaviyo API may vary)
  const sentCount = allCampaigns.filter(c =>
    c.status.toLowerCase() === 'sent' || c.sendTime !== null
  ).length
  log.info(`[Klaviyo] Fetched ${allCampaigns.length} total campaigns (${sentCount} sent/with send_time)`)
  return allCampaigns
}

// Query Flow Values Report - per Klaviyo Reporting API docs
// https://developers.klaviyo.com/en/reference/reporting_api_overview
async function getFlowValuesReport(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string = "+00:00"
) {
  log.info(`[Klaviyo] Getting flow values report: ${startDate} to ${endDate} (timezone: ${timezoneOffset})`)

  // Valid statistics per Klaviyo Reporting API (revision 2024-10-15)
  // IMPORTANT: API uses "opens"/"clicks" (NOT "opened"/"clicked")
  const statistics = [
    "average_order_value",
    "bounce_rate",
    "bounced",
    "click_rate",
    "click_to_open_rate",
    "clicks",
    "conversion_rate",
    "conversion_uniques",
    "conversion_value",
    "conversions",
    "delivered",
    "delivery_rate",
    "opens",
    "recipients",
    "revenue_per_recipient",
    "unsubscribe_rate",
    "unsubscribes"
  ]

  // Timeframe format per docs: ISO 8601 with timezone
  // Use account timezone to match Klaviyo dashboard
  // https://developers.klaviyo.com/en/reference/query_flow_values
  const body = {
    data: {
      type: "flow-values-report",
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00${timezoneOffset}`,
          end: `${endDate}T23:59:59${timezoneOffset}`
        },
        conversion_metric_id: metricId,
        statistics
      }
    }
  }

  await sleep(MIN_REQUEST_INTERVAL)

  const response = await klaviyoRequest<{
    data: {
      attributes: {
        results: Array<{
          groupings: {
            flow_id: string
            send_channel: string
            flow_message_id: string
          }
          statistics: {
            delivered?: number
            opens?: number
            clicks?: number
            bounced?: number
            conversion_value?: number
            conversions?: number
            conversion_uniques?: number
            recipients?: number
            delivery_rate?: number
            bounce_rate?: number
            click_rate?: number
            unsubscribe_rate?: number
            unsubscribes?: number
            click_to_open_rate?: number
            average_order_value?: number
            revenue_per_recipient?: number
          }
        }>
      }
    }
  }>(apiKey, "/flow-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    log.info("[Klaviyo] No flow results returned")
    return { totalRevenue: 0, totalConversions: 0, flows: [], stats: {} }
  }

  const results = response.data.attributes.results
  log.info(`[Klaviyo] Flow results: ${results.length} entries`)

  // Aggregate by flow_id
  const flowMap = new Map<string, {
    revenue: number
    conversions: number
    delivered: number
    opens: number
    clicks: number
    openRate: number
    clickRate: number
    bounceRate: number
    unsubscribeRate: number
  }>()

  let totalRevenue = 0
  let totalConversions = 0
  let totalDelivered = 0
  let totalOpens = 0
  let totalClicks = 0
  let sumBounceRate = 0
  let sumUnsubscribeRate = 0
  let rateCount = 0

  for (const r of results) {
    const flowId = r.groupings.flow_id
    const stats = r.statistics

    totalRevenue += stats.conversion_value || 0
    totalConversions += stats.conversions || 0
    totalDelivered += stats.delivered || 0
    totalOpens += stats.opens || 0
    totalClicks += stats.clicks || 0

    if (stats.bounce_rate !== undefined) {
      sumBounceRate += stats.bounce_rate
      rateCount++
    }
    if (stats.unsubscribe_rate !== undefined) {
      sumUnsubscribeRate += stats.unsubscribe_rate
    }

    const existing = flowMap.get(flowId) || {
      revenue: 0, conversions: 0, delivered: 0, opens: 0, clicks: 0,
      openRate: 0, clickRate: 0, bounceRate: 0, unsubscribeRate: 0
    }

    flowMap.set(flowId, {
      revenue: existing.revenue + (stats.conversion_value || 0),
      conversions: existing.conversions + (stats.conversions || 0),
      delivered: existing.delivered + (stats.delivered || 0),
      opens: existing.opens + (stats.opens || 0),
      clicks: existing.clicks + (stats.clicks || 0),
      openRate: stats.click_to_open_rate || existing.openRate,
      clickRate: stats.click_rate || existing.clickRate,
      bounceRate: stats.bounce_rate || existing.bounceRate,
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate
    })
  }

  log.info(`[Klaviyo] Flow totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`)

  const avgBounceRate = rateCount > 0 ? sumBounceRate / rateCount : 0
  const avgUnsubscribeRate = rateCount > 0 ? sumUnsubscribeRate / rateCount : 0

  return {
    totalRevenue,
    totalConversions,
    totalDelivered,
    totalOpens,
    totalClicks,
    avgBounceRate,
    avgUnsubscribeRate,
    flows: Array.from(flowMap.entries()).map(([flowId, stats]) => ({
      flowId,
      ...stats
    })),
    stats: {
      openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0,
      bounceRate: avgBounceRate,
      unsubscribeRate: avgUnsubscribeRate
    }
  }
}

// Query Campaign Values Report - per Klaviyo Reporting API docs
// https://developers.klaviyo.com/en/reference/query_campaign_values
// Query ALL campaigns at once (like flows) for better accuracy
async function getCampaignValuesReport(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string = "+00:00"
) {
  log.info(`[Klaviyo] Getting campaign values report: ${startDate} to ${endDate} (timezone: ${timezoneOffset})`)

  // Valid statistics per Klaviyo Reporting API (revision 2024-10-15)
  // IMPORTANT: API uses "opens"/"clicks" (NOT "opened"/"clicked")
  const statistics = [
    "average_order_value",
    "bounce_rate",
    "bounced",
    "click_rate",
    "click_to_open_rate",
    "clicks",
    "conversion_rate",
    "conversion_uniques",
    "conversion_value",
    "conversions",
    "delivered",
    "delivery_rate",
    "opens",
    "recipients",
    "revenue_per_recipient",
    "unsubscribe_rate",
    "unsubscribes"
  ]

  // Query ALL campaigns at once (no filter) - same approach as flows
  // Use account timezone to match Klaviyo dashboard
  const body = {
    data: {
      type: "campaign-values-report",
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00${timezoneOffset}`,
          end: `${endDate}T23:59:59${timezoneOffset}`
        },
        conversion_metric_id: metricId,
        statistics
      }
    }
  }

  await sleep(MIN_REQUEST_INTERVAL)

  const response = await klaviyoRequest<{
    data: {
      attributes: {
        results: Array<{
          groupings: {
            campaign_id: string
            send_channel: string
          }
          statistics: {
            delivered?: number
            opens?: number
            clicks?: number
            bounced?: number
            conversion_value?: number
            conversions?: number
            conversion_uniques?: number
            recipients?: number
            delivery_rate?: number
            bounce_rate?: number
            click_rate?: number
            unsubscribe_rate?: number
            unsubscribes?: number
            click_to_open_rate?: number
            average_order_value?: number
            revenue_per_recipient?: number
          }
        }>
      }
    }
  }>(apiKey, "/campaign-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    log.info("[Klaviyo] No campaign results returned")
    return { totalRevenue: 0, totalConversions: 0, campaigns: [], stats: {} }
  }

  const results = response.data.attributes.results
  log.info(`[Klaviyo] Campaign results: ${results.length} entries`)

  // Aggregate by campaign_id
  const campaignMap = new Map<string, {
    revenue: number
    conversions: number
    delivered: number
    opens: number
    clicks: number
    openRate: number
    clickRate: number
    bounceRate: number
    unsubscribeRate: number
  }>()

  let totalRevenue = 0
  let totalConversions = 0
  let totalDelivered = 0
  let totalOpens = 0
  let totalClicks = 0
  let sumBounceRate = 0
  let sumUnsubscribeRate = 0
  let rateCount = 0

  for (const r of results) {
    const campaignId = r.groupings.campaign_id
    const stats = r.statistics

    log.info(`[Klaviyo] Campaign ${campaignId}: conversion_value=${stats.conversion_value}, delivered=${stats.delivered}`)

    totalRevenue += stats.conversion_value || 0
    totalConversions += stats.conversions || 0
    totalDelivered += stats.delivered || 0
    totalOpens += stats.opens || 0
    totalClicks += stats.clicks || 0

    if (stats.bounce_rate !== undefined) {
      sumBounceRate += stats.bounce_rate
      rateCount++
    }
    if (stats.unsubscribe_rate !== undefined) {
      sumUnsubscribeRate += stats.unsubscribe_rate
    }

    const existing = campaignMap.get(campaignId) || {
      revenue: 0, conversions: 0, delivered: 0, opens: 0, clicks: 0,
      openRate: 0, clickRate: 0, bounceRate: 0, unsubscribeRate: 0
    }

    campaignMap.set(campaignId, {
      revenue: existing.revenue + (stats.conversion_value || 0),
      conversions: existing.conversions + (stats.conversions || 0),
      delivered: existing.delivered + (stats.delivered || 0),
      opens: existing.opens + (stats.opens || 0),
      clicks: existing.clicks + (stats.clicks || 0),
      openRate: stats.click_to_open_rate || existing.openRate,
      clickRate: stats.click_rate || existing.clickRate,
      bounceRate: stats.bounce_rate || existing.bounceRate,
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate
    })
  }

  log.info(`[Klaviyo] Campaign totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`)

  const avgBounceRate = rateCount > 0 ? sumBounceRate / rateCount : 0
  const avgUnsubscribeRate = rateCount > 0 ? sumUnsubscribeRate / rateCount : 0

  return {
    totalRevenue,
    totalConversions,
    totalDelivered,
    totalOpens,
    totalClicks,
    avgBounceRate,
    avgUnsubscribeRate,
    campaigns: Array.from(campaignMap.entries()).map(([campaignId, stats]) => ({
      campaignId,
      ...stats
    })),
    stats: {
      openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0,
      bounceRate: avgBounceRate,
      unsubscribeRate: avgUnsubscribeRate
    }
  }
}

// Main GET handler
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Get store display info using admin client (RLS on client_stores
    // may block access depending on org membership; auth is already
    // verified by requireAuth above)
    const adminClient = createAdminClient()
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select("store_name, client_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Get decrypted credentials via credentials service
    const credentials = await getStoreCredentials(storeId)
    const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "API Key não configurada",
      }, { headers: corsHeaders(request.headers.get("origin")) })
    }

    log.info("[Klaviyo] ========== STARTING REPORT ==========")
    log.info("[Klaviyo] Store:", store.store_name)
    log.info("[Klaviyo] Period:", period)

    // Get account info first (need timezone for correct date range calculation)
    const accountInfo = await getAccountInfo(apiKey)
    if (!accountInfo.orgName) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "Não foi possível conectar à API do Klaviyo. Verifique a API Key.",
      }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }
    log.info("[Klaviyo] Account currency:", accountInfo.currency)

    // Calculate date range in account timezone (avoids UTC shift on Vercel servers)
    const accountTimezone = accountInfo.timezone || "America/Sao_Paulo"
    const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, accountTimezone, customStartDate, customEndDate)

    log.info(`[Klaviyo] Date range: ${startDateStr} to ${endDateStr} (timezone: ${accountTimezone})`)

    // Small delay to avoid rate limiting before next call
    await sleep(500)

    // Find Placed Order metric - with diagnostic logging
    let metricId = await findPlacedOrderMetric(apiKey)

    // If findPlacedOrderMetric failed, try direct fetch as fallback (debug endpoint style)
    if (!metricId) {
      log.warn("[Klaviyo] findPlacedOrderMetric returned null, trying direct fetch fallback...")
      await sleep(500)
      try {
        const directRes = await fetch(`${KLAVIYO_API_URL}/metrics/`, {
          headers: {
            "Authorization": `Klaviyo-API-Key ${apiKey}`,
            "Accept": "application/json",
            "revision": KLAVIYO_REVISION,
          },
        })
        log.info(`[Klaviyo] Direct metrics fetch status: ${directRes.status}`)
        if (directRes.ok) {
          const metricsData = await directRes.json()
          const metrics = metricsData?.data || []
          log.info(`[Klaviyo] Direct fetch found ${metrics.length} metrics`)
          const match = metrics.find((m: { attributes: { name: string } }) =>
            m.attributes.name === "Placed Order"
          )
          if (match) {
            metricId = match.id
            log.info(`[Klaviyo] Found via fallback: Placed Order (${metricId})`)
          }
        } else {
          const errText = await directRes.text()
          log.error(`[Klaviyo] Direct metrics fetch failed: ${errText.substring(0, 300)}`)
        }
      } catch (e) {
        log.error("[Klaviyo] Direct metrics fetch error:", e)
      }
    }

    if (!metricId) {
      // Return basic data without revenue
      // Fetch data SEQUENTIALLY to avoid rate limiting
      await sleep(500)
      const listMetrics = await getLists(apiKey)
      await sleep(500)
      const segmentMetrics = await getSegments(apiKey)
      await sleep(500)
      const allFlows = await getFlows(apiKey)
      await sleep(500)
      const allCampaigns = await getCampaigns(apiKey)

      // Calculate total subscribers from list/segment counts
      const largestListCount = listMetrics.lists.length > 0 ? listMetrics.lists[0].profileCount : 0
      let errorCaseTotalSubscribers = largestListCount || segmentMetrics.totalActiveProfiles || listMetrics.totalSubscribers

      // Lightweight check if still 0 (1 API call)
      if (errorCaseTotalSubscribers === 0) {
        log.info("[Klaviyo] All counts are 0, doing lightweight profile check...")
        await sleep(500)
        const estimate = await getTotalProfilesEstimate(apiKey)
        if (estimate > 0) errorCaseTotalSubscribers = estimate
      }

      log.info(`[Klaviyo] Error case totalSubscribers: ${errorCaseTotalSubscribers} (largest list: ${largestListCount}, segment: ${segmentMetrics.totalActiveProfiles})`)

      return NextResponse.json({
        success: true,
        connected: true,
        storeName: store.store_name,
        generatedAt: new Date().toISOString(),
        period,
        dateRange: { start: startDateStr, end: endDateStr },
        warning: "Métrica 'Placed Order' não encontrada. Configure a integração de e-commerce no Klaviyo.",
        account: {
          currency: accountInfo.currency,
          currencySymbol: getCurrencySymbol(accountInfo.currency),
          locale: accountInfo.locale,
        },
        revenue: {
          totalRevenue: 0,
          klaviyoAttributedRevenue: 0,
          campaignRevenue: 0,
          flowRevenue: 0,
          totalOrders: 0,
        },
        overview: {
          totalSubscribers: errorCaseTotalSubscribers,
          totalLists: listMetrics.totalLists,
          totalSegments: segmentMetrics.totalSegments,
          totalFlows: allFlows.length,
          liveFlows: allFlows.filter(f => f.status === "live").length,
          totalCampaigns: allCampaigns.length,
          sentCampaigns: allCampaigns.filter(c => isSentCampaign(c)).length,
          campaignsInPeriod: 0, // No period filter for error case
          totalTemplates: 0,
        },
        engagement: {
          engagedProfiles: segmentMetrics.engaged90dProfiles,
          engagementRate: errorCaseTotalSubscribers > 0
            ? ((segmentMetrics.engaged90dProfiles / errorCaseTotalSubscribers) * 100).toFixed(1)
            : "0",
          engaged90dSegmentName: segmentMetrics.engaged90dSegmentName,
        },
        automation: {
          totalFlows: allFlows.length,
          liveFlows: allFlows.filter(f => f.status === "live").length,
          draftFlows: allFlows.filter(f => f.status === "draft").length,
          automationCoverage: allFlows.length > 0
            ? ((allFlows.filter(f => f.status === "live").length / allFlows.length) * 100).toFixed(0)
            : "0",
        },
        lists: listMetrics.lists, // ALL lists
        segments: segmentMetrics.segments, // ALL segments
        flows: allFlows, // ALL flows
        campaigns: allCampaigns.filter(c => isSentCampaign(c)), // ALL sent campaigns
        integrations: { hasEcommerce: false }
      }, { headers: corsHeaders(request.headers.get("origin")) })
    }

    // Fetch all data SEQUENTIALLY to avoid rate limiting
    await sleep(500)
    const listMetrics = await getLists(apiKey)
    log.info(`[Klaviyo] Lists done: ${listMetrics.totalLists} lists`)

    await sleep(500)
    const segmentMetrics = await getSegments(apiKey)
    log.info(`[Klaviyo] Segments done: ${segmentMetrics.totalSegments} segments`)

    await sleep(500)
    const allFlows = await getFlows(apiKey)
    log.info(`[Klaviyo] Flows done: ${allFlows.length} flows`)

    await sleep(500)
    const allCampaigns = await getCampaigns(apiKey)
    log.info(`[Klaviyo] Campaigns done: ${allCampaigns.length} campaigns`)

    // Calculate total subscribers from list/segment profile counts
    // NO MORE paginating all profiles (was ~426 API calls for 42k profiles!)
    const largestListCount = listMetrics.lists.length > 0 ? listMetrics.lists[0].profileCount : 0
    const segmentCount = segmentMetrics.totalActiveProfiles || 0
    let totalSubscribers = largestListCount || segmentCount || listMetrics.totalSubscribers

    // If still 0, do a lightweight check (1 API call instead of ~426)
    if (totalSubscribers === 0) {
      log.info("[Klaviyo] All counts 0, doing lightweight profile check...")
      await sleep(500)
      const estimate = await getTotalProfilesEstimate(apiKey)
      if (estimate > 0) {
        totalSubscribers = estimate
      }
    }

    log.info(`[Klaviyo] totalSubscribers: ${totalSubscribers} (largestList=${largestListCount}, segment=${segmentCount})`)

    // Filter campaigns by send_time in period
    const inicio = new Date(startDateStr)
    const fim = new Date(endDateStr)
    fim.setHours(23, 59, 59, 999)

    log.info(`[Klaviyo] Total campaigns fetched: ${allCampaigns.length}`)
    log.info(`[Klaviyo] Filtering for period: ${inicio.toISOString()} to ${fim.toISOString()}`)

    // Log all campaigns with send times for debugging
    const sentCampaigns = allCampaigns.filter(c => isSentCampaign(c))
    log.info(`[Klaviyo] Sent campaigns: ${sentCampaigns.length}`)
    sentCampaigns.forEach(c => {
      log.info(`[Klaviyo] Campaign: ${c.name} | sendTime: ${c.sendTime} | createdAt: ${c.createdAt} | status: ${c.status}`)
    })

    // We'll determine campaigns in period after getting reporting data
    // The Reporting API is more reliable as it filters by actual activity in the timeframe

    // Get timezone offset from account settings to match Klaviyo dashboard
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
    log.info(`[Klaviyo] Using timezone offset: ${timezoneOffset} (from ${accountInfo.timezone})`)

    // Get reporting data SEQUENTIALLY to avoid rate limiting
    // Reporting endpoints have stricter limits (1 req/s)
    await sleep(1500)
    const flowReport = await getFlowValuesReport(apiKey, metricId, startDateStr, endDateStr, timezoneOffset)
    log.info(`[Klaviyo] Flow report done: revenue=${flowReport.totalRevenue}, delivered=${flowReport.totalDelivered}`)

    await sleep(1500)
    const campaignReport = await getCampaignValuesReport(apiKey, metricId, startDateStr, endDateStr, timezoneOffset)
    log.info(`[Klaviyo] Campaign report done: revenue=${campaignReport.totalRevenue}, delivered=${campaignReport.totalDelivered}`)

    // Fetch store-wide revenue via metric-aggregates (ALL Placed Orders, not just email-attributed)
    await sleep(1500)
    let storeRevenue = 0
    let storeOrders = 0
    try {
      const metricAggResponse = await klaviyoRequest<{
        data?: {
          attributes?: {
            data?: Array<{
              measurements?: Record<string, number | number[]>
            }>
          }
        }
      }>(apiKey, "/metric-aggregates/", {
        method: "POST",
        logTag: "ReportMetricAgg",
        body: {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricId,
              measurements: ["sum_value", "count"],
              filter: [
                `greater-or-equal(datetime,${startDateStr}T00:00:00)`,
                `less-than(datetime,${endDateStr}T23:59:59)`,
              ],
              timezone: accountInfo.timezone || "America/Sao_Paulo",
            },
          },
        },
      })

      const aggData = metricAggResponse?.data?.attributes?.data || []
      for (const row of aggData) {
        const measurements = row.measurements || {}
        const vals = measurements.sum_value
        const cnts = measurements.count
        if (Array.isArray(vals)) {
          for (const v of vals) storeRevenue += Number(v) || 0
        } else {
          storeRevenue += Number(vals) || 0
        }
        if (Array.isArray(cnts)) {
          for (const c of cnts) storeOrders += Number(c) || 0
        } else {
          storeOrders += Number(cnts) || 0
        }
      }
      log.info(`[Klaviyo] Metric aggregates: storeRevenue=${storeRevenue.toFixed(2)}, storeOrders=${storeOrders}`)
    } catch (e) {
      log.error("[Klaviyo] Metric aggregates failed (non-fatal):", e)
    }

    // Merge flow data with names, excluding archived flows
    const archivedFlowIds = new Set(allFlows.filter(f => f.archived).map(f => f.id))
    log.info(`[Klaviyo] Archived flows excluded from revenue: ${archivedFlowIds.size}`)

    const flowsWithNames = flowReport.flows
      .filter(fr => !archivedFlowIds.has(fr.flowId))
      .map(fr => {
        const flowInfo = allFlows.find(f => f.id === fr.flowId)
        return {
          ...fr,
          name: flowInfo?.name || "Unknown Flow",
          status: flowInfo?.status || "unknown"
        }
      }).filter(f => f.revenue > 0 || f.delivered > 0)

    // Recalculate flow revenue excluding archived flows
    const activeFlowRevenue = flowReport.flows
      .filter(fr => !archivedFlowIds.has(fr.flowId))
      .reduce((sum, fr) => sum + fr.revenue, 0)
    const activeFlowConversions = flowReport.flows
      .filter(fr => !archivedFlowIds.has(fr.flowId))
      .reduce((sum, fr) => sum + fr.conversions, 0)
    log.info(`[Klaviyo] Flow revenue: total=${flowReport.totalRevenue.toFixed(2)}, active-only=${activeFlowRevenue.toFixed(2)}`)

    // Merge campaign data with names (search ALL campaigns, not just filtered)
    const campaignsWithNames = campaignReport.campaigns.map(cr => {
      const campInfo = allCampaigns.find(c => c.id === cr.campaignId)
      return {
        ...cr,
        name: campInfo?.name || "Unknown Campaign",
        sendTime: campInfo?.sendTime
      }
    }).filter(c => c.revenue > 0 || c.delivered > 0)

    // Count campaigns in period based on Reporting API data
    // This is more reliable than filtering by send_time as it shows actual activity
    const campaignsInPeriodCount = campaignReport.campaigns.length
    log.info(`[Klaviyo] Campaigns with activity in period (from Reporting API): ${campaignsInPeriodCount}`)

    // Also create a list of campaign IDs that had activity for reference
    const campaignsInPeriod = campaignReport.campaigns.map(cr => {
      const campInfo = allCampaigns.find(c => c.id === cr.campaignId)
      return {
        id: cr.campaignId,
        name: campInfo?.name || "Unknown Campaign",
        status: campInfo?.status || "sent",
        sendTime: campInfo?.sendTime,
        delivered: cr.delivered || 0
      }
    })
    log.info(`[Klaviyo] Campaigns in period details:`)
    campaignsInPeriod.forEach(c => {
      log.info(`[Klaviyo] -> ${c.name} (${c.id}): delivered=${c.delivered}`)
    })

    // Calculate totals (using active-only flow revenue, excluding archived)
    const totalKlaviyoRevenue = activeFlowRevenue + campaignReport.totalRevenue
    const totalConversions = activeFlowConversions + campaignReport.totalConversions
    const totalDelivered = (flowReport.totalDelivered || 0) + (campaignReport.totalDelivered || 0)
    const totalOpens = (flowReport.totalOpens || 0) + (campaignReport.totalOpens || 0)
    const totalClicks = (flowReport.totalClicks || 0) + (campaignReport.totalClicks || 0)
    const avgBounceRate = ((flowReport.avgBounceRate || 0) + (campaignReport.avgBounceRate || 0)) / 2
    const avgUnsubscribeRate = ((flowReport.avgUnsubscribeRate || 0) + (campaignReport.avgUnsubscribeRate || 0)) / 2

    log.info("[Klaviyo] ========== FINAL SUMMARY ==========")
    log.info(`[Klaviyo] Total Klaviyo Revenue: ${accountInfo.currency} ${totalKlaviyoRevenue.toFixed(2)}`)
    log.info(`[Klaviyo] - Campaigns: ${accountInfo.currency} ${campaignReport.totalRevenue.toFixed(2)}`)
    log.info(`[Klaviyo] - Flows (active only): ${accountInfo.currency} ${activeFlowRevenue.toFixed(2)}`)
    log.info(`[Klaviyo] Total Conversions: ${totalConversions}`)
    log.info(`[Klaviyo] Total Delivered: ${totalDelivered}`)
    log.info("[Klaviyo] ========================================")

    const reportData = {
      success: true,
      connected: true,
      storeName: store.store_name,
      generatedAt: new Date().toISOString(),
      period,
      dateRange: { start: startDateStr, end: endDateStr },

      account: {
        currency: accountInfo.currency,
        currencySymbol: getCurrencySymbol(accountInfo.currency),
        locale: accountInfo.locale,
      },

      revenue: {
        storeRevenue,
        storeOrders,
        totalRevenue: totalKlaviyoRevenue,
        klaviyoAttributedRevenue: totalKlaviyoRevenue,
        campaignRevenue: campaignReport.totalRevenue,
        flowRevenue: activeFlowRevenue,
        totalOrders: totalConversions,
        klaviyoAttributedOrders: totalConversions,
        averageOrderValue: totalConversions > 0 ? totalKlaviyoRevenue / totalConversions : 0,
        recoveryRate: storeRevenue > 0 ? (totalKlaviyoRevenue / storeRevenue) * 100 : 0,
      },

      emailPerformance: {
        delivered: totalDelivered,
        opened: totalOpens,
        clicked: totalClicks,
        bounceRate: avgBounceRate,
        unsubscribeRate: avgUnsubscribeRate,
        openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
        clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0,
        clickToOpenRate: totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0,
      },

      overview: {
        totalSubscribers: totalSubscribers, // Uses calculated value with fallback
        totalLists: listMetrics.totalLists,
        totalSegments: segmentMetrics.totalSegments,
        totalFlows: allFlows.length,
        liveFlows: allFlows.filter(f => f.status === "live").length,
        totalCampaigns: allCampaigns.length,
        sentCampaigns: allCampaigns.filter(c => isSentCampaign(c)).length,
        campaignsInPeriod: campaignsInPeriodCount,
        totalTemplates: 0, // Templates not fetched currently
      },

      // Engagement data - uses segment data for accurate counts
      engagement: {
        engagedProfiles: segmentMetrics.engaged90dProfiles,
        engagementRate: totalSubscribers > 0
          ? ((segmentMetrics.engaged90dProfiles / totalSubscribers) * 100).toFixed(1)
          : "0",
        engaged90dSegmentName: segmentMetrics.engaged90dSegmentName,
      },

      // Automation data
      automation: {
        totalFlows: allFlows.length,
        liveFlows: allFlows.filter(f => f.status === "live").length,
        draftFlows: allFlows.filter(f => f.status === "draft").length,
        automationCoverage: allFlows.length > 0
          ? ((allFlows.filter(f => f.status === "live").length / allFlows.length) * 100).toFixed(0)
          : "0",
      },

      // Growth metrics
      growth: {
        campaignsLast30Days: campaignsInPeriodCount,
      },

      campaignPerformance: {
        totalRevenue: campaignReport.totalRevenue,
        totalConversions: campaignReport.totalConversions,
        totalDelivered: campaignReport.totalDelivered,
        avgOpenRate: campaignReport.stats.openRate || 0,
        avgClickRate: campaignReport.stats.clickRate || 0,
        campaigns: campaignsWithNames.sort((a, b) => b.revenue - a.revenue), // ALL campaigns
      },

      flowPerformance: {
        totalRevenue: flowReport.totalRevenue,
        totalConversions: flowReport.totalConversions,
        totalDelivered: flowReport.totalDelivered,
        avgOpenRate: flowReport.stats.openRate || 0,
        avgClickRate: flowReport.stats.clickRate || 0,
        flows: flowsWithNames.sort((a, b) => b.revenue - a.revenue), // ALL flows
      },

      lists: listMetrics.lists, // ALL lists

      // ALL segments with profile counts
      segments: segmentMetrics.segments,

      // Flows with counts and details for frontend
      flows: allFlows.map(f => ({
        id: f.id,
        name: f.name,
        status: f.status,
        triggerType: f.triggerType
      })),

      // Campaigns with counts and details for frontend (structure expected by UI)
      campaigns: {
        total: allCampaigns.length,
        sent: allCampaigns.filter(c => isSentCampaign(c)).length,
        scheduled: allCampaigns.filter(c => c.status.toLowerCase() === "scheduled").length,
        drafts: allCampaigns.filter(c => c.status.toLowerCase() === "draft").length,
        // Recent campaigns with performance data (sorted by revenue, includes all with data)
        recentCampaigns: campaignsWithNames.map(c => ({
          id: c.campaignId,
          name: c.name,
          status: "sent",
          sendTime: c.sendTime,
          revenue: c.revenue,
          delivered: c.delivered,
          opens: c.opens,
          clicks: c.clicks,
          openRate: c.openRate,
          clickRate: c.clickRate
        })).sort((a, b) => b.revenue - a.revenue),
        // Also include campaigns in period without revenue data
        allInPeriod: campaignsInPeriod.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          sendTime: c.sendTime
        }))
      },

      integrations: {
        hasEcommerce: true,
        placedOrderMetricId: metricId,
      },

    }

    return NextResponse.json(reportData, { headers: corsHeaders(request.headers.get("origin")) })

  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoReport")
  }
}
