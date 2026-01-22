import { WiseBalance, WiseProfile, WiseStatementResponse, WiseTransaction } from "./types"

const SANDBOX_URL = "https://api.sandbox.transferwise.tech"
const PRODUCTION_URL = "https://api.wise.com"

export interface WiseConfig {
  apiToken: string
  profileId: string
  environment?: "sandbox" | "production"
}

export class WiseService {
  private apiToken: string
  private profileId: string
  private baseUrl: string

  constructor(config: WiseConfig) {
    this.apiToken = config.apiToken
    this.profileId = config.profileId
    this.baseUrl = config.environment === "production" ? PRODUCTION_URL : SANDBOX_URL
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || error.error || `Wise API error: ${response.status}`)
    }

    return response.json()
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getProfiles()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  // Get all profiles for the user
  async getProfiles(): Promise<WiseProfile[]> {
    return this.request("/v1/profiles")
  }

  // Get all balances for a profile
  async getBalances(): Promise<WiseBalance[]> {
    return this.request(`/v4/profiles/${this.profileId}/balances?types=STANDARD,SAVINGS`)
  }

  // Get a specific balance
  async getBalance(balanceId: number): Promise<WiseBalance> {
    return this.request(`/v4/profiles/${this.profileId}/balances/${balanceId}`)
  }

  // Get balance statement (transactions)
  async getStatement(
    balanceId: number,
    params: {
      currency: string
      intervalStart: string // ISO date
      intervalEnd: string // ISO date
      type?: "COMPACT" | "FLAT"
    }
  ): Promise<WiseStatementResponse> {
    const queryParams = new URLSearchParams({
      currency: params.currency,
      intervalStart: params.intervalStart,
      intervalEnd: params.intervalEnd,
      type: params.type || "COMPACT",
    })

    return this.request(
      `/v1/profiles/${this.profileId}/balance-statements/${balanceId}/statement.json?${queryParams.toString()}`
    )
  }

  // Get transactions for all balances in a date range
  async getAllTransactions(params: {
    intervalStart: string
    intervalEnd: string
  }): Promise<{ balanceId: number; currency: string; transactions: WiseTransaction[] }[]> {
    const balances = await this.getBalances()
    const results: { balanceId: number; currency: string; transactions: WiseTransaction[] }[] = []

    for (const balance of balances) {
      try {
        const statement = await this.getStatement(balance.id, {
          currency: balance.currency,
          intervalStart: params.intervalStart,
          intervalEnd: params.intervalEnd,
        })

        // Filter only incoming transactions (CREDIT type)
        const incomingTransactions = statement.transactions.filter(
          (t) => t.type === "CREDIT" || t.amount.value > 0
        )

        if (incomingTransactions.length > 0) {
          results.push({
            balanceId: balance.id,
            currency: balance.currency,
            transactions: incomingTransactions,
          })
        }
      } catch (error) {
        // Skip balances that fail (e.g., empty or restricted)
        console.warn(`Failed to get statement for balance ${balance.id}:`, error)
      }
    }

    return results
  }

  // Get only received payments (credits)
  async getReceivedPayments(params: {
    intervalStart: string
    intervalEnd: string
  }): Promise<{
    currency: string
    transaction: WiseTransaction
  }[]> {
    const allTransactions = await this.getAllTransactions(params)
    const receivedPayments: { currency: string; transaction: WiseTransaction }[] = []

    for (const { currency, transactions } of allTransactions) {
      for (const transaction of transactions) {
        // Only include incoming money (positive amounts)
        if (transaction.amount.value > 0) {
          receivedPayments.push({ currency, transaction })
        }
      }
    }

    // Sort by date, most recent first
    receivedPayments.sort((a, b) =>
      new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime()
    )

    return receivedPayments
  }

  // Get total received by currency
  async getTotalReceived(params: {
    intervalStart: string
    intervalEnd: string
  }): Promise<Record<string, number>> {
    const payments = await this.getReceivedPayments(params)
    const totals: Record<string, number> = {}

    for (const { currency, transaction } of payments) {
      if (!totals[currency]) {
        totals[currency] = 0
      }
      totals[currency] += transaction.amount.value
    }

    return totals
  }
}

// Factory function
export function createWiseService(credentials: Record<string, string>): WiseService {
  if (!credentials.api_token) {
    throw new Error("Wise API Token is required")
  }
  if (!credentials.profile_id) {
    throw new Error("Wise Profile ID is required")
  }

  return new WiseService({
    apiToken: credentials.api_token,
    profileId: credentials.profile_id,
    environment: (credentials.environment as "sandbox" | "production") || "production",
  })
}
