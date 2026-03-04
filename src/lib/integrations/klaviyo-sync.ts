/**
 * Klaviyo Metrics Sync Service
 *
 * Serviço para sincronização de campanhas e métricas do Klaviyo
 * Otimizado para 100+ lojas com processamento em background
 */

import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { KLAVIYO_API_URL, KLAVIYO_REVISION, MIN_REQUEST_INTERVAL } from "@/lib/integrations/klaviyo/client"
import { KLAVIYO_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"

const log = logger.child("KlaviyoSync")

// Use centralized rate limit from klaviyo/client.ts (1000ms)
const RATE_LIMIT_DELAY_MS = MIN_REQUEST_INTERVAL

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
   * Lista campanhas de um canal com paginação
   * Klaviyo requires channel filter and does NOT support page[size]
   */
  async getCampaigns(
    channel: "email" | "sms",
    status?: string,
    cursor?: string
  ): Promise<{
    campaigns: KlaviyoCampaignRaw[]
    nextCursor: string | null
  }> {
    let url = "/campaigns/"
    const filterParts: string[] = [`equals(messages.channel,'${channel}')`]

    if (status) {
      filterParts.push(`equals(status,"${status}")`)
    }

    const params: string[] = [`filter=${filterParts.join(",")}`]

    if (cursor) {
      params.push(`page[cursor]=${cursor}`)
    }

    url += `?${params.join("&")}`

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
   * Fetches both email and SMS campaigns
   */
  async getAllCampaigns(status?: string): Promise<KlaviyoCampaignRaw[]> {
    const allCampaigns: KlaviyoCampaignRaw[] = []

    // Fetch both email and SMS campaigns (channel filter is required by Klaviyo)
    for (const channel of ["email", "sms"] as const) {
      let cursor: string | null = null

      do {
        const { campaigns, nextCursor } = await this.getCampaigns(channel, status, cursor || undefined)
        allCampaigns.push(...campaigns)
        cursor = nextCursor

        // Rate limiting
        if (cursor) {
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
        }
      } while (cursor)
    }

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
          // Valid statistics per Klaviyo Reporting API (revision 2024-10-15)
          // IMPORTANT: API uses "opens"/"clicks"/"unsubscribes" (NOT "opened"/"clicked"/"unsubscribed")
          statistics: [
            "recipients",
            "delivered",
            "delivery_rate",
            "opens",
            "opens_unique",
            "clicks",
            "clicks_unique",
            "click_rate",
            "click_to_open_rate",
            "conversion_rate",
            "conversion_uniques",
            "conversion_value",
            "conversions",
            "bounced",
            "bounce_rate",
            "unsubscribes",
            "unsubscribe_rate",
            "average_order_value",
            "revenue_per_recipient",
          ],
          timeframe: {
            start: startDate,
            end: endDate,
          },
          // Filter to only these campaigns
          filter: `any(${campaignFilter})`,
          // Group by campaign to get metrics per campaign
          group_by: ["campaign_id"],
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
      log.error("Error fetching campaign metrics", { error: error instanceof Error ? error.message : error })
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

    const progress: SyncJobProgress = {
      jobId: crypto.randomUUID(),
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

    log.info("Starting full sync", { triggeredBy, jobId: progress.jobId })

    try {
      // Get all stores with Klaviyo configured
      const { data: stores, error: storesError } = await supabase
        .from("client_stores")
        .select(`
          id,
          store_name,
          klaviyo_private_key,
          client_id,
          clients (name)
        `)
        .or(KLAVIYO_CREDENTIALS_FILTER)
        .eq("is_active", true)

      if (storesError) {
        throw new Error(`Failed to fetch stores: ${storesError.message}`)
      }

      progress.totalStores = stores?.length || 0
      log.info("Fetched stores for sync", { totalStores: progress.totalStores })

      // Process stores in batches of 10 (parallel)
      const BATCH_SIZE = 10
      for (let i = 0; i < (stores?.length || 0); i += BATCH_SIZE) {
        const batch = stores!.slice(i, i + BATCH_SIZE)

        await Promise.all(
          batch.map(async (store) => {
            try {
              const storeResult = await this.syncStore(store.id, decrypt(store.klaviyo_private_key!))
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

        log.info("Batch processed", { processed: progress.processedStores, total: progress.totalStores })
      }

      progress.status = "completed"
      log.info("Full sync completed", { jobId: progress.jobId, created: progress.campaignsCreated, updated: progress.campaignsUpdated })
    } catch (error) {
      progress.status = "failed"
      log.error("Full sync failed", { jobId: progress.jobId, error: error instanceof Error ? error.message : error })
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
      .filter((c) => c.attributes.status?.toLowerCase() === "sent")
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

          const deliveredVal = stats.delivered || 0
          const opensUniqueVal = stats.opens_unique || 0
          const computedOpenRate = deliveredVal > 0 ? (opensUniqueVal / deliveredVal) * 100 : 0

          const metricsData = {
            campaign_id: campaignId,
            recipients: stats.recipients || 0,
            delivered: deliveredVal,
            delivery_rate: stats.delivery_rate || 0,
            opened: stats.opens || 0,
            opened_unique: opensUniqueVal,
            open_rate: Math.round(computedOpenRate * 100) / 100,
            clicked: stats.clicks || 0,
            clicked_unique: stats.clicks_unique || 0,
            click_rate: stats.click_rate || 0,
            click_to_open_rate: stats.click_to_open_rate || 0,
            conversions: stats.conversions || 0,
            conversion_rate: stats.conversion_rate || 0,
            revenue: stats.conversion_value || 0,
            revenue_per_recipient: stats.revenue_per_recipient || 0,
            average_order_value: stats.average_order_value || 0,
            bounced: stats.bounced || 0,
            bounce_rate: stats.bounce_rate || 0,
            unsubscribed: stats.unsubscribes || 0,
            unsubscribe_rate: stats.unsubscribe_rate || 0,
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
   * @deprecated view v_campaigns_with_metrics removida — retorna vazio
   */
  async searchCampaigns(_params: {
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
    return { data: [], count: 0, error: null }
  }

  /**
   * Busca rankings de campanhas
   * @deprecated view v_campaigns_with_metrics removida — retorna vazio
   */
  async getRankings(_params: {
    metric: "revenue" | "open_rate" | "click_rate" | "conversion_rate"
    storeId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }) {
    return { data: [], error: null }
  }

  /**
   * Compara campanhas por nome entre lojas
   * @deprecated view v_campaigns_with_metrics removida — retorna vazio
   */
  async compareCampaignsByName(_campaignName: string) {
    return {
      byStore: [],
      totals: {
        totalStores: 0,
        totalCampaigns: 0,
        totalRecipients: 0,
        totalRevenue: 0,
        avgOpenRate: 0,
        avgClickRate: 0,
        avgConversionRate: 0,
      },
    }
  }

  /**
   * Busca histórico de métricas para gráficos
   * @deprecated tabela campaign_metrics_history removida — retorna vazio
   */
  async getMetricsHistory(
    _campaignId: string,
    _startDate: string,
    _endDate: string
  ) {
    return { data: [], error: null }
  }

  /**
   * Busca alertas
   * @deprecated view v_unread_alerts removida — retorna vazio
   */
  async getAlerts(_params: {
    storeId?: string
    severity?: string
    unreadOnly?: boolean
    limit?: number
  }) {
    return { data: [], error: null }
  }

  /**
   * Marca alerta como lido
   * @deprecated tabela campaign_alerts removida — no-op
   */
  async markAlertAsRead(_alertId: string) {
    return { data: null, error: null }
  }

  /**
   * Dispensa alerta
   * @deprecated tabela campaign_alerts removida — no-op
   */
  async dismissAlert(_alertId: string, _dismissedBy: string) {
    return { data: null, error: null }
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
