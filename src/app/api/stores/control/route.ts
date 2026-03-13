import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { paginationSchema } from "@/lib/schemas/common"
import { z } from "zod"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { withConcurrencyLimit } from "@/lib/integrations/klaviyo/rate-limiter"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { sanitizeSearch } from "@/lib/utils/sanitize-search"

const log = logger.child("StoresControl")

// Schema for this endpoint's query params
const storeControlQuerySchema = paginationSchema.extend({
  per_page: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional().default(""),
  status: z.enum(["on_track", "due_soon", "overdue", "never", ""]).optional().default(""),
})

interface KlaviyoStoreRevenue {
  storeId: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  currency: string
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
  currency: string
  has_shopify: boolean
  has_klaviyo: boolean
  fetched_at: string | null
  sync_status: string
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


export async function GET(request: Request) {
  const startTime = Date.now()
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
    const { page, per_page: perPage, search: rawSearch, status: statusFilter } = params

    // Sanitize search
    const search = rawSearch ? sanitizeSearch(rawSearch) : ""

    // Backward compatibility: without pagination params, return everything
    const isPaginated = searchParams.has("page") || searchParams.has("per_page")

    // Existing params
    const activeOnly = searchParams.get('active_only') !== 'false'
    // ==============================
    // Summary + Link Counts (global, lightweight query - no API calls)
    // ==============================
    const { data: allStoresForSummary } = await supabase
      .from("client_stores")
      .select("id, client_id, next_feedback_date, last_feedback_date")
      .eq("org_id", orgId)
      .eq("is_active", true)

    // Fetch last completed meeting per client ONCE (reused by summary + enrichment)
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const summary = { total: 0, overdue: 0, due_soon: 0, on_track: 0, never: 0 }

    for (const store of allStoresForSummary || []) {
      summary.total++

      // Compute status - consider meetings for never->overdue promotion
      const { status: baseStatus } = computeFeedbackStatus(store, today)
      let finalStatus = baseStatus

      // If status is 'never' but has a last_call (meeting), promote to overdue
      if (finalStatus === 'never') {
        const hasLastCall = store.last_feedback_date ||
          (store.client_id && lastMeetingByClient.has(store.client_id))
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

    // Helper: enrich a single store row into StoreWithResults
    const enrichStore = (
      store: StoreRow,
      revenueMap: Map<string, KlaviyoStoreRevenue>,
      shopifyRevenueMap: Map<string, number>,
      syncMetaMap: Map<string, { fetchedAt: string | null; syncStatus: string }>,
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

      const currency = klaviyoData?.currency || "BRL"

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
        currency,
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
        fetched_at: syncMetaMap.get(store.id)?.fetchedAt ?? null,
        sync_status: syncMetaMap.get(store.id)?.syncStatus ?? 'pending',
      }
    }

    // Helper: fetch revenue from store_revenue_summary (one DB query, zero API calls)
    const fetchRevenue = async (storesToFetch: StoreRow[]) => {
      const revenueMap = new Map<string, KlaviyoStoreRevenue>()
      const shopifyRevenueMap = new Map<string, number>()
      const syncMetaMap = new Map<string, { fetchedAt: string | null; syncStatus: string }>()

      const storeIds = storesToFetch.map(s => s.id)
      if (storeIds.length === 0) return { revenueMap, shopifyRevenueMap, syncMetaMap }

      const { data: revenueData, error: revError } = await supabase
        .from("store_revenue_summary")
        .select("store_id, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue, store_total_revenue, currency, sync_status, fetched_at")
        .eq("period_label", "30d")
        .eq("org_id", orgId)
        .in("store_id", storeIds)
        .gt("expires_at", new Date().toISOString())

      if (revError) {
        log.warn("Error fetching revenue summaries:", revError)
        return { revenueMap, shopifyRevenueMap, syncMetaMap }
      }

      for (const r of revenueData || []) {
        revenueMap.set(r.store_id, {
          storeId: r.store_id,
          totalRevenue: r.sync_status === "error" ? -1 : Number(r.klaviyo_total_revenue),
          campaignRevenue: Number(r.klaviyo_campaign_revenue),
          flowRevenue: Number(r.klaviyo_flow_revenue),
          currency: r.currency || "BRL",
        })
        const shopifyRev = Number(r.store_total_revenue)
        if (shopifyRev > 0) {
          shopifyRevenueMap.set(r.store_id, shopifyRev)
        }
        syncMetaMap.set(r.store_id, {
          fetchedAt: r.fetched_at as string | null,
          syncStatus: r.sync_status as string,
        })
      }

      // ── Live fallback for stores with Klaviyo but no cache hit ──
      const storesWithKlaviyoNoCacheHit = storesToFetch.filter(
        s => !!s.klaviyo_private_key && !revenueMap.has(s.id)
      )

      if (storesWithKlaviyoNoCacheHit.length > 0) {
        log.info(`[LiveFallback] ${storesWithKlaviyoNoCacheHit.length} stores with Klaviyo missing cache, fetching live`)
        const adminSupabase = createAdminClient()

        await withConcurrencyLimit(storesWithKlaviyoNoCacheHit, 3, async (store) => {
          try {
            const result = await getKlaviyoRevenueForStore(store.id, "30d")

            if (!result.success || !result.data) {
              log.warn(`[LiveFallback] Failed for ${store.store_name}: ${result.error}`)
              // Live fetch error upsert — campos limitados (nao inclui audience/store_total_revenue do cron)
              Promise.resolve(
                adminSupabase
                  .from("store_revenue_summary")
                  .upsert({
                    store_id: store.id,
                    org_id: store.org_id || orgId,
                    period_label: "30d",
                    klaviyo_total_revenue: 0,
                    klaviyo_campaign_revenue: 0,
                    klaviyo_flow_revenue: 0,
                    currency: "BRL",
                    sync_status: "error",
                    sync_source: "live",
                    sync_error: result.error || "Unknown error",
                    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                    fetched_at: new Date().toISOString(),
                  }, { onConflict: "store_id,period_label" })
              ).catch((e: unknown) => log.warn(`[LiveFallback] Error cache upsert failed for ${store.store_name}:`, e))

              syncMetaMap.set(store.id, {
                fetchedAt: new Date().toISOString(),
                syncStatus: "error",
              })
              return
            }

            const revenue = result.data

            // Convert to BRL for display
            const [totalBRL, campaignBRL, flowBRL] = await Promise.all([
              convertToBRL(revenue.totalRevenue, revenue.currency),
              convertToBRL(revenue.campaignRevenue, revenue.currency),
              convertToBRL(revenue.flowRevenue, revenue.currency),
            ])

            revenueMap.set(store.id, {
              storeId: store.id,
              totalRevenue: totalBRL,
              campaignRevenue: campaignBRL,
              flowRevenue: flowBRL,
              currency: "BRL", // Values already converted to BRL above
            })

            syncMetaMap.set(store.id, {
              fetchedAt: new Date().toISOString(),
              syncStatus: "ok",
            })

            // Live fetch upsert — campos limitados ao escopo do live fetch.
            // Campos exclusivos do cron (total_leads, engaged_leads, store_total_revenue)
            // NAO sao incluidos aqui para evitar sobrescrita.
            // Se no futuro o live fetch precisar desses campos, usar UPDATE condicional.
            Promise.resolve(
              adminSupabase
                .from("store_revenue_summary")
                .upsert({
                  store_id: store.id,
                  org_id: store.org_id || orgId,
                  period_label: "30d",
                  klaviyo_total_revenue: revenue.totalRevenue,
                  klaviyo_campaign_revenue: revenue.campaignRevenue,
                  klaviyo_flow_revenue: revenue.flowRevenue,
                  currency: revenue.currency,
                  sync_status: "ok",
                  sync_source: "live",
                  sync_error: null,
                  expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
                  fetched_at: new Date().toISOString(),
                  // NAO incluir: store_total_revenue, total_leads, engaged_leads
                  // Esses campos sao exclusivos do cron sync
                }, { onConflict: "store_id,period_label" })
            )
              .then(() => log.info(`[LiveFallback] Cached revenue for ${store.store_name} (${revenue.currency} ${revenue.totalRevenue})`))
              .catch((e: unknown) => log.warn(`[LiveFallback] Cache upsert failed for ${store.store_name}:`, e))

            log.info(`[LiveFallback] ${store.store_name}: ${revenue.currency} ${revenue.totalRevenue} → BRL ${totalBRL}`)
          } catch (err) {
            log.warn(`[LiveFallback] Error for store ${store.store_name}:`, err)
          }
        })
      }

      return { revenueMap, shopifyRevenueMap, syncMetaMap }
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
      const { revenueMap, shopifyRevenueMap, syncMetaMap } = await fetchRevenue(pagedStoreRows)

      // Enrich
      const enrichedStores = pagedItems.map(item => {
        const enriched = enrichStore(item.store, revenueMap, shopifyRevenueMap, syncMetaMap)
        // Override status with pre-computed value to ensure consistency
        enriched.feedback_status = item.feedbackStatus
        enriched.days_until_feedback = item.daysUntilFeedback
        return enriched
      })

      const elapsed = Date.now() - startTime
      log.info(`[StoresControl] stores=${enrichedStores.length} time=${elapsed}ms source=cache filter=status`)
      const response = NextResponse.json({
        success: true,
        stores: enrichedStores,
        summary,
        ...(isPaginated && {
          pagination: {
            page,
            per_page: perPage,
            total,
            total_pages: Math.ceil(total / perPage),
          },
        }),
      })
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
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
      const { revenueMap, shopifyRevenueMap, syncMetaMap } = await fetchRevenue(storeRows)

      // Enrich + sort
      const enrichedStores = storeRows.map(store =>
        enrichStore(store, revenueMap, shopifyRevenueMap, syncMetaMap)
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

      const elapsed = Date.now() - startTime
      log.info(`[StoresControl] stores=${enrichedStores.length} time=${elapsed}ms source=cache`)
      const response = NextResponse.json({
        success: true,
        stores: enrichedStores,
        summary,
        ...(isPaginated && {
          pagination: {
            page,
            per_page: perPage,
            total: count || 0,
            total_pages: Math.ceil((count || 0) / perPage),
          },
        }),
      })
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }
  } catch (error) {
    log.error('Error in stores control API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
