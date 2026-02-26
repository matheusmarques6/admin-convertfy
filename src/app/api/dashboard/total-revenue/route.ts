import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse, AppError } from "@/lib/api/errors"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { logger } from "@/lib/logger"

const log = logger.child("TotalRevenue")

// Cache: keyed by period, TTL 10 minutes
const revenueCache = new Map<string, {
  data: TotalRevenueResponse
  timestamp: number
}>()
const CACHE_TTL = 10 * 60 * 1000

interface StoreRevenue {
  storeId: string
  storeName: string
  clientName: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
}

interface TotalRevenueResponse {
  period: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storesCount: number
  storesWithRevenue: number
  topStores: StoreRevenue[]
  bottomStores: StoreRevenue[]
  cachedAt: string
}

async function resolveOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado", 403)
  }
  return orgMember.org_id
}

interface StoreInput {
  id: string
  store_name: string
  client_id: string
}

async function processChunk(
  stores: StoreInput[],
  period: string,
  clientNameMap: Map<string, string>,
  customStartDate?: string | null,
  customEndDate?: string | null,
): Promise<StoreRevenue[]> {
  return Promise.all(
    stores.map(async (store) => {
      const clientName = clientNameMap.get(store.client_id) || "Cliente"
      try {
        const revenue = await getKlaviyoRevenueForStore(store.id, period, customStartDate, customEndDate)
        return {
          storeId: store.id,
          storeName: store.store_name || "Loja sem nome",
          clientName,
          totalRevenue: revenue.totalRevenue,
          campaignRevenue: revenue.campaignRevenue,
          flowRevenue: revenue.flowRevenue,
        }
      } catch (err) {
        log.warn(`Failed to fetch revenue for store ${store.id}:`, err)
        return {
          storeId: store.id,
          storeName: store.store_name || "Loja sem nome",
          clientName,
          totalRevenue: 0,
          campaignRevenue: 0,
          flowRevenue: 0,
        }
      }
    })
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const period = request.nextUrl.searchParams.get("period") || "30d"
    const customStartDate = request.nextUrl.searchParams.get("start_date")
    const customEndDate = request.nextUrl.searchParams.get("end_date")
    const storeIdsParam = request.nextUrl.searchParams.get("store_ids")
    const filterStoreIds = storeIdsParam ? storeIdsParam.split(",").filter(Boolean) : null

    // Cache key includes user ID + store_ids to prevent cross-tenant/cross-filter data leakage
    const storeIdsSuffix = filterStoreIds ? `:s=${filterStoreIds.sort().join(",")}` : ""
    const cacheKey = `${user.id}:${period}${customStartDate ? `:${customStartDate}:${customEndDate}` : ""}${storeIdsSuffix}`
    const cached = revenueCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return successResponse(request, cached.data)
    }

    // Resolve org for tenant isolation
    const orgId = await resolveOrgId(supabase, user.id)

    // Fetch clients in user's org, then their stores with Klaviyo keys
    const admin = createAdminClient()
    const { data: orgClients } = await admin
      .from("clients")
      .select("id, name")
      .eq("org_id", orgId)

    const clientIds = orgClients?.map((c) => c.id) || []

    if (clientIds.length === 0) {
      const emptyResult: TotalRevenueResponse = {
        period,
        totalRevenue: 0,
        campaignRevenue: 0,
        flowRevenue: 0,
        storesCount: 0,
        storesWithRevenue: 0,
        topStores: [],
        bottomStores: [],
        cachedAt: new Date().toISOString(),
      }
      return successResponse(request, emptyResult)
    }

    const clientNameMap = new Map(orgClients!.map((c) => [c.id, c.name]))

    const { data: stores, error: storesError } = await admin
      .from("client_stores")
      .select("id, store_name, client_id")
      .or("klaviyo_private_key.not.is.null,klaviyo_api_key.not.is.null")
      .eq("is_active", true)
      .in("client_id", clientIds)

    if (storesError) {
      log.error("Error fetching stores:", storesError)
      throw storesError
    }

    // Filtrar por store_ids se fornecido (dashboard operacional do agente)
    let filteredStores = stores || []
    if (filterStoreIds && filterStoreIds.length > 0) {
      filteredStores = filteredStores.filter(s => filterStoreIds.includes(s.id))
    }

    if (filteredStores.length === 0) {
      const emptyResult: TotalRevenueResponse = {
        period,
        totalRevenue: 0,
        campaignRevenue: 0,
        flowRevenue: 0,
        storesCount: 0,
        storesWithRevenue: 0,
        topStores: [],
        bottomStores: [],
        cachedAt: new Date().toISOString(),
      }
      return successResponse(request, emptyResult)
    }

    // Process stores in chunks of 2 to avoid Klaviyo rate limiting
    // Each store makes 2-4 API calls (account info + metric search + 2 reports)
    const CHUNK_SIZE = 2
    const allResults: StoreRevenue[] = []
    for (let i = 0; i < filteredStores.length; i += CHUNK_SIZE) {
      const chunk = filteredStores.slice(i, i + CHUNK_SIZE)
      const chunkResults = await processChunk(chunk as StoreInput[], period, clientNameMap, customStartDate, customEndDate)
      allResults.push(...chunkResults)
    }

    // Aggregate
    const totalRevenue = allResults.reduce((sum, s) => sum + s.totalRevenue, 0)
    const campaignRevenue = allResults.reduce((sum, s) => sum + s.campaignRevenue, 0)
    const flowRevenue = allResults.reduce((sum, s) => sum + s.flowRevenue, 0)
    const storesWithRevenue = allResults.filter((s) => s.totalRevenue > 0).length

    // Sort by revenue descending
    const sortedByRevenue = allResults
      .filter((s) => s.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)

    // Top 5 stores by revenue
    const topStores = sortedByRevenue.slice(0, 5)

    // Bottom 5 stores by revenue (lowest first)
    const bottomStores = sortedByRevenue.length > 5
      ? [...sortedByRevenue].reverse().slice(0, 5)
      : []

    const result: TotalRevenueResponse = {
      period,
      totalRevenue,
      campaignRevenue,
      flowRevenue,
      storesCount: filteredStores.length,
      storesWithRevenue,
      topStores,
      bottomStores,
      cachedAt: new Date().toISOString(),
    }

    // Cache result
    revenueCache.set(cacheKey, { data: result, timestamp: Date.now() })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "TotalRevenue GET")
  }
}
