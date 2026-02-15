import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalCampaigns")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List campaigns for the client's stores (portal view)
// IMPORTANT: Does NOT return instructions_doc_url or notes (internal fields)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Get portal user to find their client_id
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const clientId = portalUser.client_id

    // Get all stores for this client
    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id, store_name")
      .eq("client_id", clientId)
      .eq("is_active", true)

    if (!clientStores || clientStores.length === 0) {
      return NextResponse.json({
        campaigns: [],
        totalCount: 0,
      }, { headers: corsHeaders(request.headers.get("origin")) })
    }

    const clientStoreIds = clientStores.map(s => s.id)
    const storeNameMap = Object.fromEntries(clientStores.map(s => [s.id, s.store_name]))

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const status = searchParams.get("status")
    const storeId = searchParams.get("store_id")
    const channel = searchParams.get("channel")

    // Determine which stores to filter by
    let filterStoreIds = clientStoreIds
    if (storeId && clientStoreIds.includes(storeId)) {
      filterStoreIds = [storeId]
    }

    // Fetch campaigns that include any of the client's stores
    // Using a different approach: fetch all and filter in JS (more reliable than .overlaps())
    let query = adminClient
      .from("campaign_batches")
      .select(`
        id,
        name,
        campaign_type,
        scheduled_at,
        status,
        store_ids,
        created_at
      `)
      .order("scheduled_at", { ascending: true })

    // Apply date filters if provided
    if (startDate) {
      query = query.gte("scheduled_at", startDate)
    }
    if (endDate) {
      query = query.lte("scheduled_at", endDate)
    }
    if (status) {
      query = query.eq("status", status)
    }
    if (channel) {
      // Map "sms" channel to include "whatsapp" as well
      if (channel === "sms") {
        query = query.in("campaign_type", ["sms", "whatsapp"])
      } else {
        query = query.eq("campaign_type", channel)
      }
    }

    const { data: allCampaigns, error } = await query

    log.debug("[Portal Campaigns] Client ID:", clientId)
    log.debug("[Portal Campaigns] Client Store IDs:", clientStoreIds)
    log.debug("[Portal Campaigns] All campaigns found:", allCampaigns?.length || 0)

    if (error) {
      log.error("[Portal Campaigns] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar campanhas" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Filter campaigns that have at least one store belonging to this client
    const campaigns = allCampaigns?.filter(campaign => {
      const campaignStoreIds = campaign.store_ids || []
      const hasMatchingStore = campaignStoreIds.some((id: string) => filterStoreIds.includes(id))
      if (hasMatchingStore) {
        log.debug(`[Portal Campaigns] Campaign matches: ${campaign.name}`, { store_ids: campaign.store_ids })
      }
      return hasMatchingStore
    }) || []

    log.debug("[Portal Campaigns] Filtered campaigns:", campaigns.length)

    // Filter store_ids to only show client's stores and add store names
    // Also exclude internal fields (instructions_doc_url, notes)
    const filteredCampaigns = campaigns?.map(campaign => {
      // Filter to only show stores that belong to this client
      const storeIds = campaign.store_ids || []
      const relevantStoreIds = storeIds.filter((id: string) => clientStoreIds.includes(id))
      const relevantStoreNames = relevantStoreIds.map((id: string) => storeNameMap[id] || "Loja")

      return {
        id: campaign.id,
        name: campaign.name,
        campaign_type: campaign.campaign_type,
        scheduled_at: campaign.scheduled_at,
        status: campaign.status,
        created_at: campaign.created_at,
        // Only show client's stores
        store_ids: relevantStoreIds,
        store_names: relevantStoreNames,
        stores_count: relevantStoreIds.length,
      }
    }) || []

    return NextResponse.json({
      campaigns: filteredCampaigns,
      totalCount: filteredCampaigns.length,
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Portal Campaigns] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
