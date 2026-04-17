/**
 * Unified Metrics Service
 *
 * Abstrai Klaviyo e Omnisend sob uma API unica. Cada loja usa UMA plataforma
 * (campo client_stores.email_platform = 'klaviyo' | 'omnisend' | 'none').
 *
 * Os endpoints do dashboard devem usar estas funcoes em vez de consultar
 * klaviyo_* ou omnisend_* diretamente.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface UnifiedRevenueRow {
  store_id: string
  period_label: string
  total_revenue: number
  campaign_revenue: number
  flow_revenue: number
  store_total_revenue: number
  total_leads: number
  engaged_leads: number
  engagement_rate: number
  store_orders: number
  currency: string | null
  sync_status: string
  platform: "klaviyo" | "omnisend" | "none"
}

export interface UnifiedCampaignRow {
  store_id: string
  campaign_id: string
  campaign_name?: string | null
  campaign_status?: string | null
  channel?: string | null
  recipients: number
  delivered: number
  opened: number
  clicked: number
  conversions: number
  conversion_rate: number
  conversion_value: number
  bounced: number
  unsubscribed: number
  spam_complaints: number
  platform: "klaviyo" | "omnisend"
}

export interface UnifiedFlowRow {
  store_id: string
  flow_id: string
  flow_name?: string | null
  flow_status?: string | null
  recipients: number
  delivered: number
  opened: number
  clicked: number
  conversions: number
  conversion_rate: number
  conversion_value: number
  bounced: number
  unsubscribed: number
  platform: "klaviyo" | "omnisend"
}

/**
 * Retorna revenue unificado de store_revenue_summary.
 * Escolhe colunas Klaviyo ou Omnisend baseado em qual tem valor > 0.
 * Se ambas tiverem (raro — loja migrando), soma.
 */
export async function getUnifiedRevenue(
  supabase: SupabaseClient,
  orgId: string,
  periodLabels: string[],
  storeIds?: string[]
): Promise<UnifiedRevenueRow[]> {
  let query = supabase
    .from("store_revenue_summary")
    .select(`
      store_id, period_label,
      klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue,
      omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue,
      store_total_revenue, total_leads, engaged_leads, engagement_rate,
      store_orders, currency, sync_status
    `)
    .eq("org_id", orgId)
    .in("period_label", periodLabels)

  if (storeIds && storeIds.length > 0) {
    query = query.in("store_id", storeIds)
  }

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((r) => {
    const klavTotal = Number(r.klaviyo_total_revenue) || 0
    const omnTotal = Number(r.omnisend_total_revenue) || 0
    const klavCamp = Number(r.klaviyo_campaign_revenue) || 0
    const omnCamp = Number(r.omnisend_campaign_revenue) || 0
    const klavFlow = Number(r.klaviyo_flow_revenue) || 0
    const omnFlow = Number(r.omnisend_flow_revenue) || 0

    // Identifica plataforma pela fonte com valor
    let platform: UnifiedRevenueRow["platform"] = "none"
    if (omnTotal > 0 && klavTotal === 0) platform = "omnisend"
    else if (klavTotal > 0 && omnTotal === 0) platform = "klaviyo"
    else if (klavTotal > 0) platform = "klaviyo"
    else if (omnTotal > 0) platform = "omnisend"

    return {
      store_id: r.store_id,
      period_label: r.period_label,
      total_revenue: klavTotal + omnTotal,
      campaign_revenue: klavCamp + omnCamp,
      flow_revenue: klavFlow + omnFlow,
      store_total_revenue: Number(r.store_total_revenue) || 0,
      total_leads: Number(r.total_leads) || 0,
      engaged_leads: Number(r.engaged_leads) || 0,
      engagement_rate: Number(r.engagement_rate) || 0,
      store_orders: Number(r.store_orders) || 0,
      currency: r.currency,
      sync_status: r.sync_status || "pending",
      platform,
    }
  })
}

