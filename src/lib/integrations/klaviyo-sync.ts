/**
 * Klaviyo Metrics Sync Service
 *
 * Serviço para sincronização de campanhas e métricas do Klaviyo
 * Otimizado para 100+ lojas com processamento em background
 */

import { createClient } from "@supabase/supabase-js"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15"

// Rate limiting: max 10 requests per second burst, 150 per minute steady
const RATE_LIMIT_DELAY_MS = 100 // 100ms between requests

// =====================================================
// TYPES
// =====================================================

export interface KlaviyoCampaignRaw {
  id: string
  attributes: {
    name: string
    status: string
    archived: boolean
    audiences: {
      included: string[]
      excluded: string[]
    }
    send_options: {
      use_smart_sending: boolean
      is_transactional: boolean
    }
    tracking_options: {
      is_add_utm: boolean
      is_tracking_clicks: boolean
      is_tracking_opens: boolean
    }
    send_strategy: {
      method: string
      options_static?: {
        datetime: string
      }
      options_throttled?: {
        datetime: string
        throttle_percentage: number
      }
      options_sto?: {
        date: string
      }
    }
    created_at: string
    scheduled_at?: string
    updated_at: string
    send_time?: string
  }
}

export interface KlaviyoCampaignMessageRaw {
  id: string
  attributes: {
    label: string
    channel: string
    content: {
      subject?: string
      preview_text?: string
      from_email?: string
      from_label?: string
      reply_to_email?: string
    }
    created_at: string
    updated_at: string
  }
}

export interface KlaviyoCampaignMetricsReport {
  data: {
    type: string
    attributes: {
      results: Array<{
        groupings: Record<string, string>
        statistics: Record<string, number>
      }>
    }
  }
}

export interface SyncJobProgress {
  jobId: string
  status: "pending" | "running" | "completed" | "failed"
  totalStores: number
  processedStores: number
  totalCampaigns: number
  processedCampaigns: number
  campaignsCreated: number
  campaignsUpdated: number
  metricsSynced: number
  alertsGenerated: number
  errors: Array<{ store_id: string; error: string }>
}

export interface StoreWithKlaviyo {
  id: string
  name: string
  klaviyo_private_key: string | null
  client_id: string
  client?: {
    name: string
  }
}

// =====================================================
// KLAVIYO API CLIENT
// =====================================================

class KlaviyoMetricsClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${KLAVIYO_API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Klaviyo-API-Key ${this.apiKey}`,
        revision: KLAVIYO_REVISION,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.errors?.[0]?.detail || `Klaviyo API error: ${response.status}`
      )
    }

    return response.json()
  }

  /**
   * Lista todas as campanhas com paginação
   */
  async getCampaigns(
    status?: string,
    cursor?: string
  ): Promise<{
    campaigns: KlaviyoCampaignRaw[]
    nextCursor: string | null
  }> {
    let url = "/campaigns/"
    const params: string[] = []

    if (status) {
      params.push(`filter=equals(status,"${status}")`)
    }
    if (cursor) {
      params.push(`page[cursor]=${cursor}`)
    }
    params.push("page[size]=50")

    if (params.length > 0) {
      url += `?${params.join("&")}`
    }

    const response = await this.request<{
      data: KlaviyoCampaignRaw[]
      links?: { next?: string }
    }>(url)

    // Extract cursor from next link
    let nextCursor: string | null = null
    if (response.links?.next) {
      const match = response.links.next.match(/page\[cursor\]=([^&]+)/)
      nextCursor = match ? match[1] : null
    }

    return {
      campaigns: response.data,
      nextCursor,
    }
  }

  /**
   * Lista todas as campanhas (com paginação automática)
   */
  async getAllCampaigns(status?: string): Promise<KlaviyoCampaignRaw[]> {
    const allCampaigns: KlaviyoCampaignRaw[] = []
    let cursor: string | null = null

    do {
      const { campaigns, nextCursor } = await this.getCampaigns(status, cursor || undefined)
      allCampaigns.push(...campaigns)
      cursor = nextCursor

      // Rate limiting
      if (cursor) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
      }
    } while (cursor)

    return allCampaigns
  }

  /**
   * Busca mensagem de uma campanha (contém subject, channel, etc)
   */
  async getCampaignMessage(
    campaignId: string
  ): Promise<KlaviyoCampaignMessageRaw | null> {
    try {
      const response = await this.request<{
        data: KlaviyoCampaignMessageRaw[]
      }>(`/campaigns/${campaignId}/campaign-messages/`)

      return response.data[0] || null
    } catch {
      return null
    }
  }

  /**
   * Busca métricas de campanhas usando Reporting API
   */
  async getCampaignMetrics(
    campaignIds: string[],
    startDate: string,
    endDate: string
  ): Promise<Map<string, Record<string, number>>> {
    if (campaignIds.length === 0) return new Map()

    // Build filter for multiple campaigns
    const campaignFilter = campaignIds
      .map((id) => `equals(campaign_id,"${id}")`)
      .join(",")

    const requestBody = {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: [
            "recipients",
            "delivered",
            "delivery_rate",
            "opened",
            "opened_unique",
            "open_rate",
            "clicked",
            "clicked_unique",
            "click_rate",
            "click_to_open_rate",
            "conversion_rate",
            "conversion_uniques",
            "conversion_value",
            "conversions",
            "bounced",
            "bounced_unique",
            "bounce_rate",
            "unsubscribed",
            "unsubscribed_unique",
            "unsubscribe_rate",
            "spam_complaints",
            "spam_complaints_unique",
            "spam_complaint_rate",
            "average_order_value",
            "revenue_per_recipient",
          ],
          timeframe: {
            start: startDate,
            end: endDate,
          },
          filter: `any(${campaignFilter})`,
        },
      },
    }

    try {
      const response = await this.request<KlaviyoCampaignMetricsReport>(
        "/campaign-values-reports/",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
        }
      )

      // Map results by campaign_id
      const metricsMap = new Map<string, Record<string, number>>()
      for (const result of response.data.attributes.results) {
        const campaignId = result.groupings.campaign_id
        if (campaignId) {
          metricsMap.set(campaignId, result.statistics)
        }
      }

      return metricsMap
    } catch (error) {
      console.error("Error fetching campaign metrics:", error)
      return new Map()
    }
  }

  /**
   * Testa conexão com a API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request<{ data: unknown[] }>("/accounts/")
      return true
    } catch {
      return false
    }
  }
}

// =====================================================
// SYNC SERVICE
// =====================================================

export class KlaviyoSyncService {
  private supabaseUrl: string
  private supabaseKey: string

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl
    this.supabaseKey = supabaseKey
  }

  private getSupabase() {
    return createClient(this.supabaseUrl, this.supabaseKey)
  }

  /**
   * Sincroniza todas as lojas com Klaviyo configurado
   */
  async syncAllStores(triggeredBy?: string): Promise<SyncJobProgress> {
    const supabase = this.getSupabase()

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from("klaviyo_sync_jobs")
      .insert({
        job_type: "full_sync",
        status: "running",
        triggered_by: triggeredBy,
        trigger_type: triggeredBy ? "manual" : "cron",
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (jobError || !job) {
      throw new Error(`Failed to create sync job: ${jobError?.message}`)
    }

    const progress: SyncJobProgress = {
      jobId: job.id,
      status: "running",
      totalStores: 0,
      processedStores: 0,
      totalCampaigns: 0,
      processedCampaigns: 0,
      campaignsCreated: 0,
      campaignsUpdated: 0,
      metricsSynced: 0,
      alertsGenerated: 0,
      errors: [],
    }

    try {
      // Get all stores with Klaviyo configured
      const { data: stores, error: storesError } = await supabase
        .from("client_stores")
        .select(`
          id,
          name,
          klaviyo_private_key,
          client_id,
          clients (name)
        `)
        .not("klaviyo_private_key", "is", null)
        .eq("is_active", true)

      if (storesError) {
        throw new Error(`Failed to fetch stores: ${storesError.message}`)
      }

      progress.totalStores = stores?.length || 0

      // Update job with total
      await supabase
        .from("klaviyo_sync_jobs")
        .update({ total_stores: progress.totalStores })
        .eq("id", job.id)

      // Process stores in batches of 10 (parallel)
      const BATCH_SIZE = 10
      for (let i = 0; i < (stores?.length || 0); i += BATCH_SIZE) {
        const batch = stores!.slice(i, i + BATCH_SIZE)

        await Promise.all(
          batch.map(async (store) => {
            try {
              const storeResult = await this.syncStore(store.id, store.klaviyo_private_key!)
              progress.campaignsCreated += storeResult.created
              progress.campaignsUpdated += storeResult.updated
              progress.metricsSynced += storeResult.metricsSynced
              progress.totalCampaigns += storeResult.total
              progress.processedCampaigns += storeResult.total
            } catch (error) {
              progress.errors.push({
                store_id: store.id,
                error: error instanceof Error ? error.message : "Unknown error",
              })
            }
            progress.processedStores++
          })
        )

        // Update job progress
        await supabase
          .from("klaviyo_sync_jobs")
          .update({
            processed_stores: progress.processedStores,
            total_campaigns: progress.totalCampaigns,
            processed_campaigns: progress.processedCampaigns,
            campaigns_created: progress.campaignsCreated,
            campaigns_updated: progress.campaignsUpdated,
            metrics_synced: progress.metricsSynced,
            errors_count: progress.errors.length,
            error_log: progress.errors,
          })
          .eq("id", job.id)
      }

      // Mark job as completed
      progress.status = "completed"
      await supabase
        .from("klaviyo_sync_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)

      // Update sync config for each store
      for (const store of stores || []) {
        await supabase
          .from("klaviyo_sync_config")
          .upsert({
            store_id: store.id,
            last_sync_at: new Date().toISOString(),
            last_sync_status: "success",
          })
      }
    } catch (error) {
      progress.status = "failed"
      await supabase
        .from("klaviyo_sync_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_log: [
            ...progress.errors,
            { store_id: "global", error: error instanceof Error ? error.message : "Unknown error" },
          ],
        })
        .eq("id", job.id)

      throw error
    }

    return progress
  }

  /**
   * Sincroniza uma loja específica
   */
  async syncStore(
    storeId: string,
    apiKey: string
  ): Promise<{
    total: number
    created: number
    updated: number
    metricsSynced: number
  }> {
    const supabase = this.getSupabase()
    const client = new KlaviyoMetricsClient(apiKey)

    // Test connection first
    const connected = await client.testConnection()
    if (!connected) {
      throw new Error("Failed to connect to Klaviyo API")
    }

    // Fetch all campaigns (sent ones primarily)
    const campaigns = await client.getAllCampaigns()

    const result = {
      total: campaigns.length,
      created: 0,
      updated: 0,
      metricsSynced: 0,
    }

    // Get existing campaigns for this store
    const { data: existingCampaigns } = await supabase
      .from("klaviyo_campaigns")
      .select("klaviyo_campaign_id")
      .eq("store_id", storeId)

    const existingIds = new Set(
      existingCampaigns?.map((c) => c.klaviyo_campaign_id) || []
    )

    // Process campaigns
    for (const campaign of campaigns) {
      // Get message details (subject, channel)
      const message = await client.getCampaignMessage(campaign.id)

      const campaignData = {
        store_id: storeId,
        klaviyo_campaign_id: campaign.id,
        klaviyo_message_id: message?.id,
        name: campaign.attributes.name,
        subject: message?.attributes.content?.subject,
        channel: message?.attributes.channel || "email",
        status: campaign.attributes.status,
        send_time:
          campaign.attributes.send_time ||
          campaign.attributes.send_strategy?.options_static?.datetime,
        created_at_klaviyo: campaign.attributes.created_at,
        updated_at_klaviyo: campaign.attributes.updated_at,
        synced_at: new Date().toISOString(),
      }

      if (existingIds.has(campaign.id)) {
        // Update
        await supabase
          .from("klaviyo_campaigns")
          .update(campaignData)
          .eq("store_id", storeId)
          .eq("klaviyo_campaign_id", campaign.id)
        result.updated++
      } else {
        // Insert
        await supabase.from("klaviyo_campaigns").insert(campaignData)
        result.created++
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
    }

    // Sync metrics for sent campaigns
    const sentCampaignIds = campaigns
      .filter((c) => c.attributes.status === "Sent")
      .map((c) => c.id)

    if (sentCampaignIds.length > 0) {
      // Get metrics in batches of 100
      const METRICS_BATCH_SIZE = 100
      const startDate = new Date()
      startDate.setFullYear(startDate.getFullYear() - 1) // Last year
      const endDate = new Date()

      for (let i = 0; i < sentCampaignIds.length; i += METRICS_BATCH_SIZE) {
        const batchIds = sentCampaignIds.slice(i, i + METRICS_BATCH_SIZE)

        const metricsMap = await client.getCampaignMetrics(
          batchIds,
          startDate.toISOString(),
          endDate.toISOString()
        )

        // Get our campaign IDs for the Klaviyo campaign IDs
        const { data: ourCampaigns } = await supabase
          .from("klaviyo_campaigns")
          .select("id, klaviyo_campaign_id")
          .eq("store_id", storeId)
          .in("klaviyo_campaign_id", batchIds)

        const idMap = new Map(
          ourCampaigns?.map((c) => [c.klaviyo_campaign_id, c.id]) || []
        )

        // Upsert metrics
        for (const [klaviyoCampaignId, stats] of Array.from(metricsMap)) {
          const campaignId = idMap.get(klaviyoCampaignId)
          if (!campaignId) continue

          const metricsData = {
            campaign_id: campaignId,
            recipients: stats.recipients || 0,
            delivered: stats.delivered || 0,
            delivery_rate: stats.delivery_rate || 0,
            opened: stats.opened || 0,
            opened_unique: stats.opened_unique || 0,
            open_rate: stats.open_rate || 0,
            clicked: stats.clicked || 0,
            clicked_unique: stats.clicked_unique || 0,
            click_rate: stats.click_rate || 0,
            click_to_open_rate: stats.click_to_open_rate || 0,
            conversions: stats.conversions || 0,
            conversion_rate: stats.conversion_rate || 0,
            revenue: stats.conversion_value || 0,
            revenue_per_recipient: stats.revenue_per_recipient || 0,
            average_order_value: stats.average_order_value || 0,
            bounced: stats.bounced || 0,
            bounce_rate: stats.bounce_rate || 0,
            unsubscribed: stats.unsubscribed || 0,
            unsubscribe_rate: stats.unsubscribe_rate || 0,
            spam_complaints: stats.spam_complaints || 0,
            spam_rate: stats.spam_complaint_rate || 0,
            synced_at: new Date().toISOString(),
          }

          await supabase
            .from("campaign_metrics")
            .upsert(metricsData, { onConflict: "campaign_id" })

          result.metricsSynced++
        }
      }
    }

    return result
  }

  /**
   * Busca campanhas com filtros (para UI)
   */
  async searchCampaigns(params: {
    search?: string
    storeId?: string
    status?: string
    channel?: string
    startDate?: string
    endDate?: string
    sortBy?: string
    sortOrder?: "asc" | "desc"
    limit?: number
    offset?: number
  }) {
    const supabase = this.getSupabase()

    let query = supabase
      .from("v_campaigns_with_metrics")
      .select("*", { count: "exact" })

    // Apply filters
    if (params.search) {
      query = query.ilike("name", `%${params.search}%`)
    }
    if (params.storeId) {
      query = query.eq("store_id", params.storeId)
    }
    if (params.status) {
      query = query.eq("status", params.status)
    }
    if (params.channel) {
      query = query.eq("channel", params.channel)
    }
    if (params.startDate) {
      query = query.gte("send_time", params.startDate)
    }
    if (params.endDate) {
      query = query.lte("send_time", params.endDate)
    }

    // Sort
    const sortBy = params.sortBy || "send_time"
    const sortOrder = params.sortOrder || "desc"
    query = query.order(sortBy, { ascending: sortOrder === "asc" })

    // Pagination
    if (params.limit) {
      query = query.limit(params.limit)
    }
    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 20) - 1)
    }

    return query
  }

  /**
   * Busca rankings de campanhas
   */
  async getRankings(params: {
    metric: "revenue" | "open_rate" | "click_rate" | "conversion_rate"
    storeId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }) {
    const supabase = this.getSupabase()

    let query = supabase
      .from("v_campaigns_with_metrics")
      .select("*")
      .eq("status", "Sent")
      .gt(params.metric, 0)
      .order(params.metric, { ascending: false })
      .limit(params.limit || 10)

    if (params.storeId) {
      query = query.eq("store_id", params.storeId)
    }
    if (params.startDate) {
      query = query.gte("send_time", params.startDate)
    }
    if (params.endDate) {
      query = query.lte("send_time", params.endDate)
    }

    return query
  }

  /**
   * Compara campanhas por nome entre lojas
   */
  async compareCampaignsByName(campaignName: string) {
    const supabase = this.getSupabase()

    const { data, error } = await supabase
      .from("v_campaigns_with_metrics")
      .select("*")
      .ilike("name", `%${campaignName}%`)
      .eq("status", "Sent")
      .order("send_time", { ascending: false })

    if (error) throw error

    // Group by store
    const byStore = new Map<
      string,
      {
        store_id: string
        store_name: string
        client_name: string
        campaigns: typeof data
      }
    >()

    for (const campaign of data || []) {
      if (!byStore.has(campaign.store_id)) {
        byStore.set(campaign.store_id, {
          store_id: campaign.store_id,
          store_name: campaign.store_name,
          client_name: campaign.client_name,
          campaigns: [],
        })
      }
      byStore.get(campaign.store_id)!.campaigns.push(campaign)
    }

    // Calculate totals
    const totals = {
      totalStores: byStore.size,
      totalCampaigns: data?.length || 0,
      totalRecipients: 0,
      totalRevenue: 0,
      avgOpenRate: 0,
      avgClickRate: 0,
      avgConversionRate: 0,
    }

    let totalOpenRate = 0
    let totalClickRate = 0
    let totalConversionRate = 0
    let count = 0

    for (const campaign of data || []) {
      totals.totalRecipients += campaign.recipients || 0
      totals.totalRevenue += Number(campaign.revenue) || 0
      totalOpenRate += campaign.open_rate || 0
      totalClickRate += campaign.click_rate || 0
      totalConversionRate += campaign.conversion_rate || 0
      count++
    }

    if (count > 0) {
      totals.avgOpenRate = totalOpenRate / count
      totals.avgClickRate = totalClickRate / count
      totals.avgConversionRate = totalConversionRate / count
    }

    return {
      byStore: Array.from(byStore.values()),
      totals,
    }
  }

  /**
   * Busca histórico de métricas para gráficos
   */
  async getMetricsHistory(
    campaignId: string,
    startDate: string,
    endDate: string
  ) {
    const supabase = this.getSupabase()

    return supabase
      .from("campaign_metrics_history")
      .select("*")
      .eq("campaign_id", campaignId)
      .gte("snapshot_date", startDate)
      .lte("snapshot_date", endDate)
      .order("snapshot_date", { ascending: true })
  }

  /**
   * Busca alertas
   */
  async getAlerts(params: {
    storeId?: string
    severity?: string
    unreadOnly?: boolean
    limit?: number
  }) {
    const supabase = this.getSupabase()

    let query = supabase
      .from("v_unread_alerts")
      .select("*")
      .order("created_at", { ascending: false })

    if (params.storeId) {
      query = query.eq("store_id", params.storeId)
    }
    if (params.severity) {
      query = query.eq("severity", params.severity)
    }
    if (params.unreadOnly !== false) {
      query = query.eq("is_read", false)
    }
    if (params.limit) {
      query = query.limit(params.limit)
    }

    return query
  }

  /**
   * Marca alerta como lido
   */
  async markAlertAsRead(alertId: string) {
    const supabase = this.getSupabase()

    return supabase
      .from("campaign_alerts")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", alertId)
  }

  /**
   * Dispensa alerta
   */
  async dismissAlert(alertId: string, dismissedBy: string) {
    const supabase = this.getSupabase()

    return supabase
      .from("campaign_alerts")
      .update({
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
        dismissed_by: dismissedBy,
      })
      .eq("id", alertId)
  }
}

// Factory function
export function createKlaviyoSyncService(): KlaviyoSyncService {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase credentials not configured")
  }

  return new KlaviyoSyncService(supabaseUrl, supabaseKey)
}
