import { MetaAdAccount, MetaCampaign, MetaInsights } from "./types"
import { fetchWithRetry } from "@/lib/utils/retry"

const GRAPH_API_URL = "https://graph.facebook.com/v18.0"

export interface MetaAdsConfig {
  accessToken: string
  adAccountId: string
  businessId?: string
}

export class MetaAdsService {
  private accessToken: string
  private adAccountId: string
  private businessId?: string

  constructor(config: MetaAdsConfig) {
    this.accessToken = config.accessToken
    this.adAccountId = config.adAccountId.startsWith("act_")
      ? config.adAccountId
      : `act_${config.adAccountId}`
    this.businessId = config.businessId
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${GRAPH_API_URL}${endpoint}`)
    url.searchParams.set("access_token", this.accessToken)
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })

    const response = await fetchWithRetry(url.toString())

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.error?.message || `Meta API error: ${response.status}`
      )
    }

    return response.json()
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getAdAccount()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  // Ad Account
  async getAdAccount(): Promise<MetaAdAccount> {
    return this.request(`/${this.adAccountId}`, {
      fields: "id,account_id,name,currency,timezone_name,account_status",
    })
  }

  async listAdAccounts(): Promise<{ data: MetaAdAccount[] }> {
    if (!this.businessId) {
      throw new Error("Business ID is required to list ad accounts")
    }
    return this.request(`/${this.businessId}/owned_ad_accounts`, {
      fields: "id,account_id,name,currency,timezone_name,account_status",
    })
  }

  // Campaigns
  async listCampaigns(params?: {
    status?: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED"
    limit?: number
  }): Promise<{ data: MetaCampaign[] }> {
    const queryParams: Record<string, string> = {
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
    }
    if (params?.status) {
      queryParams["filtering"] = JSON.stringify([
        { field: "effective_status", operator: "IN", value: [params.status] },
      ])
    }
    if (params?.limit) {
      queryParams["limit"] = params.limit.toString()
    }

    return this.request(`/${this.adAccountId}/campaigns`, queryParams)
  }

  async getCampaign(campaignId: string): Promise<MetaCampaign> {
    return this.request(`/${campaignId}`, {
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
    })
  }

  // Insights
  async getAccountInsights(params: {
    datePreset?: "today" | "yesterday" | "last_7d" | "last_14d" | "last_30d" | "last_90d" | "this_month" | "last_month"
    timeRange?: { since: string; until: string }
    level?: "account" | "campaign" | "adset" | "ad"
  }): Promise<{ data: MetaInsights[] }> {
    const queryParams: Record<string, string> = {
      fields:
        "impressions,reach,clicks,spend,cpm,cpc,ctr,actions,action_values,purchase_roas",
    }

    if (params.datePreset) {
      queryParams["date_preset"] = params.datePreset
    } else if (params.timeRange) {
      queryParams["time_range"] = JSON.stringify(params.timeRange)
    }

    if (params.level) {
      queryParams["level"] = params.level
    }

    const response = await this.request<{ data: unknown[] }>(
      `/${this.adAccountId}/insights`,
      queryParams
    )

    return {
      data: response.data.map((item: unknown) => this.parseInsights(item as Record<string, unknown>)),
    }
  }

  async getCampaignInsights(
    campaignId: string,
    params: {
      datePreset?: string
      timeRange?: { since: string; until: string }
    }
  ): Promise<{ data: MetaInsights[] }> {
    const queryParams: Record<string, string> = {
      fields:
        "impressions,reach,clicks,spend,cpm,cpc,ctr,actions,action_values,purchase_roas",
    }

    if (params.datePreset) {
      queryParams["date_preset"] = params.datePreset
    } else if (params.timeRange) {
      queryParams["time_range"] = JSON.stringify(params.timeRange)
    }

    const response = await this.request<{ data: unknown[] }>(
      `/${campaignId}/insights`,
      queryParams
    )

    return {
      data: response.data.map((item: unknown) => this.parseInsights(item as Record<string, unknown>)),
    }
  }

  private parseInsights(raw: Record<string, unknown>): MetaInsights {
    const actions = (raw.actions as Array<{ action_type: string; value: string }>) || []
    const actionValues = (raw.action_values as Array<{ action_type: string; value: string }>) || []
    const roasData = (raw.purchase_roas as Array<{ action_type: string; value: string }>) || []

    const purchases = actions.find((a) => a.action_type === "purchase")
    const purchaseValue = actionValues.find((a) => a.action_type === "purchase")
    const roas = roasData.find((a) => a.action_type === "purchase")

    return {
      impressions: parseInt(raw.impressions as string) || 0,
      reach: parseInt(raw.reach as string) || 0,
      clicks: parseInt(raw.clicks as string) || 0,
      spend: parseFloat(raw.spend as string) || 0,
      cpm: parseFloat(raw.cpm as string) || 0,
      cpc: parseFloat(raw.cpc as string) || 0,
      ctr: parseFloat(raw.ctr as string) || 0,
      conversions: purchases ? parseInt(purchases.value) : undefined,
      cost_per_conversion: purchaseValue
        ? (parseFloat(raw.spend as string) || 0) / parseInt(purchases?.value || "1")
        : undefined,
      roas: roas ? parseFloat(roas.value) : undefined,
      date_start: raw.date_start as string,
      date_stop: raw.date_stop as string,
    }
  }

  // Aggregated metrics for dashboard
  async getDashboardMetrics(
    dateRange: { since: string; until: string }
  ): Promise<{
    totalSpend: number
    totalRevenue: number
    roas: number
    impressions: number
    clicks: number
    conversions: number
    ctr: number
    cpc: number
  }> {
    const insights = await this.getAccountInsights({
      timeRange: dateRange,
      level: "account",
    })

    if (!insights.data.length) {
      return {
        totalSpend: 0,
        totalRevenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
      }
    }

    const data = insights.data[0]
    const revenue = data.roas ? data.spend * data.roas : 0

    return {
      totalSpend: data.spend,
      totalRevenue: revenue,
      roas: data.roas || 0,
      impressions: data.impressions,
      clicks: data.clicks,
      conversions: data.conversions || 0,
      ctr: data.ctr,
      cpc: data.cpc,
    }
  }
}

// Factory function
export function createMetaAdsService(
  credentials: Record<string, string>
): MetaAdsService {
  if (!credentials.access_token) {
    throw new Error("Meta Access Token is required")
  }
  if (!credentials.ad_account_id) {
    throw new Error("Ad Account ID is required")
  }

  return new MetaAdsService({
    accessToken: credentials.access_token,
    adAccountId: credentials.ad_account_id,
    businessId: credentials.business_id,
  })
}
