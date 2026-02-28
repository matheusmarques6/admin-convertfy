import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { getShopifyReportForStore } from "@/lib/integrations/shopify/report"
import { paginationSchema } from "@/lib/schemas/common"
import { z } from "zod"

const log = logger.child("StoresControl")

// Revenue cache: keyed by storeId, TTL 10 minutes
const revenueCache = new Map<string, {
  klaviyo: { totalRevenue: number; campaignRevenue: number; flowRevenue: number } | null
  shopify: number | null
  timestamp: number
}>()
const CACHE_TTL = 10 * 60 * 1000

// Schema for this endpoint's query params
const storeControlQuerySchema = paginationSchema.extend({
  per_page: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional().default(""),
  status: z.enum(["on_track", "due_soon", "overdue", "never", ""]).optional().default(""),
  link_filter: z.enum(["all", "avulsas", "vinculadas"]).optional().default("all"),
})

interface KlaviyoStoreRevenue {
  storeId: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
}

type FeedbackStatus = 'on_track' | 'due_soon' | 'overdue' | 'never'

interface StoreWithResults {
  id: string
  client_id: string | null
  org_id: string | null
  client_name: string | null
  client_company: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  total_revenue_30d: number
  klaviyo_revenue_30d: number
  campaign_revenue_30d: number
  flow_revenue_30d: number
  recovery_rate: number | null
  revenue_status: 'loaded' | 'no_integration' | 'error'
  feedback_frequency: 'monthly' | '30_days'
  last_feedback_date: string | null
  next_feedback_date: string | null
  last_feedback_by: string | null
  last_feedback_by_name: string | null
  feedback_status: FeedbackStatus
  days_until_feedback: number | null
  last_call_date: string | null
  last_call_source: 'feedback' | 'meeting' | null
  has_shopify: boolean
  has_klaviyo: boolean
}

// Raw store row from Supabase query
interface StoreRow {
  id: string
  client_id: string | null
  org_id: string | null
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  shopify_access_token: string | null
  klaviyo_private_key: string | null
  feedback_frequency: string | null
  last_feedback_date: string | null
  next_feedback_date: string | null
  last_feedback_by: string | null
  feedback_notes: string | null
  clients: { id: string; name: string; company: string; status: string } | null
  profiles: { name: string } | null
}

const STATUS_PRIORITY: Record<FeedbackStatus, number> = { overdue: 0, due_soon: 1, never: 2, on_track: 3 }

/**
 * Compute feedback status from store dates (considers meetings via lastCallDate).
 * Must match the logic used in the enrichment step below.
 */
function computeFeedbackStatus(
  store: { next_feedback_date: string | null; last_feedback_date: string | null },
  today: Date
): { status: FeedbackStatus; daysUntil: number | null } {
  let feedbackStatus: FeedbackStatus = 'never'
  let daysUntilFeedback: number | null = null

  if (store.next_feedback_date) {
    const nextDate = new Date(store.next_feedback_date)
    nextDate.setHours(0, 0, 0, 0)

    const diffTime = nextDate.getTime() - today.getTime()
    daysUntilFeedback = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (daysUntilFeedback < 0) {
      feedbackStatus = 'overdue'
    } else if (daysUntilFeedback <= 7) {
      feedbackStatus = 'due_soon'
    } else {
      feedbackStatus = 'on_track'
    }
  } else if (store.last_feedback_date) {
    feedbackStatus = 'overdue'
  }

  return { status: feedbackStatus, daysUntil: daysUntilFeedback }
}

/**
 * Sanitize search input for Supabase .ilike() / .or() interpolation.
 * Escapes %, _, comma, parentheses to prevent filter injection.
 */
