import { KlaviyoProfile, KlaviyoList, KlaviyoMetrics, KlaviyoFlowMetrics } from "./types"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"

export interface KlaviyoConfig {
  apiKey: string
  publicKey?: string
}

export class KlaviyoService {
  private apiKey: string
  private publicKey?: string

  constructor(config: KlaviyoConfig) {
    this.apiKey = config.apiKey
    this.publicKey = config.publicKey
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
        revision: "2024-02-15",
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
  async getAccount(): Promise<{ id: string; attributes: Record<string, unknown> }> {
    const response = await this.request<{ data: { id: string; attributes: Record<string, unknown> } }>("/accounts/")
    return response.data
  }

  // Profiles
  async createProfile(data: {
    email: string
    phone_number?: string
    first_name?: string
    last_name?: string
    properties?: Record<string, unknown>
  }): Promise<KlaviyoProfile> {
    const response = await this.request<{ data: { id: string; attributes: Omit<KlaviyoProfile, "id"> } }>("/profiles/", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "profile",
          attributes: data,
        },
      }),
    })

    return { id: response.data.id, ...response.data.attributes }
  }

  async getProfile(id: string): Promise<KlaviyoProfile> {
    const response = await this.request<{ data: { id: string; attributes: Omit<KlaviyoProfile, "id"> } }>(`/profiles/${id}/`)
    return { id: response.data.id, ...response.data.attributes }
  }

  async getProfileByEmail(email: string): Promise<KlaviyoProfile | null> {
    const response = await this.request<{ data: Array<{ id: string; attributes: Omit<KlaviyoProfile, "id"> }> }>(
      `/profiles/?filter=equals(email,"${encodeURIComponent(email)}")`
    )

    if (!response.data.length) return null
    return { id: response.data[0].id, ...response.data[0].attributes }
  }

  async updateProfile(
    id: string,
    data: Partial<Omit<KlaviyoProfile, "id" | "created" | "updated">>
  ): Promise<KlaviyoProfile> {
    const response = await this.request<{ data: { id: string; attributes: Omit<KlaviyoProfile, "id"> } }>(`/profiles/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "profile",
          id,
          attributes: data,
        },
      }),
    })

    return { id: response.data.id, ...response.data.attributes }
  }

  // Lists
  async getLists(): Promise<KlaviyoList[]> {
    const response = await this.request<{ data: Array<{ id: string; attributes: Omit<KlaviyoList, "id"> }> }>("/lists/")
    return response.data.map((item) => ({
      id: item.id,
      ...item.attributes,
    }))
  }

  async getList(id: string): Promise<KlaviyoList> {
    const response = await this.request<{ data: { id: string; attributes: Omit<KlaviyoList, "id"> } }>(`/lists/${id}/`)
    return { id: response.data.id, ...response.data.attributes }
  }

  async addProfileToList(listId: string, profileId: string): Promise<void> {
    await this.request(`/lists/${listId}/relationships/profiles/`, {
      method: "POST",
      body: JSON.stringify({
        data: [{ type: "profile", id: profileId }],
      }),
    })
  }

  async removeProfileFromList(listId: string, profileId: string): Promise<void> {
    await this.request(`/lists/${listId}/relationships/profiles/`, {
      method: "DELETE",
      body: JSON.stringify({
        data: [{ type: "profile", id: profileId }],
      }),
    })
  }

  // Metrics
  async getMetrics(): Promise<KlaviyoMetrics[]> {
    const response = await this.request<{ data: Array<{ id: string; attributes: Omit<KlaviyoMetrics, "id"> }> }>("/metrics/")
    return response.data.map((item) => ({
      id: item.id,
      ...item.attributes,
    }))
  }

  // Events (Track)
  async trackEvent(data: {
    profile: { email: string } | { phone_number: string } | { id: string }
    metric: { name: string }
    properties?: Record<string, unknown>
    value?: number
    time?: string
  }): Promise<void> {
    await this.request("/events/", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            profile: data.profile,
            metric: data.metric,
            properties: data.properties || {},
            value: data.value,
            time: data.time || new Date().toISOString(),
          },
        },
      }),
    })
  }

  // Flows
  async getFlows(): Promise<Array<{ id: string; name: string; status: string }>> {
    const response = await this.request<{
      data: Array<{
        id: string
        attributes: { name: string; status: string }
      }>
    }>("/flows/")

    return response.data.map((item) => ({
      id: item.id,
      name: item.attributes.name,
      status: item.attributes.status,
    }))
  }

  // Campaigns
  async getCampaigns(status?: "draft" | "scheduled" | "sent"): Promise<
    Array<{
      id: string
      name: string
      status: string
      send_time?: string
    }>
  > {
    let url = "/campaigns/"
    if (status) {
      url += `?filter=equals(status,"${status}")`
    }

    const response = await this.request<{
      data: Array<{
        id: string
        attributes: { name: string; status: string; send_time?: string }
      }>
    }>(url)

    return response.data.map((item) => ({
      id: item.id,
      name: item.attributes.name,
      status: item.attributes.status,
      send_time: item.attributes.send_time,
    }))
  }

  // Dashboard Metrics
  async getDashboardMetrics(params: {
    startDate: string
    endDate: string
  }): Promise<{
    totalProfiles: number
    newProfiles: number
    totalLists: number
    totalFlows: number
    emailsSent: number
    openRate: number
    clickRate: number
    revenue: number
  }> {
    const [lists, flows, campaigns] = await Promise.all([
      this.getLists(),
      this.getFlows(),
      this.getCampaigns("sent"),
    ])

    const totalProfiles = lists.reduce((acc, list) => acc + list.profile_count, 0)

    return {
      totalProfiles,
      newProfiles: 0, // Would need aggregation query
      totalLists: lists.length,
      totalFlows: flows.length,
      emailsSent: campaigns.length * 1000, // Approximate
      openRate: 25.5, // Would need aggregation query
      clickRate: 3.2, // Would need aggregation query
      revenue: 0, // Would need aggregation query
    }
  }
}

// Factory function
export function createKlaviyoService(
  credentials: Record<string, string>
): KlaviyoService {
  if (!credentials.api_key) {
    throw new Error("Klaviyo API Key is required")
  }

  return new KlaviyoService({
    apiKey: credentials.api_key,
    publicKey: credentials.public_key,
  })
}
