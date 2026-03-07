import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalCampaigns")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List campaigns for the client's stores (portal view)
// Unified: campaigns (Klaviyo sync + manual) + campaign_batches
// IMPORTANT: Does NOT return instructions_doc_url, notes, or preview_text (internal fields)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const user = await requireAuth(supabase)

    // Get portal user to find their client_id
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const clientId = portalUser.client_id

    // Get all stores for this client
    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id, store_name")
      .eq("client_id", clientId)
      .eq("is_active", true)

    if (!clientStores || clientStores.length === 0) {
      return successResponse(request, {
        campaigns: [],
        totalCount: 0,
      })
    }

    const clientStoreIds = clientStores.map(s => s.id)
    const storeNameMap = Object.fromEntries(clientStores.map(s => [s.id, s.store_name]))
    const storeCurrencyMap = Object.fromEntries(clientStores.map(s => [s.id, "BRL"]))

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const status = searchParams.get("status")
    const storeId = searchParams.get("store_id")
    const channel = searchParams.get("channel")

    // Determine which stores to filter by — validate storeId belongs to client
    let filterStoreIds = clientStoreIds
    if (storeId) {
      if (clientStoreIds.includes(storeId)) {
        filterStoreIds = [storeId]
      } else {
        // Invalid store_id for this client — return empty instead of falling back
        return successResponse(request, { campaigns: [], totalCount: 0 })
      }
    }

    // ============================================
    // 1. Fetch from campaigns table (Klaviyo + manual)
    // ============================================
    let campaignsQuery = adminClient
      .from("campaigns")
      .select(`
        id,
        name,
        description,
        scheduled_date,
        scheduled_time,
        send_datetime,
        channel,
        campaign_type,
        status,
        subject_line,
        segment_name,
        estimated_recipients,
        recipients,
        delivered,
        opened,
        clicked,
        converted,
        revenue,
        klaviyo_campaign_id,
        color,
        store_id,
        created_at
      `)
      .in("store_id", filterStoreIds)
      .order("scheduled_date", { ascending: true })

    if (startDate) campaignsQuery = campaignsQuery.gte("scheduled_date", startDate)
    if (endDate) campaignsQuery = campaignsQuery.lte("scheduled_date", endDate)
    if (status) campaignsQuery = campaignsQuery.eq("status", status)
    if (channel) campaignsQuery = campaignsQuery.eq("channel", channel)

    const { data: campaigns, error: campaignsError } = await campaignsQuery

    if (campaignsError) {
      log.error("[Portal Campaigns] Error fetching campaigns:", campaignsError)
      throw new AppError("Erro ao buscar campanhas", 500)
    }

    // Transform campaigns to portal format
    const portalCampaigns = (campaigns || []).map(c => {
      const storeId = c.store_id
      const hasValidDate = c.scheduled_date != null

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        campaign_type: c.channel || "email",
        scheduled_at: c.send_datetime || (hasValidDate ? `${c.scheduled_date}T${c.scheduled_time || "00:00"}:00` : c.created_at),
        scheduled_date: c.scheduled_date,
        scheduled_time: c.scheduled_time,
        status: c.status,
        subject_line: c.subject_line,
        segment_name: c.segment_name,
        estimated_recipients: c.estimated_recipients,
        recipients: c.recipients,
        delivered: c.delivered,
        opened: c.opened,
        clicked: c.clicked,
        converted: c.converted,
        revenue: c.revenue,
        currency: storeId ? (storeCurrencyMap[storeId] || "BRL") : "BRL",
        color: c.color || "#3b82f6",
        created_at: c.created_at,
        store_ids: storeId ? [storeId] : [],
        store_names: storeId ? [storeNameMap[storeId] || "Loja"] : [],
        stores_count: storeId ? 1 : 0,
        source: c.klaviyo_campaign_id ? "klaviyo" : "manual",
      }
    })

    // ============================================
    // 2. Fetch from campaign_batches table — scoped to client stores
    // ============================================
    let batchesQuery = adminClient
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
      .overlaps("store_ids", filterStoreIds)
      .order("scheduled_at", { ascending: true })

    if (startDate) batchesQuery = batchesQuery.gte("scheduled_at", startDate)
    if (endDate) batchesQuery = batchesQuery.lte("scheduled_at", endDate + "T23:59:59.999Z")
    if (status) {
      const batchStatusMap: Record<string, string> = {
        sent: "completed",
        scheduled: "scheduled",
        cancelled: "cancelled",
        draft: "scheduled",
      }
      batchesQuery = batchesQuery.eq("status", batchStatusMap[status] || status)
    }
    if (channel) {
      if (channel === "sms") {
        batchesQuery = batchesQuery.in("campaign_type", ["sms", "whatsapp"])
      } else {
        batchesQuery = batchesQuery.eq("campaign_type", channel)
      }
    }

    const { data: allBatches, error: batchesError } = await batchesQuery

    if (batchesError) {
      log.error("[Portal Campaigns] Error fetching batches:", batchesError)
      // Continue with campaigns only
    }

    // Map batch status to campaign status
    const batchStatusMap: Record<string, string> = {
      scheduled: "scheduled",
      processing: "scheduled",
      completed: "sent",
      failed: "cancelled",
      cancelled: "cancelled",
    }

    // Transform batches to portal format — only show client's stores
    const portalBatches = (allBatches || []).map(batch => {
      const batchStoreIds: string[] = (batch.store_ids || []).filter(Boolean)
      const relevantStoreIds = batchStoreIds.filter((id: string) => clientStoreIds.includes(id))
      const relevantStoreNames = relevantStoreIds.map((id: string) => storeNameMap[id] || "Loja")

      const scheduledAt = new Date(batch.scheduled_at)
      const isValidDate = !isNaN(scheduledAt.getTime())

      return {
        id: batch.id,
        name: batch.name,
        description: null,
        campaign_type: batch.campaign_type,
        scheduled_at: batch.scheduled_at,
        scheduled_date: isValidDate ? scheduledAt.toISOString().split("T")[0] : null,
        scheduled_time: isValidDate ? scheduledAt.toISOString().split("T")[1]?.substring(0, 5) : null,
        status: batchStatusMap[batch.status] || batch.status,
        subject_line: null,
        segment_name: null,
        estimated_recipients: null,
        recipients: null,
        delivered: null,
        opened: null,
        clicked: null,
        converted: null,
        revenue: null,
        currency: relevantStoreIds[0] ? (storeCurrencyMap[relevantStoreIds[0]] || "BRL") : "BRL",
        color: batch.campaign_type === "sms" ? "#10b981" : batch.campaign_type === "whatsapp" ? "#25d366" : "#3b82f6",
        created_at: batch.created_at,
        store_ids: relevantStoreIds,
        store_names: relevantStoreNames,
        stores_count: relevantStoreIds.length,
        source: "batch",
      }
    })

    // ============================================
    // 3. Merge and sort by full datetime for precision
    // ============================================
    const allCampaigns = [...portalCampaigns, ...portalBatches]
      .sort((a, b) => {
        const dateA = a.scheduled_at || ""
        const dateB = b.scheduled_at || ""
        return dateA.localeCompare(dateB)
      })

    log.debug(`[Portal Campaigns] Returning ${allCampaigns.length} campaigns (${portalCampaigns.length} individual + ${portalBatches.length} batches)`)

    return successResponse(request, {
      campaigns: allCampaigns,
      totalCount: allCampaigns.length,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalCampaigns")
  }
}
