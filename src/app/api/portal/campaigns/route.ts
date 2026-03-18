import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolvePortalClient } from "@/lib/api/portal-auth"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import type { PortalCampaignRpcRow } from "@/types/campaign"

const log = logger.child("PortalCampaigns")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List campaigns for the client's stores (portal view)
// Unified: campaigns (Klaviyo sync + manual) + campaign_batches — all via single RPC
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
    const storeCurrencyMap = ctx.storeCurrencyMap

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const status = searchParams.get("status")
    const storeId = searchParams.get("store_id")
    const channel = searchParams.get("channel")
    const limitRaw = parseInt(searchParams.get("limit") || "500", 10)
    const offsetRaw = parseInt(searchParams.get("offset") || "0", 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 500
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0

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

    // Single RPC call — campaigns + batches unified with pagination
    // Story 45.12: pass org_id for defense-in-depth tenant isolation
    const { data: campaigns, error: campaignsError } = await adminClient.rpc(
      "get_portal_campaigns_with_metrics",
      {
        p_store_ids: filterStoreIds,
        p_start_date: startDate,
        p_end_date: endDate,
        p_status: status || null,
        p_channel: channel || null,
        p_limit: limit,
        p_offset: offset,
        p_org_id: ctx.orgId,
      }
    )

    if (campaignsError) {
      log.error("[Portal Campaigns] Error fetching campaigns via RPC:", campaignsError)
      throw new AppError("Erro ao buscar campanhas", 500)
    }

    const rows = (campaigns || []) as PortalCampaignRpcRow[]

    // total_count comes from COUNT(*) OVER() — same value on every row
    const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0

    // Transform to portal API response format
    const portalCampaigns = rows.map((c) => {
      const cStoreId = c.store_id
      const hasValidDate = c.scheduled_date != null

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        campaign_type: c.channel || "email",
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
        open_rate: c.open_rate,
        click_rate: c.click_rate,
        bounce_rate: c.bounce_rate,
        conversion_rate: c.conversion_rate,
        revenue_per_recipient: c.revenue_per_recipient,
        average_order_value: c.average_order_value,
        has_klaviyo_metrics: c.has_klaviyo_metrics,
        metrics_fetched_at: c.metrics_fetched_at,
        currency: cStoreId ? (storeCurrencyMap[cStoreId] || "BRL") : "BRL",
        color: c.color || "#3b82f6",
        created_at: c.send_datetime || c.scheduled_date,
        store_ids: cStoreId ? [cStoreId] : [],
        store_names: cStoreId ? [storeNameMap[cStoreId] || "Loja"] : [],
        stores_count: cStoreId ? 1 : 0,
        source: c.source || (c.klaviyo_campaign_id ? "klaviyo" : "manual"),
      }
    })

    log.debug(`[Portal Campaigns] Returning ${portalCampaigns.length} campaigns (total: ${totalCount})`)

    return successResponse(request, {
      campaigns: portalCampaigns,
      totalCount,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalCampaigns")
  }
}