function sanitizeSearch(input: string): string {
  return input
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Nao autorizado' }, { status: 401 })
    }

    const orgId = await resolveOrgId(user.id)

    const { searchParams } = new URL(request.url)

    // Parse and validate query params
    const params = storeControlQuerySchema.parse(Object.fromEntries(searchParams))
    const { page, per_page: perPage, search: rawSearch, status: statusFilter, link_filter: linkFilter } = params

    // Sanitize search
    const search = rawSearch ? sanitizeSearch(rawSearch) : ""

    // Backward compatibility: without pagination params, return everything
    const isPaginated = searchParams.has("page") || searchParams.has("per_page")

    // Existing params
    const activeOnly = searchParams.get('active_only') !== 'false'
    const skipCache = searchParams.get('fresh') === 'true'

    // ==============================
    // Summary + Link Counts (global, lightweight query - no API calls)
    // ==============================
    const { data: allStoresForSummary } = await supabase
      .from("client_stores")
      .select("id, next_feedback_date, last_feedback_date, client_id")
      .eq("org_id", orgId)
      .eq("is_active", true)

    // Also fetch meetings for summary computation (harmonize with enrichment)
    const { data: meetingsDataForSummary } = await supabase
      .from('meetings')
      .select('client_id, scheduled_at')
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false })

    const lastMeetingByClientSummary = new Map<string, string>()
    if (meetingsDataForSummary) {
      for (const m of meetingsDataForSummary) {
        if (!lastMeetingByClientSummary.has(m.client_id)) {
          lastMeetingByClientSummary.set(m.client_id, m.scheduled_at)
        }
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const summary = { total: 0, overdue: 0, due_soon: 0, on_track: 0, never: 0 }
    const linkCounts = { all: 0, avulsas: 0, vinculadas: 0 }

    for (const store of allStoresForSummary || []) {
      summary.total++
      linkCounts.all++

      if (!store.client_id) linkCounts.avulsas++
      else linkCounts.vinculadas++

      // Compute status - consider meetings for never->overdue promotion
      const { status: baseStatus } = computeFeedbackStatus(store, today)
      let finalStatus = baseStatus

      // If status is 'never' but has a last_call (meeting), promote to overdue
      if (finalStatus === 'never') {
        const hasLastCall = store.last_feedback_date ||
          (store.client_id && lastMeetingByClientSummary.has(store.client_id))
        if (hasLastCall) {
          finalStatus = 'overdue'
        }
      }

      summary[finalStatus]++
    }

    // ==============================
    // Search: client_id lookup (PostgREST limitation workaround)
    // ==============================
    let matchingClientIds: string[] = []
    if (search) {
      const { data: matchingClients } = await supabase
        .from("clients")
        .select("id")
        .eq("org_id", orgId)
        .or(`name.ilike.%${search}%,company.ilike.%${search}%`)

      matchingClientIds = (matchingClients || []).map(c => c.id)
    }

    // ==============================
    // Main query
    // ==============================
    let query = supabase
      .from('client_stores')
      .select(`
        id,
        client_id,
        org_id,
        store_name,
        store_url,
        platform,
        is_active,
        shopify_access_token,
        klaviyo_private_key,
        feedback_frequency,
        last_feedback_date,
        next_feedback_date,
        last_feedback_by,
        feedback_notes,
        clients (
          id,
          name,
          company,
          status
        ),
        profiles:last_feedback_by (
          name
        )
      `, statusFilter ? undefined : { count: "exact" })
      .eq('org_id', orgId)
      .order('store_name')

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    // Link filter
    if (linkFilter === "avulsas") {
      query = query.is("client_id", null)
    } else if (linkFilter === "vinculadas") {
      query = query.not("client_id", "is", null)
    }

    // Search filter
    if (search) {
      if (matchingClientIds.length > 0) {
        query = query.or(
          `store_name.ilike.%${search}%,client_id.in.(${matchingClientIds.join(",")})`
        )
      } else {
        query = query.ilike("store_name", `%${search}%`)
      }
    }

    // ==============================
    // Dual flow: with/without statusFilter
    // ==============================

    // Fetch last completed meeting per client (shared by both flows)
    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('client_id, scheduled_at')
      .eq('status', 'completed')
      .order('scheduled_at', { ascending: false })

    const lastMeetingByClient = new Map<string, string>()
    if (meetingsData) {
      for (const m of meetingsData) {
        if (!lastMeetingByClient.has(m.client_id)) {
          lastMeetingByClient.set(m.client_id, m.scheduled_at)
        }
      }
    }

    // Helper: enrich a single store row into StoreWithResults
    const enrichStore = (
      store: StoreRow,
      revenueMap: Map<string, KlaviyoStoreRevenue>,
      shopifyRevenueMap: Map<string, number>,
    ): StoreWithResults => {
      const clientData = store.clients
      const profileData = store.profiles
      const client = clientData || { id: '', name: null, company: '', status: '' }

      // Calculate feedback status
      const { status: baseStatus, daysUntil } = computeFeedbackStatus(store, today)
      let feedbackStatus = baseStatus
      const daysUntilFeedback = daysUntil

      // Revenue
      const hasShopify = !!store.shopify_access_token
      const hasKlaviyo = !!store.klaviyo_private_key
      const klaviyoData = revenueMap.get(store.id)
      const shopifyRevenue = shopifyRevenueMap.get(store.id) ?? 0

      let revenueStatus: 'loaded' | 'no_integration' | 'error' = 'no_integration'
      let totalRevenue = 0
      let klaviyoRevenue = 0
      let campaignRevenue = 0
      let flowRevenue = 0
      let recoveryRate: number | null = null

      if (hasShopify && shopifyRevenue > 0) {
        totalRevenue = shopifyRevenue
      }

      if (hasKlaviyo && klaviyoData) {
        if (klaviyoData.totalRevenue === -1) {
          revenueStatus = 'error'
        } else {
          revenueStatus = 'loaded'
          klaviyoRevenue = klaviyoData.totalRevenue
          campaignRevenue = klaviyoData.campaignRevenue
          flowRevenue = klaviyoData.flowRevenue
        }
      } else if (hasShopify && shopifyRevenue >= 0) {
        revenueStatus = shopifyRevenue === -1 ? 'error' : 'loaded'
      }

      if (totalRevenue > 0 && klaviyoRevenue > 0) {
        recoveryRate = (klaviyoRevenue / totalRevenue) * 100
      }

      // Determine last call date (max of feedback and meeting)
      const feedbackDate = store.last_feedback_date ? new Date(store.last_feedback_date) : null
      const meetingDate = store.client_id && lastMeetingByClient.has(store.client_id)
        ? new Date(lastMeetingByClient.get(store.client_id)!)
        : null

      let lastCallDate: string | null = null
      let lastCallSource: 'feedback' | 'meeting' | null = null

      if (feedbackDate && meetingDate) {
        if (feedbackDate >= meetingDate) {
          lastCallDate = store.last_feedback_date
          lastCallSource = 'feedback'
        } else {
          lastCallDate = store.client_id ? lastMeetingByClient.get(store.client_id)! : null
          lastCallSource = 'meeting'
        }
      } else if (feedbackDate) {
        lastCallDate = store.last_feedback_date
        lastCallSource = 'feedback'
      } else if (meetingDate) {
        lastCallDate = store.client_id ? lastMeetingByClient.get(store.client_id)! : null
        lastCallSource = 'meeting'
      }

      // Promote 'never' to 'overdue' if there was any contact
      if (!store.next_feedback_date && lastCallDate && feedbackStatus === 'never') {
        feedbackStatus = 'overdue'
      }

      return {
        id: store.id,
        client_id: store.client_id,
        org_id: store.org_id,
        client_name: client.name,
        client_company: client.company || '',
        store_name: store.store_name,
        store_url: store.store_url,
        platform: store.platform,
        is_active: store.is_active,
        total_revenue_30d: totalRevenue,
        klaviyo_revenue_30d: klaviyoRevenue,
        campaign_revenue_30d: campaignRevenue,
        flow_revenue_30d: flowRevenue,
        recovery_rate: recoveryRate,
        revenue_status: revenueStatus,
        feedback_frequency: (store.feedback_frequency as 'monthly' | '30_days') || 'monthly',
        last_feedback_date: store.last_feedback_date,
        next_feedback_date: store.next_feedback_date,
        last_feedback_by: store.last_feedback_by,
        last_feedback_by_name: profileData?.name || null,
        feedback_status: feedbackStatus,
        days_until_feedback: daysUntilFeedback,
        last_call_date: lastCallDate,
        last_call_source: lastCallSource,
        has_shopify: hasShopify,
        has_klaviyo: hasKlaviyo,
      }
    }

    // Helper: fetch revenue for a set of stores (only page stores)
    const fetchRevenue = async (storesToFetch: StoreRow[]) => {
      const revenueMap = new Map<string, KlaviyoStoreRevenue>()
      const shopifyRevenueMap = new Map<string, number>()
      const CHUNK_SIZE = 5

      // Klaviyo revenue
      const klaviyoStores = storesToFetch.filter((s) => !!s.klaviyo_private_key)
      log.info(`Klaviyo revenue: ${klaviyoStores.length}/${storesToFetch.length} stores have klaviyo_private_key`)

      for (let i = 0; i < klaviyoStores.length; i += CHUNK_SIZE) {
        const chunk = klaviyoStores.slice(i, i + CHUNK_SIZE)
        const chunkResults = await Promise.all(
          chunk.map(async (store) => {
            // Check per-store cache
            if (!skipCache) {
              const cached = revenueCache.get(store.id)
              if (cached && (Date.now() - cached.timestamp) < CACHE_TTL && cached.klaviyo) {
                return {
                  storeId: store.id,
                  totalRevenue: cached.klaviyo.totalRevenue,
                  campaignRevenue: cached.klaviyo.campaignRevenue,
                  flowRevenue: cached.klaviyo.flowRevenue,
                }
              }
            }

            try {
              const revenue = await getKlaviyoRevenueForStore(store.id, '30d')
              // Cache per-store
              const existing = revenueCache.get(store.id) || { klaviyo: null, shopify: null, timestamp: 0 }
              revenueCache.set(store.id, {
                ...existing,
                klaviyo: { totalRevenue: revenue.totalRevenue, campaignRevenue: revenue.campaignRevenue, flowRevenue: revenue.flowRevenue },
                timestamp: Date.now(),
              })
              return {
                storeId: store.id,
                totalRevenue: revenue.totalRevenue,
                campaignRevenue: revenue.campaignRevenue,
                flowRevenue: revenue.flowRevenue,
              }
            } catch (err) {
              log.warn(`Failed to fetch Klaviyo revenue for store ${store.id}:`, err)
              return { storeId: store.id, totalRevenue: -1, campaignRevenue: 0, flowRevenue: 0 }
            }
          })
        )
        for (const result of chunkResults) {
          revenueMap.set(result.storeId, result)
        }
      }

      // Shopify revenue
      const shopifyStores = storesToFetch.filter((s) => !!s.shopify_access_token)
      for (let i = 0; i < shopifyStores.length; i += CHUNK_SIZE) {
        const chunk = shopifyStores.slice(i, i + CHUNK_SIZE)
        const chunkResults = await Promise.all(
          chunk.map(async (store) => {
            // Check per-store cache
            if (!skipCache) {
              const cached = revenueCache.get(store.id)
              if (cached && (Date.now() - cached.timestamp) < CACHE_TTL && cached.shopify !== null) {
                return { storeId: store.id, totalRevenue: cached.shopify }
              }
            }

            try {
              const report = await getShopifyReportForStore(store.id, '30d')
              const totalRevenue = report.summary?.totalRevenue ?? 0
              // Cache per-store
              const existing = revenueCache.get(store.id) || { klaviyo: null, shopify: null, timestamp: 0 }
              revenueCache.set(store.id, { ...existing, shopify: totalRevenue, timestamp: Date.now() })
              return { storeId: store.id, totalRevenue }
            } catch (err) {
              log.warn(`Failed to fetch Shopify revenue for store ${store.id}:`, err)
              return { storeId: store.id, totalRevenue: -1 }
            }
          })
        )
        for (const result of chunkResults) {
          shopifyRevenueMap.set(result.storeId, result.totalRevenue)
        }
      }

      return { revenueMap, shopifyRevenueMap }
    }

    if (statusFilter) {
      // ==============================
      // Flow WITH statusFilter: fetch all, filter + paginate in memory
      // ==============================
      const { data: allFilteredStores, error } = await query

      if (error) {
        log.error('Error fetching stores:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }

      // Compute feedback_status for each store (lightweight, no revenue)
      const storeRows = (allFilteredStores || []) as unknown as StoreRow[]
      const withStatus = storeRows.map(store => {
        const { status: baseStatus, daysUntil } = computeFeedbackStatus(store, today)
        let finalStatus = baseStatus

        // Check meeting promotion
        const feedbackDate = store.last_feedback_date ? new Date(store.last_feedback_date) : null
        const meetingDate = store.client_id && lastMeetingByClient.has(store.client_id)
          ? new Date(lastMeetingByClient.get(store.client_id)!)
          : null
        const hasLastCall = feedbackDate || meetingDate

        if (!store.next_feedback_date && hasLastCall && finalStatus === 'never') {
          finalStatus = 'overdue'
        }

        return { store, feedbackStatus: finalStatus, daysUntilFeedback: daysUntil }
      })

      // Filter by status
      const statusFiltered = withStatus.filter(s => s.feedbackStatus === statusFilter)

      // Sort by priority
      statusFiltered.sort((a, b) => {
        const diff = STATUS_PRIORITY[a.feedbackStatus] - STATUS_PRIORITY[b.feedbackStatus]
        if (diff !== 0) return diff
        if (a.daysUntilFeedback !== null && b.daysUntilFeedback !== null) {
          return a.daysUntilFeedback - b.daysUntilFeedback
        }
        return 0
      })

      // Manual pagination
      const total = statusFiltered.length
      const from = (page - 1) * perPage
      const pagedItems = isPaginated ? statusFiltered.slice(from, from + perPage) : statusFiltered
      const pagedStoreRows = pagedItems.map(item => item.store)

      // Revenue fetch only for paged stores
      const { revenueMap, shopifyRevenueMap } = await fetchRevenue(pagedStoreRows)

      // Enrich
      const enrichedStores = pagedItems.map(item => {
        const enriched = enrichStore(item.store, revenueMap, shopifyRevenueMap)
        // Override status with pre-computed value to ensure consistency
        enriched.feedback_status = item.feedbackStatus
        enriched.days_until_feedback = item.daysUntilFeedback
        return enriched
      })

      return NextResponse.json({
        success: true,
        stores: enrichedStores,
        summary,
        link_counts: linkCounts,
        ...(isPaginated && {
          pagination: {
            page,
            per_page: perPage,
            total,
            total_pages: Math.ceil(total / perPage),
          },
        }),
      })
    } else {
      // ==============================
      // Flow WITHOUT statusFilter: use Supabase .range()
      // ==============================
      if (isPaginated) {
        const from = (page - 1) * perPage
        const to = from + perPage - 1
        query = query.range(from, to)
      }

      const { data: stores, count, error, status: httpStatus } = await query

      // Handle 416 (range exceeds total)
      if (error?.code === 'PGRST103' || httpStatus === 416) {
        return NextResponse.json({
          success: true,
          stores: [],
          summary,
          link_counts: linkCounts,
          ...(isPaginated && {
            pagination: { page, per_page: perPage, total: count || 0, total_pages: Math.ceil((count || 0) / perPage) },
          }),
        })
      }

      if (error) {
        log.error('Error fetching stores:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }

      // Revenue fetch only for page stores
      const storeRows = (stores || []) as unknown as StoreRow[]
      const { revenueMap, shopifyRevenueMap } = await fetchRevenue(storeRows)

      // Enrich + sort
      const enrichedStores = storeRows.map(store =>
        enrichStore(store, revenueMap, shopifyRevenueMap)
      )

      // Sort by status priority (in-memory, within the page)
      enrichedStores.sort((a, b) => {
        const priorityDiff = STATUS_PRIORITY[a.feedback_status] - STATUS_PRIORITY[b.feedback_status]
        if (priorityDiff !== 0) return priorityDiff
        if (a.days_until_feedback !== null && b.days_until_feedback !== null) {
          return a.days_until_feedback - b.days_until_feedback
        }
        return 0
      })

      return NextResponse.json({
        success: true,
        stores: enrichedStores,
        summary,
        link_counts: linkCounts,
        ...(isPaginated && {
          pagination: {
            page,
            per_page: perPage,
            total: count || 0,
            total_pages: Math.ceil((count || 0) / perPage),
          },
        }),
      })
    }
  } catch (error) {
    log.error('Error in stores control API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
