import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { parseDateRangeInTimezone } from "@/lib/integrations/klaviyo"
import type { DataStatus } from "@/lib/shared/data-status"

// Decomposed services (Story 54.6)
import { fetchKlaviyoFromCache, mapCacheToPortalKlaviyo, fetchPeriodComparison } from "@/lib/services/portal-klaviyo-cache.service"
import type { PeriodComparison } from "@/lib/services/portal-klaviyo-cache.service"
import { fetchShopifyData, mapShopifyData } from "@/lib/services/portal-shopify-cache.service"
import { aggregateKlaviyoData, aggregateShopifyData } from "@/lib/services/portal-aggregation.service"

const log = logger.child("PortalDashboard")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// ─── resolvePortalMeetings: map meetings + participants with resolved names ──

interface RawParticipant {
  id: string
  participant_id: string
  participant_type: string
  is_organizer: boolean
  response_status: string
  email?: string
}

interface RawMeeting {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  meeting_url?: string
  meeting_url_source?: string
  status: string
  completion_notes?: string
  completed_at?: string
  meeting_participants?: RawParticipant[]
}

async function resolvePortalMeetings(
  meetings: RawMeeting[],
  adminClient: SupabaseClient,
  portalUserEmail?: string,
) {
  // Collect all unique participant_ids grouped by type
  const orgMemberIds = new Set<string>()
  const profileIds = new Set<string>()

  for (const m of meetings) {
    for (const p of m.meeting_participants || []) {
      if (p.participant_type === "org_member") {
        orgMemberIds.add(p.participant_id)
      } else if (p.participant_type === "profile") {
        profileIds.add(p.participant_id)
      }
    }
  }

  // Resolve names in parallel
  const nameMap = new Map<string, string>()

  const resolvePromises: Promise<void>[] = []

  if (orgMemberIds.size > 0) {
    resolvePromises.push(
      (async () => {
        const { data } = await adminClient
          .from("org_members")
          .select("id, user_id, profiles:user_id ( full_name, email )")
          .in("id", Array.from(orgMemberIds))
        for (const om of data || []) {
          const profile = om.profiles as unknown as { full_name?: string; email?: string } | null
          if (profile?.full_name) {
            nameMap.set(om.id, profile.full_name)
          } else if (profile?.email) {
            nameMap.set(om.id, profile.email)
          }
        }
      })(),
    )
  }

  if (profileIds.size > 0) {
    resolvePromises.push(
      (async () => {
        const { data } = await adminClient
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(profileIds))
        for (const p of data || []) {
          if (p.full_name) {
            nameMap.set(p.id, p.full_name)
          } else if (p.email) {
            nameMap.set(p.id, p.email)
          }
        }
      })(),
    )
  }

  await Promise.all(resolvePromises)

  return meetings.map((m) => {
    const participants = m.meeting_participants || []

    // Find portal user's own response_status by email match
    let responseStatus: string | undefined
    if (portalUserEmail) {
      const normalizedEmail = portalUserEmail.toLowerCase()
      const myParticipant = participants.find(
        (p) => p.email?.toLowerCase() === normalizedEmail
      )
      responseStatus = myParticipant?.response_status || "pending"
    }

    return {
      id: m.id,
      title: m.title,
      scheduledAt: m.scheduled_at,
      duration: m.duration_minutes,
      meetingUrl: m.meeting_url,
      meetingUrlSource: m.meeting_url_source || undefined,
      status: m.status,
      completionNotes: m.completion_notes,
      completedAt: m.completed_at,
      responseStatus,
      participants: participants.map((p) => ({
        name: nameMap.get(p.participant_id) || p.email || "Participante",
        email: p.email,
        response_status: p.response_status || "pending",
        is_organizer: p.is_organizer || false,
      })),
    }
  })
}

