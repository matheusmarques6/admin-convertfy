import { MetaAdAccount, MetaCampaign, MetaInsights } from "./types"
import { fetchWithRetry } from "@/lib/utils/retry"

const GRAPH_API_URL = "https://graph.facebook.com/v18.0"

export interface MetaAdsConfig {
  accessToken: string
  adAccountId: string
  businessId?: string
}

/** Linha de insight por dia + entidade (campanha/adset/anúncio). */
export interface MetaDailyInsight {
  day: string
  level: "campaign" | "adset" | "ad"
  entity_id: string
  campaign_id: string | null
  campaign_name: string | null
  adset_id: string | null
  adset_name: string | null
  ad_id: string | null
  ad_name: string | null
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number | null
  cpc: number | null
  cpm: number | null
  leads: number
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

  /**
   * Insights quebrados POR DIA e por nível (campanha/adset/anúncio),
   * com os nomes das entidades — que são a chave de atribuição contra
   * as UTMs do CRM ({{campaign.name}}, {{adset.name}}, {{ad.name}}).
   *
   * Pagina o `paging.next` até o fim (contas grandes trazem centenas de
   * linhas por dia). `time_increment: 1` é o que garante uma linha por dia.
   */
  async getDailyInsights(params: {
    level: "campaign" | "adset" | "ad"
    timeRange: { since: string; until: string }
    maxPages?: number
  }): Promise<MetaDailyInsight[]> {
    const fields = [
      "date_start",
      "date_stop",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "spend",
      "impressions",
      "reach",
      "clicks",
      "ctr",
      "cpc",
      "cpm",
      "actions",
    ].join(",")

    const url = new URL(`${GRAPH_API_URL}/${this.adAccountId}/insights`)
    url.searchParams.set("access_token", this.accessToken)
    url.searchParams.set("fields", fields)
    url.searchParams.set("level", params.level)
    url.searchParams.set("time_increment", "1")
    url.searchParams.set("time_range", JSON.stringify(params.timeRange))
    url.searchParams.set("limit", "500")

    const out: MetaDailyInsight[] = []
    let next: string | null = url.toString()
    const maxPages = params.maxPages ?? 20

    for (let page = 0; page < maxPages && next; page++) {
      const response = await fetchWithRetry(next)
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(
          error.error?.message || `Meta API error: ${response.status}`,
        )
      }
      const json = (await response.json()) as {
        data?: Array<Record<string, unknown>>
        paging?: { next?: string }
      }
      for (const row of json.data ?? []) {
        out.push(this.parseDailyInsight(row, params.level))
      }
      next = json.paging?.next ?? null
    }

    return out
  }

  private parseDailyInsight(
    raw: Record<string, unknown>,
    level: "campaign" | "adset" | "ad",
  ): MetaDailyInsight {
    const actions =
      (raw.actions as Array<{ action_type: string; value: string }>) || []
    // A Meta reporta lead em chaves diferentes conforme a origem
    // (formulário nativo, site com pixel, mensagem). Soma as variantes
    // sem dupla contagem do agregado "lead".
    const leadKeys = [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
    ]
    const leadCounts = leadKeys.map(
      (k) => parseInt(actions.find((a) => a.action_type === k)?.value ?? "0", 10) || 0,
    )
    const leads = Math.max(...leadCounts, 0)

    const num = (v: unknown) => parseFloat(v as string) || 0
    const int = (v: unknown) => parseInt(v as string, 10) || 0

    const entityId =
      level === "campaign"
        ? (raw.campaign_id as string)
        : level === "adset"
          ? (raw.adset_id as string)
          : (raw.ad_id as string)

    return {
      day: raw.date_start as string,
      level,
      entity_id: entityId ?? "",
      campaign_id: (raw.campaign_id as string) ?? null,
      campaign_name: (raw.campaign_name as string) ?? null,
      adset_id: (raw.adset_id as string) ?? null,
      adset_name: (raw.adset_name as string) ?? null,
      ad_id: (raw.ad_id as string) ?? null,
      ad_name: (raw.ad_name as string) ?? null,
      spend: num(raw.spend),
      impressions: int(raw.impressions),
      reach: int(raw.reach),
      clicks: int(raw.clicks),
      ctr: raw.ctr != null ? num(raw.ctr) : null,
      cpc: raw.cpc != null ? num(raw.cpc) : null,
      cpm: raw.cpm != null ? num(raw.cpm) : null,
      leads,
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
