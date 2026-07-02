/**
 * Portal Campaigns Service
 *
 * Builds the portal campaigns list payload (campaigns + batches unified via
 * RPC) for a client's stores.
 *
 * Extracted from portal/campaigns/route.ts so Server Components can call
 * it directly without an HTTP hop.
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import type { PortalClientContext } from "@/lib/api/portal-auth"
import type { PortalCampaignRpcRow } from "@/types/campaign"

const log = logger.child("PortalCampaigns")

// IMPORTANT: Does NOT return instructions_doc_url, notes, or preview_text (internal fields)
export async function getPortalCampaigns(opts: {
  ctx: PortalClientContext
  startDate: string | null
  endDate: string | null
  status: string | null
  storeId: string | null
  channel: string | null
  limit: number
  offset: number
  adminClient: SupabaseClient
}) {
  const { ctx, startDate, endDate, status, storeId, channel, limit, offset, adminClient } = opts

  if (ctx.storeIds.length === 0) {
    return { campaigns: [], totalCount: 0 }
  }

  const storeNameMap = ctx.storeNameMap
  const clientStoreIds = ctx.storeIds
  const storeCurrencyMap = ctx.storeCurrencyMap

  // Determine which stores to filter by — validate storeId belongs to client
  let filterStoreIds = clientStoreIds
  if (storeId) {
    if (clientStoreIds.includes(storeId)) {
      filterStoreIds = [storeId]
    } else {
      // Invalid store_id for this client — return empty instead of falling back
      return { campaigns: [], totalCount: 0 }
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

  return {
    campaigns: portalCampaigns,
    totalCount,
  }
}