// ─── GET - Portal dashboard (cache-first — no live API calls) ───────────────

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current user
    const user = await requireAuth(supabase)

    // Get portal user using admin client to bypass RLS
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("*, client:clients(*)")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Nao autorizado", 401)
    }

    const clientId = portalUser.client_id
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "30d"
    const storeId = searchParams.get("store_id")

    // Calculate date range using timezone-aware function
    const dashboardTimezone = "America/Sao_Paulo"
    const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, dashboardTimezone)

    // Fetch base data in parallel using admin client to bypass RLS
    const [
      clientData,
      rawStoresData,
      unifiedInvoicesData,
      meetingsData,
    ] = await Promise.all([
      adminClient
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single(),

      adminClient
        .from("client_stores")
        .select("id, store_name, platform, store_url, is_active, org_id, klaviyo_private_key, klaviyo_api_key, omnisend_api_key, shopify_access_token, shopify_store_domain")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("store_name"),

      adminClient
        .from("unified_invoices")
        .select("id, amount, due_date, status, description, source")
        .eq("client_id", clientId)
        .order("due_date", { ascending: false })
        .limit(200),

      adminClient
        .from("meetings")
        .select(`
          *,
          meeting_participants (
            id, participant_id, participant_type,
            is_organizer, response_status, email
          )
        `)
        .eq("client_id", clientId)
        .in("status", ["scheduled", "completed"])
        .order("scheduled_at", { ascending: false })
        .limit(10),
    ])

    const client = clientData.data
    const stores = rawStoresData.data || []
    const allInvoices = unifiedInvoicesData.data || []
    const meetings = meetingsData.data || []

    // Upcoming campaigns: fetch by store_ids (client_id can be null for Klaviyo-synced campaigns)
    const clientStoreIds = stores.map(s => s.id)
    const { data: upcomingCampaignsRaw } = clientStoreIds.length > 0
      ? await adminClient
          .from("campaigns")
          .select("id, name, channel, status, scheduled_date")
          .in("store_id", clientStoreIds)
          .in("status", ["scheduled", "draft", "approved", "pending_review"])
          .gte("scheduled_date", new Date().toISOString().split("T")[0])
          .order("scheduled_date")
          .limit(10)
      : { data: null }
    const upcomingCampaigns = upcomingCampaignsRaw || []

    // Calculate unified invoice stats (VIEW already merges invoices + client_charges)
    const pendingInvoices = allInvoices.filter((i) => i.status === "pending")
    const overdueInvoices = allInvoices.filter((i) => i.status === "overdue")
    const paidInvoices = allInvoices.filter((i) => i.status === "paid")

    const totalPending = pendingInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)
    const totalOverdue = overdueInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)
    const totalPaid = paidInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)

    // Prepare the base response
    const response: Record<string, unknown> = {
      success: true,
      period,
      dateRange: { start: startDateStr, end: endDateStr },

      client: {
        id: client?.id,
        name: client?.name,
        company: client?.company,
        status: client?.status,
        healthScore: client?.health_score,
      },

      stores: stores.map((s) => ({
        id: s.id,
        name: s.store_name,
        platform: s.platform,
        url: s.store_url,
        isActive: s.is_active,
      })),

      invoices: {
        pending: pendingInvoices.length,
        overdue: overdueInvoices.length,
        totalPending,
        totalOverdue,
        totalPaid,
        recent: allInvoices.slice(0, 10).map((i) => ({
          id: i.id,
          amount: i.amount,
          dueDate: i.due_date,
          status: i.status,
          description: i.description,
        })),
      },

      upcomingCampaigns: upcomingCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        scheduledDate: c.scheduled_date,
      })),

      meetings: await resolvePortalMeetings(meetings, adminClient, portalUser.email),

      lastUpdated: new Date().toISOString(),
    }

    // ─── Fetch Klaviyo + Shopify for selected stores ──────────────────────────

    const storesWithKlaviyo = stores.filter(s => s.klaviyo_private_key || s.klaviyo_api_key || s.omnisend_api_key)
    const hasKlaviyoStores = storesWithKlaviyo.length > 0

    if (storeId && storeId !== "all") {
      // ── Single store selected ──────────────────────────────────────────────
      const selectedStore = stores.find((s) => s.id === storeId)

      if (selectedStore) {
        response.selectedStore = {
          id: selectedStore.id,
          name: selectedStore.store_name,
          platform: selectedStore.platform,
        }

        // Shopify: cache-only read, background sync if miss (Story 54.5)
        const shopifyResult = await fetchShopifyData(selectedStore, period, adminClient)
        if (shopifyResult.data) {
          response.shopify = mapShopifyData(shopifyResult.data)
          response.shopifyStatus = "ready"
        } else if (shopifyResult.isSyncing) {
          response.shopify = null
          response.shopifyStatus = "syncing"
        }

        // Klaviyo: pure cache read — no live API calls
        const hasKlaviyo = !!(selectedStore.klaviyo_private_key || selectedStore.klaviyo_api_key || selectedStore.omnisend_api_key)
        log.info(`[Portal] Single store ${selectedStore.id}: hasKlaviyo=${hasKlaviyo}, period=${period}`)
        if (hasKlaviyo) {
          const storeOrgId = (selectedStore as Record<string, unknown>).org_id as string | undefined
          const cacheResult = await fetchKlaviyoFromCache(selectedStore.id, period, adminClient, storeOrgId)
          log.info(`[Portal] Cache result for store ${selectedStore.id}: hasData=${!!cacheResult.data}, isStale=${cacheResult.isStale}`)

          if (cacheResult.data) {
            response.klaviyo = mapCacheToPortalKlaviyo(cacheResult.data)
            response.dataStatus = (cacheResult.isStale ? "stale" : "ready") satisfies DataStatus
            response.lastFetchedAt = cacheResult.fetchedAt
            response.isRefreshing = false
            response.source = cacheResult.isStale ? "stale-cache" : "cache"

            // Fetch comparison data for "vs previous period"
            const comparison = await fetchPeriodComparison(selectedStore.id, period, adminClient, storeOrgId)
            if (comparison) {
              response.previousPeriod = comparison
            }
          } else {
            // Cache empty — cron will populate data
            response.dataStatus = "syncing" satisfies DataStatus
            response.isRefreshing = false
            response.source = "cache"
            response.lastFetchedAt = null
          }
        }
      }
    } else {
      // ── "All stores" selected — aggregate across all stores ────────────────
      const storesWithIntegrations = stores.filter(
        (s) => (s.klaviyo_private_key || s.klaviyo_api_key || s.omnisend_api_key) || (s.shopify_access_token && s.shopify_store_domain)
      )
      log.info(`[Portal] All stores mode: total=${stores.length}, withKlaviyo=${storesWithKlaviyo.length}, withIntegrations=${storesWithIntegrations.length}`)

      if (storesWithIntegrations.length > 0) {
        // Fetch Klaviyo cached data for all stores in parallel (DB reads, no rate limits)
        const klaviyoCachePromises = storesWithKlaviyo.map(store =>
          fetchKlaviyoFromCache(store.id, period, adminClient, (store as Record<string, unknown>).org_id as string | undefined).then(result => ({ store, result }))
        )

        // Fetch Shopify cache for all stores in parallel (background sync if miss — Story 54.5)
        const shopifyStores = stores.filter(s => s.shopify_access_token && s.shopify_store_domain)
        const shopifyPromises = shopifyStores.map(store =>
          fetchShopifyData(store, period, adminClient).then(result => ({ storeId: store.id, ...result }))
        )

        const [klaviyoCacheResults, shopifyResults] = await Promise.all([
          Promise.all(klaviyoCachePromises),
          Promise.all(shopifyPromises),
        ])

        // Separate stores with cache from stores without
        const withCache = klaviyoCacheResults.filter(r => r.result.data !== null)
        const withoutCache = klaviyoCacheResults.filter(r => r.result.data === null)
        log.info(`[Portal] Klaviyo cache results: withCache=${withCache.length}, withoutCache=${withoutCache.length}`)

        // Pure cache — no live fetch fallback
        const klaviyoDataList = withCache.map(r => mapCacheToPortalKlaviyo(r.result.data!))

        // Determine aggregate data status
        const hasStaleCache = withCache.some(r => r.result.isStale)
        const hasMissingStores = withoutCache.length > 0

        const aggregatedKlaviyo = aggregateKlaviyoData(klaviyoDataList)
        if (aggregatedKlaviyo) {
          response.klaviyo = aggregatedKlaviyo

          if (hasStaleCache || hasMissingStores) {
            response.dataStatus = "stale" satisfies DataStatus
            response.source = "stale-cache"
            response.isRefreshing = false
          } else {
            response.dataStatus = "ready" satisfies DataStatus
            response.source = "cache"
            response.isRefreshing = false
          }

          // Fetch comparison data for all stores and aggregate
          const comparisonPromises = storesWithKlaviyo.map(store =>
            fetchPeriodComparison(store.id, period, adminClient, (store as Record<string, unknown>).org_id as string | undefined)
          )
          const comparisonResults = await Promise.all(comparisonPromises)
          const validComparisons = comparisonResults.filter((c): c is PeriodComparison => c !== null)
          if (validComparisons.length > 0) {
            response.previousPeriod = {
              storeRevenue: validComparisons.reduce((s, c) => s + c.storeRevenue, 0),
              storeOrders: validComparisons.reduce((s, c) => s + c.storeOrders, 0),
              totalRevenue: validComparisons.reduce((s, c) => s + c.totalRevenue, 0),
              openRate: validComparisons.reduce((s, c) => s + c.openRate, 0) / validComparisons.length,
              clickRate: validComparisons.reduce((s, c) => s + c.clickRate, 0) / validComparisons.length,
            } satisfies PeriodComparison
          }
          // Use earliest fetchedAt from cache results
          response.lastFetchedAt = withCache.reduce<string | null>((oldest, r) => {
            if (!r.result.fetchedAt) return oldest
            if (!oldest) return r.result.fetchedAt
            return new Date(r.result.fetchedAt) < new Date(oldest) ? r.result.fetchedAt : oldest
          }, null)
        } else if (hasKlaviyoStores) {
          // Stores exist but all caches empty and no live results
          response.dataStatus = "error" satisfies DataStatus
          response.isRefreshing = false
          response.source = "cache"
          response.lastFetchedAt = null
          response.klaviyoError = "Dados indisponíveis. O relatório será atualizado em breve pelo sistema."
        }

        // Aggregate Shopify data
        const shopifyDataList = shopifyResults
          .filter(r => r.data !== null)
          .map(r => mapShopifyData(r.data!))

        const aggregatedShopify = aggregateShopifyData(shopifyDataList)
        if (aggregatedShopify) {
          response.shopify = aggregatedShopify
        }

        // Story 54.5: Set shopifyStatus for "all stores" mode
        const anyShopifySyncing = shopifyResults.some(r => r.isSyncing)
        if (shopifyDataList.length > 0) {
          response.shopifyStatus = anyShopifySyncing ? "partial" : "ready"
        } else if (anyShopifySyncing) {
          response.shopify = null
          response.shopifyStatus = "syncing"
        }

        response.selectedStore = {
          id: "all",
          name: "Todas as Lojas",
          platform: "aggregated",
        }
      }
    }

    // Structured observability logging
    log.info("[CacheStrategy]", {
      endpoint: "portal-dashboard",
      period,
      storesCount: stores.length,
      cacheHits: storeId && storeId !== "all"
        ? (response.source === "cache" || response.source === "stale-cache" ? 1 : 0)
        : (response.source === "cache" || response.source === "stale-cache" ? storesWithKlaviyo.length : 0),
      cacheMisses: storeId && storeId !== "all"
        ? (response.source === "live" || response.source === "loading" ? 1 : 0)
        : (response.source === "live" ? storesWithKlaviyo.length : 0),
      liveFetches: response.source === "live" ? 1 : 0,
      source: (response.source as string) || "unknown",
      elapsed: `${Date.now() - startTime}ms`,
    })

    // Log activity
    try {
      await adminClient.from("client_portal_activity").insert({
        portal_user_id: portalUser.id,
        client_id: clientId,
        action: "view_dashboard",
        metadata: { period, storeId },
      })
    } catch {
      // Ignore activity logging errors
    }

    return NextResponse.json(response, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "PortalDashboard")
  }
}
