import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolvePortalClient } from "@/lib/api/portal-auth"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalCampaigns")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List campaigns for the client's stores (portal view)
// Unified: campaigns (Klaviyo sync + manual via RPC) + campaign_batches
// IMPORTANT: Does NOT return instructions_doc_url, notes, or preview_text (internal fields)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const user = await requireAuth(supabase)

    // Resolve portal client context (auth + stores)
    const ctx = await resolvePortalClient(adminClient, user.id)

    if (ctx.storeIds.length === 0) {
      return successResponse(request, {
        campaigns: [],
        totalCount: 0,
      })
    }

    const storeNameMap = ctx.storeNameMap
    const clientStoreIds = ctx.storeIds
    const storeCurrencyMap = Object.fromEntries(clientStoreIds.map(id => [id, "BRL"]))

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
    // 1. Fetch from RPC get_portal_campaigns_with_metrics
    //    (replaces direct query to campaigns table)
    // ============================================
    const { data: campaigns, error: campaignsError } = await adminClient.rpc(
      "get_portal_campaigns_with_metrics",
      {
        p_store_ids: filterStoreIds,
        p_start_date: startDate,
        p_end_date: endDate,
        p_status: status || null,
        p_channel: channel || null,
      }
    )

    if (campaignsError) {
      log.error("[Portal Campaigns] Error fetching campaigns via RPC:", campaignsError)
      throw new AppError("Erro ao buscar campanhas", 500)
    }

    // Transform campaigns to portal format (with enriched metrics from RPC)
    const portalCampaigns = (campaigns || []).map((c: Record<string, unknown>) => {
      const cStoreId = c.store_id as string | null
      const hasValidDate = c.scheduled_date != null

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        campaign_type: (c.channel as string) || "email",
        scheduled_at: c.send_datetime || (hasValidDate ? `${c.scheduled_date}T${c.scheduled_time || "00:00"}:00` : null),
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
        // New enriched metrics from RPC
        open_rate: c.open_rate,
        click_rate: c.click_rate,
        bounce_rate: c.bounce_rate,
        conversion_rate: c.conversion_rate,
        revenue_per_recipient: c.revenue_per_recipient,
        average_order_value: c.average_order_value,
        has_klaviyo_metrics: c.has_klaviyo_metrics,
        metrics_fetched_at: c.metrics_fetched_at,
        currency: cStoreId ? (storeCurrencyMap[cStoreId] || "BRL") : "BRL",
        color: (c.color as string) || "#3b82f6",
        created_at: c.send_datetime || c.scheduled_date,
        store_ids: cStoreId ? [cStoreId] : [],
        store_names: cStoreId ? [storeNameMap[cStoreId] || "Loja"] : [],
        stores_count: cStoreId ? 1 : 0,
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
        // Batches do NOT have Klaviyo metrics
        open_rate: null,
        click_rate: null,
        bounce_rate: null,
        conversion_rate: null,
        revenue_per_recipient: null,
        average_order_value: null,
        has_klaviyo_metrics: false,
        metrics_fetched_at: null,
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