/** Busca campanhas de ambas as plataformas e retorna unificadas. */
export async function getUnifiedCampaigns(
  supabase: SupabaseClient,
  orgId: string,
  periodLabel: string,
  storeIds?: string[]
): Promise<UnifiedCampaignRow[]> {
  const selectKlaviyo = `
    store_id, campaign_id, campaign_name, campaign_status, channel,
    recipients, delivered, opened, clicked, conversions, conversion_rate,
    conversion_value, bounced, unsubscribed, spam_complaints
  `
  const selectOmnisend = selectKlaviyo

  const [klaviyoRes, omnisendRes] = await Promise.all([
    (async () => {
      let q = supabase
        .from("klaviyo_campaign_metrics")
        .select(selectKlaviyo)
        .eq("org_id", orgId)
        .eq("period_label", periodLabel)
      if (storeIds && storeIds.length > 0) q = q.in("store_id", storeIds)
      return q
    })(),
    (async () => {
      let q = supabase
        .from("omnisend_campaign_metrics")
        .select(selectOmnisend)
        .eq("org_id", orgId)
        .eq("period_label", periodLabel)
      if (storeIds && storeIds.length > 0) q = q.in("store_id", storeIds)
      return q
    })(),
  ])

  const klaviyo = (klaviyoRes.data || []).map((r) => ({
    ...mapCampaignRow(r),
    platform: "klaviyo" as const,
  }))
  const omnisend = (omnisendRes.data || []).map((r) => ({
    ...mapCampaignRow(r),
    platform: "omnisend" as const,
  }))

  return [...klaviyo, ...omnisend]
}

/** Busca flows (automations) de ambas as plataformas e retorna unificados. */
export async function getUnifiedFlows(
  supabase: SupabaseClient,
  orgId: string,
  periodLabel: string,
  storeIds?: string[],
  onlyLive = true
): Promise<UnifiedFlowRow[]> {
  const selectCols = `
    store_id, flow_id, flow_name, flow_status,
    recipients, delivered, opened, clicked, conversions, conversion_rate,
    conversion_value, bounced, unsubscribed
  `

  const [klaviyoRes, omnisendRes] = await Promise.all([
    (async () => {
      let q = supabase
        .from("klaviyo_flow_metrics")
        .select(selectCols)
        .eq("org_id", orgId)
        .eq("period_label", periodLabel)
      if (onlyLive) q = q.eq("flow_status", "live")
      if (storeIds && storeIds.length > 0) q = q.in("store_id", storeIds)
      return q
    })(),
    (async () => {
      let q = supabase
        .from("omnisend_flow_metrics")
        .select(selectCols)
        .eq("org_id", orgId)
        .eq("period_label", periodLabel)
      if (onlyLive) q = q.eq("flow_status", "live")
      if (storeIds && storeIds.length > 0) q = q.in("store_id", storeIds)
      return q
    })(),
  ])

  const klaviyo = (klaviyoRes.data || []).map((r) => ({
    ...mapFlowRow(r),
    platform: "klaviyo" as const,
  }))
  const omnisend = (omnisendRes.data || []).map((r) => ({
    ...mapFlowRow(r),
    platform: "omnisend" as const,
  }))

  return [...klaviyo, ...omnisend]
}

// ── Helpers de mapeamento ────────────────────────────────────────────────

function mapCampaignRow(r: Record<string, unknown>): Omit<UnifiedCampaignRow, "platform"> {
  return {
    store_id: String(r.store_id),
    campaign_id: String(r.campaign_id),
    campaign_name: r.campaign_name as string | null | undefined,
    campaign_status: r.campaign_status as string | null | undefined,
    channel: r.channel as string | null | undefined,
    recipients: Number(r.recipients) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    conversions: Number(r.conversions) || 0,
    conversion_rate: Number(r.conversion_rate) || 0,
    conversion_value: Number(r.conversion_value) || 0,
    bounced: Number(r.bounced) || 0,
    unsubscribed: Number(r.unsubscribed) || 0,
    spam_complaints: Number(r.spam_complaints) || 0,
  }
}

function mapFlowRow(r: Record<string, unknown>): Omit<UnifiedFlowRow, "platform"> {
  return {
    store_id: String(r.store_id),
    flow_id: String(r.flow_id),
    flow_name: r.flow_name as string | null | undefined,
    flow_status: r.flow_status as string | null | undefined,
    recipients: Number(r.recipients) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    conversions: Number(r.conversions) || 0,
    conversion_rate: Number(r.conversion_rate) || 0,
    conversion_value: Number(r.conversion_value) || 0,
    bounced: Number(r.bounced) || 0,
    unsubscribed: Number(r.unsubscribed) || 0,
  }
}
