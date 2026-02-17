import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { getCache, setCache } from "@/lib/cache"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoReport")
import {
  KLAVIYO_API_URL,
  MIN_REQUEST_INTERVAL,
  sleep,
  corsHeaders,
  klaviyoRequest,
  getCurrencySymbol,
  parseDateRange,
  formatDateStr,
  testApiConnection,
  getAccountInfo,
  getTimezoneOffset,
  findPlacedOrderMetric,
} from "@/lib/integrations/klaviyo"

// Vercel serverless function configuration
// Extended timeout to allow fetching all Klaviyo data
export const maxDuration = 300 // 5 minutes (Pro plan limit)
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// Get total profiles count using profiles endpoint
// Counts ALL profiles for accurate count
async function getTotalProfilesFromAPI(apiKey: string): Promise<number> {
  log.debug("[Klaviyo] Fetching total profiles count (full count)...")

  let totalCount = 0
  let nextPage: string | null = "/profiles/?page[size]=100"
  let pagesChecked = 0
  const maxPages = 1000 // Up to 100,000 profiles

  type ProfilePage = { data: Array<{ id: string }>; links?: { next?: string } } | null

  while (nextPage && pagesChecked < maxPages) {
    const page: ProfilePage = await klaviyoRequest<{
      data: Array<{ id: string }>
      links?: { next?: string }
    }>(apiKey, nextPage)

    if (!page?.data) break

    totalCount += page.data.length
    pagesChecked++

    // Log progress every 50 pages
    if (pagesChecked % 50 === 0) {
      log.debug(`[Klaviyo] Profiles counted: ${totalCount} (page ${pagesChecked})`)
    }

    const nextLink: string | undefined = page.links?.next
    if (!nextLink) break
    nextPage = nextLink.replace(KLAVIYO_API_URL, "")

    await sleep(30) // Fast rate limit
  }

  log.debug(`[Klaviyo] Total profiles: ${totalCount} (${pagesChecked} pages)`)
  return totalCount
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
    attributes: { name: string; status: string; created: string; trigger_type: string }
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

  // Per Klaviyo API docs: use additional-fields to get profile_count
  // https://developers.klaviyo.com/en/reference/get_lists
  let nextPage: string | null = "/lists/?page[size]=100&additional-fields[list]=profile_count"

  log.debug("[Klaviyo] Fetching lists...")

  while (nextPage) {
    const response: ListsResponse | null = await klaviyoRequest<ListsResponse>(apiKey, nextPage)

    if (!response?.data) {
      log.debug("[Klaviyo] No data in lists response")
      break
    }

    log.debug(`[Klaviyo] Lists page returned ${response.data.length} lists`)

    for (const l of response.data) {
      // Log raw attributes for debugging
      log.debug(`[Klaviyo] Raw list attributes:`, JSON.stringify(l.attributes))
      const profileCount = l.attributes.profile_count ?? 0
      log.debug(`[Klaviyo] List: "${l.attributes.name}" - ${profileCount} profiles`)
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

  log.debug(`[Klaviyo] Fetched ${allLists.length} total lists with ${totalSubscribers} subscribers (from bulk)`)

  // If profile_count is 0 for all lists, fetch count individually for the largest lists
  if (totalSubscribers === 0 && allLists.length > 0) {
    log.debug("[Klaviyo] profile_count not in bulk response, fetching individually...")

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
        log.debug(`[Klaviyo] List "${list.name}" individual count: ${list.profileCount}`)
      }
      await sleep(200)
    }

    totalSubscribers = allLists.reduce((sum, l) => sum + l.profileCount, 0)
    log.debug(`[Klaviyo] Total after individual fetch: ${totalSubscribers}`)
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
  }> = []

  let nextPage: string | null = "/flows?page[size]=100"

  while (nextPage) {
    const response: FlowsResponse | null = await klaviyoRequest<FlowsResponse>(apiKey, nextPage)

    if (!response?.data) break

    for (const f of response.data) {
      allFlows.push({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type,
        created: f.attributes.created
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  log.debug(`[Klaviyo] Fetched ${allFlows.length} total flows`)
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

// Search for engaged segment specifically using Klaviyo API filters
// This is more reliable than fetching all segments and searching locally
// https://developers.klaviyo.com/en/reference/get_segments
async function findEngagedSegment(apiKey: string): Promise<{
  id: string
  name: string
  profileCount: number
} | null> {
  log.debug("[Klaviyo] ========== SEARCHING FOR ENGAGED SEGMENT ==========")

  // Try multiple filter patterns to find the engaged segment
  const filterPatterns = [
    'contains(name,"Engajados")',
    'contains(name,"engajados")',
    'contains(name,"Engaged")',
    'contains(name,"engaged")',
    'contains(name,"90d")',
    'contains(name,"90D")',
  ]

  for (const filter of filterPatterns) {
    log.debug(`[Klaviyo] Trying filter: ${filter}`)

    const encodedFilter = encodeURIComponent(filter)
    const response = await klaviyoRequest<{
      data: Array<{
        id: string
        attributes: { name: string; profile_count?: number }
      }>
    }>(apiKey, `/segments/?filter=${encodedFilter}&additional-fields[segment]=profile_count`)

    if (response?.data && response.data.length > 0) {
      log.debug(`[Klaviyo] Filter "${filter}" returned ${response.data.length} segments:`)
      response.data.forEach(s => {
        log.debug(`[Klaviyo] -> "${s.attributes.name}" (ID: ${s.id}) profile_count: ${s.attributes.profile_count}`)
      })

      // Look for segment with both "engajados/engaged" AND "90" in name
      const engagedSegment = response.data.find(s => {
        const name = s.attributes.name.toLowerCase()
        const hasEngajados = name.includes("engajados") || name.includes("engaged")
        const has90 = name.includes("90")
        return hasEngajados && has90
      })

      if (engagedSegment) {
        log.debug(`[Klaviyo] ✓ Found engaged segment: "${engagedSegment.attributes.name}" (ID: ${engagedSegment.id})`)

        // Now count profiles directly - don't rely on profile_count attribute
        const profileCount = await countSegmentProfiles(apiKey, engagedSegment.id)

        return {
          id: engagedSegment.id,
          name: engagedSegment.attributes.name,
          profileCount
        }
      }
    }

    await sleep(200) // Rate limit between filter attempts
  }

  log.debug("[Klaviyo] ✗ No engaged segment found via filters")
  return null
}

// Count profiles in a segment by paginating through all profiles
// This is the most reliable method as profile_count attribute can be stale/unavailable
async function countSegmentProfiles(apiKey: string, segmentId: string): Promise<number> {
  log.debug(`[Klaviyo] Counting profiles for segment ${segmentId}...`)

  type ProfilesResponse = {
    data: Array<{ id: string }>
    links?: { next?: string }
  }

  let totalProfiles = 0
  let nextPage: string | null = `/segments/${segmentId}/profiles/?page[size]=100`
  let pageCount = 0
  const maxPages = 500 // Up to 50,000 profiles

  while (nextPage && pageCount < maxPages) {
    const response: ProfilesResponse | null = await klaviyoRequest<ProfilesResponse>(apiKey, nextPage)

    if (!response) {
      log.debug(`[Klaviyo] API request failed at page ${pageCount}`)
      break
    }

    if (!response.data || response.data.length === 0) {
      log.debug(`[Klaviyo] No data at page ${pageCount}, stopping`)
      break
    }

    totalProfiles += response.data.length
    pageCount++

    // Log progress every 20 pages
    if (pageCount % 20 === 0) {
      log.debug(`[Klaviyo] Profile count progress: ${totalProfiles} (page ${pageCount})`)
    }

    const nextUrl: string | undefined = response.links?.next
    if (!nextUrl) {
      log.debug(`[Klaviyo] No next page link at page ${pageCount}`)
      break
    }

    nextPage = nextUrl.replace(KLAVIYO_API_URL, "")
    await sleep(30) // Fast pagination
  }

  log.debug(`[Klaviyo] ✓ Total profiles counted: ${totalProfiles} (${pageCount} pages)`)
  return totalProfiles
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

  // Per Klaviyo API docs: use additional-fields to get profile_count
  // https://developers.klaviyo.com/en/reference/get_segments
  let nextPage: string | null = "/segments/?page[size]=100&additional-fields[segment]=profile_count"

  log.debug("[Klaviyo] Fetching segments...")

  while (nextPage) {
    const response: SegmentsResponse | null = await klaviyoRequest<SegmentsResponse>(apiKey, nextPage)

    if (!response?.data) {
      log.debug("[Klaviyo] No data in segments response")
      break
    }

    log.debug(`[Klaviyo] Segments page returned ${response.data.length} segments`)

    for (const s of response.data) {
      // Log raw attributes for debugging
      log.debug(`[Klaviyo] Raw segment attributes:`, JSON.stringify(s.attributes))
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

  log.debug(`[Klaviyo] Fetched ${allSegments.length} total segments`)

  // Log ALL segments for debugging
  log.debug(`[Klaviyo] ========== ALL SEGMENTS ==========`)
  allSegments.forEach((s, i) => {
    log.debug(`[Klaviyo] [${i}] "${s.name}" (ID: ${s.id}) - profileCount: ${s.profileCount}`)
  })
  log.debug(`[Klaviyo] ==================================`)

  // Use dedicated function to find and count engaged segment
  // This uses API filters for more reliable search
  const engagedResult = await findEngagedSegment(apiKey)

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
      log.debug(`[Klaviyo] Found total profiles segment: "${totalProfilesSegment.name}" with ${totalProfilesSegment.profileCount} profiles`)
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
    log.debug("[Klaviyo] All segments have 0 profiles, fetching individually...")
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
        log.debug(`[Klaviyo] Segment "${seg.name}" individual count: ${seg.profileCount}`)
      }
      await sleep(200)
    }

    // Re-find largest after individual fetches
    largestSegment = allSegments.reduce((max, s) => s.profileCount > max.profileCount ? s : max, allSegments[0])
  }

  if (largestSegment) {
    log.debug(`[Klaviyo] Largest segment: "${largestSegment.name}" with ${largestSegment.profileCount} profiles`)
  } else {
    log.debug(`[Klaviyo] No segments found`)
  }

  // Log final engaged result
  log.debug(`[Klaviyo] ========== ENGAGED SEGMENT FINAL ==========`)
  log.debug(`[Klaviyo] engagedResult: ${engagedResult ? JSON.stringify(engagedResult) : 'null'}`)
  log.debug(`[Klaviyo] ==============================================`)

  return {
    totalSegments: allSegments.length,
    segments: allSegments.sort((a, b) => b.profileCount - a.profileCount),
    engaged90dProfiles: engagedResult?.profileCount || 0,
    engaged90dSegmentName: engagedResult?.name || null,
    totalActiveProfiles: totalProfilesSegment?.profileCount || largestSegment?.profileCount || 0,
    totalActiveProfilesSource: totalProfilesSegment?.name || largestSegment?.name || null
  }
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
  for (const channel of ['email', 'sms']) {
    let nextPage: string | null = `/campaigns?filter=equals(messages.channel,'${channel}')`

    while (nextPage) {
      const response: CampaignsResponse | null = await klaviyoRequest<CampaignsResponse>(apiKey, nextPage)

      if (!response?.data) break

      for (const c of response.data) {
        const status = c.attributes.status
        const sendTime = c.attributes.send_time
        log.debug(`[Klaviyo] Campaign: "${c.attributes.name}" | channel: ${channel} | status: ${status} | sendTime: ${sendTime || 'null'}`)

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

  const sentCount = allCampaigns.filter(c => c.status === 'sent').length
  log.debug(`[Klaviyo] Fetched ${allCampaigns.length} total campaigns (${sentCount} sent)`)
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
  log.debug(`[Klaviyo] Getting flow values report: ${startDate} to ${endDate} (timezone: ${timezoneOffset})`)

  // Valid statistics per Klaviyo Reporting API
  // Note: bounces, unsubscribes, spam_complaints are NOT valid for flow-values-reports
  const statistics = [
    "average_order_value",
    "bounce_rate",
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
    "open_rate",
    "opens",
    "opens_unique",
    "recipients",
    "revenue_per_recipient",
    "unsubscribe_rate"
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
            opens_unique?: number
            clicks?: number
            clicks_unique?: number
            conversion_value?: number
            conversions?: number
            conversion_uniques?: number
            recipients?: number
            delivery_rate?: number
            bounce_rate?: number
            open_rate?: number
            click_rate?: number
            unsubscribe_rate?: number
            click_to_open_rate?: number
            average_order_value?: number
            revenue_per_recipient?: number
          }
        }>
      }
    }
  }>(apiKey, "/flow-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    log.debug("[Klaviyo] No flow results returned")
    return { totalRevenue: 0, totalConversions: 0, flows: [], stats: {} }
  }

  const results = response.data.attributes.results
  log.debug(`[Klaviyo] Flow results: ${results.length} entries`)

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
    totalOpens += stats.opens_unique || 0
    totalClicks += stats.clicks_unique || 0

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
      opens: existing.opens + (stats.opens_unique || 0),
      clicks: existing.clicks + (stats.clicks_unique || 0),
      openRate: stats.open_rate || existing.openRate,
      clickRate: stats.click_rate || existing.clickRate,
      bounceRate: stats.bounce_rate || existing.bounceRate,
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate
    })
  }

  log.debug(`[Klaviyo] Flow totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`)

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
  log.debug(`[Klaviyo] Getting campaign values report: ${startDate} to ${endDate} (timezone: ${timezoneOffset})`)

  // Use same statistics as flows for consistency
  const statistics = [
    "average_order_value",
    "bounce_rate",
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
    "open_rate",
    "opens",
    "opens_unique",
    "recipients",
    "revenue_per_recipient",
    "unsubscribe_rate"
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
            opens_unique?: number
            clicks?: number
            clicks_unique?: number
            conversion_value?: number
            conversions?: number
            conversion_uniques?: number
            recipients?: number
            delivery_rate?: number
            bounce_rate?: number
            open_rate?: number
            click_rate?: number
            unsubscribe_rate?: number
            click_to_open_rate?: number
            average_order_value?: number
            revenue_per_recipient?: number
          }
        }>
      }
    }
  }>(apiKey, "/campaign-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    log.debug("[Klaviyo] No campaign results returned")
    return { totalRevenue: 0, totalConversions: 0, campaigns: [], stats: {} }
  }

  const results = response.data.attributes.results
  log.debug(`[Klaviyo] Campaign results: ${results.length} entries`)

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

    log.debug(`[Klaviyo] Campaign ${campaignId}: conversion_value=${stats.conversion_value}, delivered=${stats.delivered}`)

    totalRevenue += stats.conversion_value || 0
    totalConversions += stats.conversions || 0
    totalDelivered += stats.delivered || 0
    totalOpens += stats.opens_unique || 0
    totalClicks += stats.clicks_unique || 0

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
      opens: existing.opens + (stats.opens_unique || 0),
      clicks: existing.clicks + (stats.clicks_unique || 0),
      openRate: stats.open_rate || existing.openRate,
      clickRate: stats.click_rate || existing.clickRate,
      bounceRate: stats.bounce_rate || existing.bounceRate,
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate
    })
  }

  log.debug(`[Klaviyo] Campaign totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`)

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
      throw new AppError("store_id é obrigatório", 400)
    }

    // Check cache first (skip if force_refresh)
    const forceRefresh = searchParams.get("force_refresh") === "true"
    if (!forceRefresh) {
      const cached = await getCache(supabase, storeId, "klaviyo", period)
      if (cached) {
        return NextResponse.json(
          { ...cached.data, _cached: true, _cachedAt: cached.cachedAt },
          { headers: corsHeaders() }
        )
      }
    }

    const storeData = await getStoreCredentials(storeId)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key
    if (!apiKey) {
      throw new AppError("API Key do Klaviyo não configurada", 400)
    }

    log.debug("[Klaviyo] ========== STARTING REPORT ==========")
    log.debug("[Klaviyo] Store:", storeData.store_name)
    log.debug("[Klaviyo] Period:", period)

    // Calculate date range based on period
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate)
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)

    log.debug(`[Klaviyo] Date range: ${startDateStr} to ${endDateStr}`)

    // Test API connection first
    const isConnected = await testApiConnection(apiKey)
    if (!isConnected) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "Não foi possível conectar à API do Klaviyo. Verifique a API Key.",
      }, { status: 401, headers: corsHeaders() })
    }

    // Get account info first
    const accountInfo = await getAccountInfo(apiKey)
    log.debug("[Klaviyo] Account currency:", accountInfo.currency)

    // Find Placed Order metric
    const metricId = await findPlacedOrderMetric(apiKey)

    if (!metricId) {
      // Return basic data without revenue
      const [listMetrics, segmentMetrics, allFlows, allCampaigns] = await Promise.all([
        getLists(apiKey),
        getSegments(apiKey),
        getFlows(apiKey),
        getCampaigns(apiKey)
      ])

      // Calculate total subscribers - use largest list or segment profile count
      // (summing can double-count profiles in multiple lists)
      const largestListCount = listMetrics.lists.length > 0 ? listMetrics.lists[0].profileCount : 0
      let errorCaseTotalSubscribers = largestListCount || segmentMetrics.totalActiveProfiles || listMetrics.totalSubscribers

      // If still 0, use profiles API directly
      if (errorCaseTotalSubscribers === 0) {
        log.debug("[Klaviyo] All counts are 0, fetching from profiles API...")
        errorCaseTotalSubscribers = await getTotalProfilesFromAPI(apiKey)
      }

      log.debug(`[Klaviyo] Error case totalSubscribers: ${errorCaseTotalSubscribers} (largest list: ${largestListCount}, segment: ${segmentMetrics.totalActiveProfiles})`)

      return NextResponse.json({
        success: true,
        connected: true,
        storeName: storeData.store_name,
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
          sentCampaigns: allCampaigns.filter(c => c.status === "sent").length,
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
        campaigns: allCampaigns.filter(c => c.status === "sent"), // ALL sent campaigns
        integrations: { hasEcommerce: false }
      }, { headers: corsHeaders() })
    }

    // Get all data
    const [listMetrics, segmentMetrics, allFlows, allCampaigns] = await Promise.all([
      getLists(apiKey),
      getSegments(apiKey),
      getFlows(apiKey),
      getCampaigns(apiKey)
    ])

    // Calculate total subscribers using list/segment profile_count (fast)
    // Only fall back to expensive profiles API pagination if all counts are 0
    const largestListCount = listMetrics.lists.length > 0 ? listMetrics.lists[0].profileCount : 0
    const segmentCount = segmentMetrics.totalActiveProfiles || 0

    log.debug(`[Klaviyo] List counts: largest=${largestListCount}, segment=${segmentCount}, sum=${listMetrics.totalSubscribers}`)

    let totalSubscribers = largestListCount || segmentCount || listMetrics.totalSubscribers

    // Only use expensive API pagination as last resort
    if (totalSubscribers === 0) {
      log.debug("[Klaviyo] All counts are 0, fetching from profiles API as fallback...")
      totalSubscribers = await getTotalProfilesFromAPI(apiKey)
    }

    log.debug(`[Klaviyo] totalSubscribers: ${totalSubscribers}`)

    // Filter campaigns by send_time in period
    const inicio = new Date(startDateStr)
    const fim = new Date(endDateStr)
    fim.setHours(23, 59, 59, 999)

    log.debug(`[Klaviyo] Total campaigns fetched: ${allCampaigns.length}`)
    log.debug(`[Klaviyo] Filtering for period: ${inicio.toISOString()} to ${fim.toISOString()}`)

    // Log all campaigns with send times for debugging
    const sentCampaigns = allCampaigns.filter(c => c.status === "sent")
    log.debug(`[Klaviyo] Sent campaigns: ${sentCampaigns.length}`)
    sentCampaigns.forEach(c => {
      log.debug(`[Klaviyo] Campaign: ${c.name} | sendTime: ${c.sendTime} | createdAt: ${c.createdAt} | status: ${c.status}`)
    })

    // We'll determine campaigns in period after getting reporting data
    // The Reporting API is more reliable as it filters by actual activity in the timeframe

    // Get timezone offset from account settings to match Klaviyo dashboard
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
    log.debug(`[Klaviyo] Using timezone offset: ${timezoneOffset} (from ${accountInfo.timezone})`)

    // Check structured tables for recent flow/campaign data before hitting API
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const [cachedFlowRows, cachedCampaignRows] = await Promise.all([
      supabase
        .from("klaviyo_flow_metrics")
        .select("*")
        .eq("store_id", storeId)
        .eq("period_start", startDateStr)
        .eq("period_end", endDateStr)
        .gt("fetched_at", thirtyMinAgo),
      supabase
        .from("klaviyo_campaign_metrics")
        .select("*")
        .eq("store_id", storeId)
        .eq("period_start", startDateStr)
        .eq("period_end", endDateStr)
        .gt("fetched_at", thirtyMinAgo)
    ])

    const hasFlowCache = cachedFlowRows.data && cachedFlowRows.data.length > 0
    const hasCampaignCache = cachedCampaignRows.data && cachedCampaignRows.data.length > 0

    let flowReport
    let campaignReport

    if (hasFlowCache && hasCampaignCache) {
      log.debug(`[Klaviyo] Using structured cache: ${cachedFlowRows.data!.length} flows, ${cachedCampaignRows.data!.length} campaigns`)

      // Build flowReport from cached rows
      const flowRows = cachedFlowRows.data!
      const flowTotalRevenue = flowRows.reduce((s, r) => s + (r.conversion_value || 0), 0)
      const flowTotalConversions = flowRows.reduce((s, r) => s + (r.conversions || 0), 0)
      const flowTotalDelivered = flowRows.reduce((s, r) => s + (r.delivered || 0), 0)
      const flowTotalOpens = flowRows.reduce((s, r) => s + (r.opened || 0), 0)
      const flowTotalClicks = flowRows.reduce((s, r) => s + (r.clicked || 0), 0)
      const flowAvgBounceRate = flowRows.length > 0 ? flowRows.reduce((s, r) => s + (r.bounce_rate || 0), 0) / flowRows.length : 0
      const flowAvgUnsubRate = flowRows.length > 0 ? flowRows.reduce((s, r) => s + (r.unsubscribe_rate || 0), 0) / flowRows.length : 0

      flowReport = {
        totalRevenue: flowTotalRevenue,
        totalConversions: flowTotalConversions,
        totalDelivered: flowTotalDelivered,
        totalOpens: flowTotalOpens,
        totalClicks: flowTotalClicks,
        avgBounceRate: flowAvgBounceRate,
        avgUnsubscribeRate: flowAvgUnsubRate,
        flows: flowRows.map(r => ({
          flowId: r.flow_id,
          revenue: r.conversion_value || 0,
          conversions: r.conversions || 0,
          delivered: r.delivered || 0,
          opens: r.opened || 0,
          clicks: r.clicked || 0,
          openRate: r.open_rate || 0,
          clickRate: r.click_rate || 0,
          bounceRate: r.bounce_rate || 0,
          unsubscribeRate: r.unsubscribe_rate || 0,
        })),
        stats: {
          openRate: flowTotalDelivered > 0 ? (flowTotalOpens / flowTotalDelivered) * 100 : 0,
          clickRate: flowTotalDelivered > 0 ? (flowTotalClicks / flowTotalDelivered) * 100 : 0,
          bounceRate: flowAvgBounceRate,
          unsubscribeRate: flowAvgUnsubRate,
        }
      }

      // Build campaignReport from cached rows
      const campRows = cachedCampaignRows.data!
      const campTotalRevenue = campRows.reduce((s, r) => s + (r.conversion_value || 0), 0)
      const campTotalConversions = campRows.reduce((s, r) => s + (r.conversions || 0), 0)
      const campTotalDelivered = campRows.reduce((s, r) => s + (r.delivered || 0), 0)
      const campTotalOpens = campRows.reduce((s, r) => s + (r.opened || 0), 0)
      const campTotalClicks = campRows.reduce((s, r) => s + (r.clicked || 0), 0)
      const campAvgBounceRate = campRows.length > 0 ? campRows.reduce((s, r) => s + (r.bounce_rate || 0), 0) / campRows.length : 0
      const campAvgUnsubRate = campRows.length > 0 ? campRows.reduce((s, r) => s + (r.unsubscribe_rate || 0), 0) / campRows.length : 0

      campaignReport = {
        totalRevenue: campTotalRevenue,
        totalConversions: campTotalConversions,
        totalDelivered: campTotalDelivered,
        totalOpens: campTotalOpens,
        totalClicks: campTotalClicks,
        avgBounceRate: campAvgBounceRate,
        avgUnsubscribeRate: campAvgUnsubRate,
        campaigns: campRows.map(r => ({
          campaignId: r.campaign_id,
          revenue: r.conversion_value || 0,
          conversions: r.conversions || 0,
          delivered: r.delivered || 0,
          opens: r.opened || 0,
          clicks: r.clicked || 0,
          openRate: r.open_rate || 0,
          clickRate: r.click_rate || 0,
          bounceRate: r.bounce_rate || 0,
          unsubscribeRate: r.unsubscribe_rate || 0,
        })),
        stats: {
          openRate: campTotalDelivered > 0 ? (campTotalOpens / campTotalDelivered) * 100 : 0,
          clickRate: campTotalDelivered > 0 ? (campTotalClicks / campTotalDelivered) * 100 : 0,
          bounceRate: campAvgBounceRate,
          unsubscribeRate: campAvgUnsubRate,
        }
      }
    } else {
      // Get reporting data from Klaviyo API
      log.debug("[Klaviyo] No structured cache, fetching from API...")
      const [fr, cr] = await Promise.all([
        getFlowValuesReport(apiKey, metricId, startDateStr, endDateStr, timezoneOffset),
        getCampaignValuesReport(apiKey, metricId, startDateStr, endDateStr, timezoneOffset)
      ])
      flowReport = fr
      campaignReport = cr
    }

    // Merge flow data with names
    const flowsWithNames = flowReport.flows.map(fr => {
      const flowInfo = allFlows.find(f => f.id === fr.flowId)
      return {
        ...fr,
        name: flowInfo?.name || "Unknown Flow",
        status: flowInfo?.status || "unknown"
      }
    }).filter(f => f.revenue > 0 || f.delivered > 0)

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
    log.debug(`[Klaviyo] Campaigns with activity in period (from Reporting API): ${campaignsInPeriodCount}`)

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
    log.debug(`[Klaviyo] Campaigns in period details:`)
    campaignsInPeriod.forEach(c => {
      log.debug(`[Klaviyo] -> ${c.name} (${c.id}): delivered=${c.delivered}`)
    })

    // Calculate totals
    const totalKlaviyoRevenue = flowReport.totalRevenue + campaignReport.totalRevenue
    const totalConversions = flowReport.totalConversions + campaignReport.totalConversions
    const totalDelivered = (flowReport.totalDelivered || 0) + (campaignReport.totalDelivered || 0)
    const totalOpens = (flowReport.totalOpens || 0) + (campaignReport.totalOpens || 0)
    const totalClicks = (flowReport.totalClicks || 0) + (campaignReport.totalClicks || 0)
    const avgBounceRate = ((flowReport.avgBounceRate || 0) + (campaignReport.avgBounceRate || 0)) / 2
    const avgUnsubscribeRate = ((flowReport.avgUnsubscribeRate || 0) + (campaignReport.avgUnsubscribeRate || 0)) / 2

    log.debug("[Klaviyo] ========== FINAL SUMMARY ==========")
    log.debug(`[Klaviyo] Total Klaviyo Revenue: ${accountInfo.currency} ${totalKlaviyoRevenue.toFixed(2)}`)
    log.debug(`[Klaviyo] - Campaigns: ${accountInfo.currency} ${campaignReport.totalRevenue.toFixed(2)}`)
    log.debug(`[Klaviyo] - Flows: ${accountInfo.currency} ${flowReport.totalRevenue.toFixed(2)}`)
    log.debug(`[Klaviyo] Total Conversions: ${totalConversions}`)
    log.debug(`[Klaviyo] Total Delivered: ${totalDelivered}`)
    log.debug("[Klaviyo] ========================================")

    const reportData = {
      success: true,
      connected: true,
      storeName: storeData.store_name,
      generatedAt: new Date().toISOString(),
      period,
      dateRange: { start: startDateStr, end: endDateStr },

      account: {
        currency: accountInfo.currency,
        currencySymbol: getCurrencySymbol(accountInfo.currency),
        locale: accountInfo.locale,
      },

      revenue: {
        totalRevenue: totalKlaviyoRevenue,
        klaviyoAttributedRevenue: totalKlaviyoRevenue,
        campaignRevenue: campaignReport.totalRevenue,
        flowRevenue: flowReport.totalRevenue,
        totalOrders: totalConversions,
        klaviyoAttributedOrders: totalConversions,
        averageOrderValue: totalConversions > 0 ? totalKlaviyoRevenue / totalConversions : 0,
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
        sentCampaigns: allCampaigns.filter(c => c.status === "sent").length,
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
        sent: allCampaigns.filter(c => c.status === "sent").length,
        scheduled: allCampaigns.filter(c => c.status === "scheduled").length,
        drafts: allCampaigns.filter(c => c.status === "draft").length,
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

    // Save to cache for future requests
    await setCache(supabase, storeId, "klaviyo", period, reportData as unknown as Record<string, unknown>)

    return NextResponse.json(reportData, { headers: corsHeaders() })

  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoReport")
  }
}
