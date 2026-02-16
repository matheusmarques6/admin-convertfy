import { GoogleAdsAccount, GoogleAdsCampaign, GoogleAdsMetrics } from "./types"
import { fetchWithRetry } from "@/lib/utils/retry"

const GOOGLE_ADS_API_URL = "https://googleads.googleapis.com/v15"

export interface GoogleAdsConfig {
  accessToken: string
  customerId: string
  managerId?: string
  developerToken?: string
}

export class GoogleAdsService {
  private accessToken: string
  private customerId: string
  private managerId?: string
  private developerToken: string

  constructor(config: GoogleAdsConfig) {
    this.accessToken = config.accessToken
    this.customerId = config.customerId.replace(/-/g, "")
    this.managerId = config.managerId?.replace(/-/g, "")
    this.developerToken = config.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ""
  }

  private async request<T>(
    query: string,
    customerId?: string
  ): Promise<T> {
    const targetCustomerId = customerId || this.customerId
    const url = `${GOOGLE_ADS_API_URL}/customers/${targetCustomerId}/googleAds:searchStream`

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
      "developer-token": this.developerToken,
    }

    if (this.managerId) {
      headers["login-customer-id"] = this.managerId
    }

    const response = await fetchWithRetry(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.error?.message || `Google Ads API error: ${response.status}`
      )
    }

    const data = await response.json()
    return data
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getAccount()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  // Account
  async getAccount(): Promise<GoogleAdsAccount> {
    const query = `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.manager
      FROM customer
      LIMIT 1
    `

    const response = await this.request<Array<{ results: Array<{ customer: GoogleAdsAccount }> }>>(query)
    if (!response.length || !response[0].results?.length) {
      throw new Error("Account not found")
    }

    const customer = response[0].results[0].customer
    return {
      customer_id: customer.customer_id,
      descriptive_name: customer.descriptive_name,
      currency_code: customer.currency_code,
      time_zone: customer.time_zone,
      manager: customer.manager,
    }
  }

  // Campaigns
  async listCampaigns(params?: {
    status?: "ENABLED" | "PAUSED" | "REMOVED"
  }): Promise<GoogleAdsCampaign[]> {
    let query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
    `

    if (params?.status) {
      query += ` WHERE campaign.status = '${params.status}'`
    }

    const response = await this.request<Array<{ results: Array<{ campaign: unknown; campaign_budget: { amount_micros: string } }> }>>(query)

    if (!response.length) return []

    return response[0].results.map((result) => ({
      ...(result.campaign as GoogleAdsCampaign),
      budget_amount_micros: parseInt(result.campaign_budget?.amount_micros || "0"),
    }))
  }

  async getCampaign(campaignId: string): Promise<GoogleAdsCampaign | null> {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.id = ${campaignId}
    `

    const response = await this.request<Array<{ results: Array<{ campaign: unknown; campaign_budget: { amount_micros: string } }> }>>(query)

    if (!response.length || !response[0].results?.length) return null

    const result = response[0].results[0]
    return {
      ...(result.campaign as GoogleAdsCampaign),
      budget_amount_micros: parseInt(result.campaign_budget?.amount_micros || "0"),
    }
  }

  // Metrics
  async getAccountMetrics(params: {
    startDate: string // YYYY-MM-DD
    endDate: string // YYYY-MM-DD
  }): Promise<GoogleAdsMetrics[]> {
    const query = `
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.average_cpc,
        metrics.ctr,
        segments.date
      FROM customer
      WHERE segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
      ORDER BY segments.date DESC
    `

    const response = await this.request<Array<{ results: Array<{ metrics: unknown; segments: { date: string } }> }>>(query)

    if (!response.length) return []

    return response[0].results.map((result) => {
      const metrics = result.metrics as Record<string, unknown>
      return {
        impressions: parseInt(metrics.impressions as string) || 0,
        clicks: parseInt(metrics.clicks as string) || 0,
        cost_micros: parseInt(metrics.cost_micros as string) || 0,
        conversions: parseFloat(metrics.conversions as string) || 0,
        conversions_value: parseFloat(metrics.conversions_value as string) || 0,
        average_cpc: parseFloat(metrics.average_cpc as string) || 0,
        ctr: parseFloat(metrics.ctr as string) || 0,
        date: result.segments.date,
      }
    })
  }

  async getCampaignMetrics(
    campaignId: string,
    params: { startDate: string; endDate: string }
  ): Promise<GoogleAdsMetrics[]> {
    const query = `
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.average_cpc,
        metrics.ctr,
        segments.date
      FROM campaign
      WHERE campaign.id = ${campaignId}
        AND segments.date BETWEEN '${params.startDate}' AND '${params.endDate}'
      ORDER BY segments.date DESC
    `

    const response = await this.request<Array<{ results: Array<{ metrics: unknown; segments: { date: string } }> }>>(query)

    if (!response.length) return []

    return response[0].results.map((result) => {
      const metrics = result.metrics as Record<string, unknown>
      return {
        impressions: parseInt(metrics.impressions as string) || 0,
        clicks: parseInt(metrics.clicks as string) || 0,
        cost_micros: parseInt(metrics.cost_micros as string) || 0,
        conversions: parseFloat(metrics.conversions as string) || 0,
        conversions_value: parseFloat(metrics.conversions_value as string) || 0,
        average_cpc: parseFloat(metrics.average_cpc as string) || 0,
        ctr: parseFloat(metrics.ctr as string) || 0,
        date: result.segments.date,
      }
    })
  }

  // Dashboard metrics
  async getDashboardMetrics(params: {
    startDate: string
    endDate: string
  }): Promise<{
    totalSpend: number
    totalConversions: number
    totalConversionsValue: number
    roas: number
    impressions: number
    clicks: number
    ctr: number
    cpc: number
  }> {
    const metrics = await this.getAccountMetrics(params)

    if (!metrics.length) {
      return {
        totalSpend: 0,
        totalConversions: 0,
        totalConversionsValue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
      }
    }

    const totals = metrics.reduce(
      (acc, m) => ({
        cost_micros: acc.cost_micros + m.cost_micros,
        conversions: acc.conversions + m.conversions,
        conversions_value: acc.conversions_value + m.conversions_value,
        impressions: acc.impressions + m.impressions,
        clicks: acc.clicks + m.clicks,
      }),
      {
        cost_micros: 0,
        conversions: 0,
        conversions_value: 0,
        impressions: 0,
        clicks: 0,
      }
    )

    const totalSpend = totals.cost_micros / 1_000_000

    return {
      totalSpend,
      totalConversions: totals.conversions,
      totalConversionsValue: totals.conversions_value,
      roas: totalSpend > 0 ? totals.conversions_value / totalSpend : 0,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpc: totals.clicks > 0 ? totalSpend / totals.clicks : 0,
    }
  }
}

// Factory function
export function createGoogleAdsService(
  credentials: Record<string, string>
): GoogleAdsService {
  if (!credentials.access_token) {
    throw new Error("Google Access Token is required")
  }
  if (!credentials.customer_id) {
    throw new Error("Customer ID is required")
  }

  return new GoogleAdsService({
    accessToken: credentials.access_token,
    customerId: credentials.customer_id,
    managerId: credentials.manager_id,
    developerToken: credentials.developer_token,
  })
}

// Helper to format customer ID
export function formatCustomerId(id: string): string {
  const cleaned = id.replace(/\D/g, "")
  if (cleaned.length !== 10) return id
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
}
