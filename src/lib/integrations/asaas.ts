import crypto from "crypto"
import { AsaasCustomer, AsaasPayment, AsaasPaymentStatus } from "./types"
import { fetchWithRetry } from "@/lib/utils/retry"

const SANDBOX_URL = "https://sandbox.asaas.com/api/v3"
const PRODUCTION_URL = "https://api.asaas.com/v3"

export interface AsaasConfig {
  apiKey: string
  environment?: "sandbox" | "production"
}

/**
 * Specialised error thrown by AsaasService.request().
 * Carries the HTTP status so callers can distinguish auth/permission errors
 * from generic API failures (ex: 401 → chave invalida; 403 → conta sem acesso).
 */
export class AsaasApiError extends Error {
  public readonly status: number
  public readonly endpoint: string
  public readonly isAuthError: boolean
  public readonly isPermissionError: boolean
  constructor(message: string, status: number, endpoint: string) {
    super(message)
    this.name = "AsaasApiError"
    this.status = status
    this.endpoint = endpoint
    this.isAuthError = status === 401
    this.isPermissionError = status === 403
  }
}

export class AsaasService {
  private apiKey: string
  private baseUrl: string

  constructor(config: AsaasConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.environment === "production" ? PRODUCTION_URL : SANDBOX_URL
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetchWithRetry(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        access_token: this.apiKey,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      let message: string
      if (response.status === 401) {
        message = "Chave de API do Asaas inválida ou expirada. Verifique a integração em Configurações → Integrações."
      } else if (response.status === 403) {
        message = "Conta Asaas sem permissão para esta operação. Verifique os escopos da chave de API."
      } else {
        message = error.errors?.[0]?.description || `Asaas API error: ${response.status}`
      }
      throw new AsaasApiError(message, response.status, endpoint)
    }

    return response.json()
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request("/myAccount")
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  // Customers
  async createCustomer(customer: Omit<AsaasCustomer, "id">): Promise<AsaasCustomer> {
    return this.request("/customers", {
      method: "POST",
      body: JSON.stringify(customer),
    })
  }

  async getCustomer(id: string): Promise<AsaasCustomer> {
    return this.request(`/customers/${id}`)
  }

  async getCustomerByExternalReference(reference: string): Promise<{ data: AsaasCustomer[] }> {
    return this.request(`/customers?externalReference=${reference}`)
  }

  async updateCustomer(id: string, data: Partial<AsaasCustomer>): Promise<AsaasCustomer> {
    return this.request(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  async listCustomers(params?: {
    offset?: number
    limit?: number
    email?: string
    cpfCnpj?: string
  }): Promise<{ data: AsaasCustomer[]; totalCount: number }> {
    const queryParams = new URLSearchParams()
    if (params?.offset != null) queryParams.set("offset", params.offset.toString())
    if (params?.limit) queryParams.set("limit", params.limit.toString())
    if (params?.email) queryParams.set("email", params.email)
    if (params?.cpfCnpj) queryParams.set("cpfCnpj", params.cpfCnpj)

    return this.request(`/customers?${queryParams.toString()}`)
  }

  // Payments
  async createPayment(payment: {
    customer: string
    billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
    value: number
    dueDate: string
    description?: string
    externalReference?: string
    postalService?: boolean
  }): Promise<AsaasPayment> {
    return this.request("/payments", {
      method: "POST",
      body: JSON.stringify(payment),
    })
  }

  async getPayment(id: string): Promise<AsaasPayment> {
    return this.request(`/payments/${id}`)
  }

  async listPayments(params?: {
    customer?: string
    billingType?: string
    status?: AsaasPaymentStatus
    offset?: number
    limit?: number
    dateCreated?: string
    paymentDate?: string
    "dueDate[ge]"?: string
    "dueDate[le]"?: string
  }): Promise<{ data: AsaasPayment[]; totalCount: number }> {
    const queryParams = new URLSearchParams()
    if (params?.customer) queryParams.set("customer", params.customer)
    if (params?.billingType) queryParams.set("billingType", params.billingType)
    if (params?.status) queryParams.set("status", params.status)
    if (params?.offset != null) queryParams.set("offset", params.offset.toString())
    if (params?.limit) queryParams.set("limit", params.limit.toString())
    if (params?.["dueDate[ge]"]) queryParams.set("dueDate[ge]", params["dueDate[ge]"])
    if (params?.["dueDate[le]"]) queryParams.set("dueDate[le]", params["dueDate[le]"])

    return this.request(`/payments?${queryParams.toString()}`)
  }

  async getPaymentPixQrCode(id: string): Promise<{
    encodedImage: string
    payload: string
    expirationDate: string
  }> {
    return this.request(`/payments/${id}/pixQrCode`)
  }

  async getPaymentBankSlip(id: string): Promise<{ url: string }> {
    return this.request(`/payments/${id}/identificationField`)
  }

  async cancelPayment(id: string): Promise<AsaasPayment> {
    return this.request(`/payments/${id}`, { method: "DELETE" })
  }

  async refundPayment(id: string, value?: number): Promise<AsaasPayment> {
    return this.request(`/payments/${id}/refund`, {
      method: "POST",
      body: value ? JSON.stringify({ value }) : undefined,
    })
  }

  /**
   * Marca uma cobrança como recebida em dinheiro / fora do Asaas (receiveInCash).
   * Usado quando o pagamento entrou por fora (PIX direto, transferência) e o
   * admin quer refletir "pago" sem esperar o webhook do Asaas.
   */
  async receivePaymentInCash(
    id: string,
    opts: { paymentDate: string; value: number; notifyCustomer?: boolean },
  ): Promise<AsaasPayment> {
    return this.request(`/payments/${id}/receiveInCash`, {
      method: "POST",
      body: JSON.stringify({
        paymentDate: opts.paymentDate,
        value: opts.value,
        notifyCustomer: opts.notifyCustomer ?? false,
      }),
    })
  }

  // Subscriptions
  async createSubscription(subscription: {
    customer: string
    billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
    value: number
    nextDueDate: string
    cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY"
    description?: string
    externalReference?: string
  }): Promise<{ id: string; customer: string; value: number; nextDueDate: string; status: string }> {
    return this.request("/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscription),
    })
  }

  async getSubscription(id: string): Promise<{ id: string; customer: string; value: number; status: string }> {
    return this.request(`/subscriptions/${id}`)
  }

  async cancelSubscription(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.request(`/subscriptions/${id}`, { method: "DELETE" })
  }

  async listSubscriptions(params?: {
    status?: string
    offset?: number
    limit?: number
  }): Promise<{
    data: Array<{ id: string; customer: string; value: number; cycle: string; status: string }>
    totalCount: number
  }> {
    const query = new URLSearchParams()
    if (params?.status) query.set("status", params.status)
    if (params?.offset != null) query.set("offset", String(params.offset))
    if (params?.limit) query.set("limit", String(params.limit))
    return this.request(`/subscriptions?${query.toString()}`)
  }

  // Webhook validation
  static validateWebhook(
    _payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Asaas uses a simple token comparison — timing-safe to prevent leakage
    const a = Buffer.from(signature)
    const b = Buffer.from(secret)
    if (a.byteLength !== b.byteLength) return false
    return crypto.timingSafeEqual(a, b)
  }

  // Account info
  async getAccountInfo(): Promise<{
    id: string
    name: string
    email: string
    loginEmail: string
    cpfCnpj: string
    company: string
    walletBalance: number
  }> {
    return this.request("/myAccount")
  }

  async getBalance(): Promise<{ balance: number }> {
    return this.request("/finance/balance")
  }
}

// Factory function
export function createAsaasService(credentials: Record<string, string>): AsaasService {
  if (!credentials.api_key) {
    throw new Error("Asaas API Key is required")
  }

  return new AsaasService({
    apiKey: credentials.api_key,
    environment: (credentials.environment as "sandbox" | "production") || "sandbox",
  })
}

// Map Asaas status to internal status
export function mapAsaasStatusToInternal(status: AsaasPaymentStatus): "pending" | "paid" | "overdue" | "cancelled" | "refunded" {
  const statusMap: Record<AsaasPaymentStatus, "pending" | "paid" | "overdue" | "cancelled" | "refunded"> = {
    PENDING: "pending",
    RECEIVED: "paid",
    CONFIRMED: "paid",
    OVERDUE: "overdue",
    REFUNDED: "refunded",
    RECEIVED_IN_CASH: "paid",
    REFUND_REQUESTED: "pending",
    REFUND_IN_PROGRESS: "pending",
    CHARGEBACK_REQUESTED: "pending",
    CHARGEBACK_DISPUTE: "pending",
    AWAITING_CHARGEBACK_REVERSAL: "pending",
    DUNNING_REQUESTED: "overdue",
    DUNNING_RECEIVED: "paid",
    AWAITING_RISK_ANALYSIS: "pending",
  }
  return statusMap[status]
}
