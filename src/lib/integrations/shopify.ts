import {
  ShopifyShop,
  ShopifyOrder,
  ShopifyCustomer,
  ShopifyProduct,
} from "./types"
import { fetchWithRetry } from "@/lib/utils/retry"

export interface ShopifyConfig {
  storeUrl: string
  accessToken: string
  apiVersion?: string
}

export class ShopifyService {
  private storeUrl: string
  private accessToken: string
  private apiVersion: string

  constructor(config: ShopifyConfig) {
    this.storeUrl = config.storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
    this.accessToken = config.accessToken
    this.apiVersion = config.apiVersion || "2025-01"
  }

  private get baseUrl(): string {
    return `https://${this.storeUrl}/admin/api/${this.apiVersion}`
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetchWithRetry(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.errors || `Shopify API error: ${response.status}`
      )
    }

    return response.json()
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getShop()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  // Shop
  async getShop(): Promise<ShopifyShop> {
    const response = await this.request<{ shop: ShopifyShop }>("/shop.json")
    return response.shop
  }

  // Orders
  async listOrders(params?: {
    status?: "open" | "closed" | "cancelled" | "any"
    financial_status?: "pending" | "paid" | "refunded" | "voided"
    fulfillment_status?: "fulfilled" | "unfulfilled" | "partial"
    created_at_min?: string
    created_at_max?: string
    limit?: number
    since_id?: number
  }): Promise<ShopifyOrder[]> {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.set("status", params.status)
    if (params?.financial_status) queryParams.set("financial_status", params.financial_status)
    if (params?.fulfillment_status) queryParams.set("fulfillment_status", params.fulfillment_status)
    if (params?.created_at_min) queryParams.set("created_at_min", params.created_at_min)
    if (params?.created_at_max) queryParams.set("created_at_max", params.created_at_max)
    if (params?.limit) queryParams.set("limit", params.limit.toString())
    if (params?.since_id) queryParams.set("since_id", params.since_id.toString())

    const query = queryParams.toString()
    const endpoint = query ? `/orders.json?${query}` : "/orders.json"

    const response = await this.request<{ orders: ShopifyOrder[] }>(endpoint)
    return response.orders
  }

  async getOrder(orderId: number): Promise<ShopifyOrder> {
    const response = await this.request<{ order: ShopifyOrder }>(`/orders/${orderId}.json`)
    return response.order
  }

  async getOrdersCount(params?: {
    status?: string
    financial_status?: string
    created_at_min?: string
    created_at_max?: string
  }): Promise<number> {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.set("status", params.status)
    if (params?.financial_status) queryParams.set("financial_status", params.financial_status)
    if (params?.created_at_min) queryParams.set("created_at_min", params.created_at_min)
    if (params?.created_at_max) queryParams.set("created_at_max", params.created_at_max)

    const query = queryParams.toString()
    const endpoint = query ? `/orders/count.json?${query}` : "/orders/count.json"

    const response = await this.request<{ count: number }>(endpoint)
    return response.count
  }

  // Customers
  async listCustomers(params?: {
    created_at_min?: string
    created_at_max?: string
    limit?: number
    since_id?: number
  }): Promise<ShopifyCustomer[]> {
    const queryParams = new URLSearchParams()
    if (params?.created_at_min) queryParams.set("created_at_min", params.created_at_min)
    if (params?.created_at_max) queryParams.set("created_at_max", params.created_at_max)
    if (params?.limit) queryParams.set("limit", params.limit.toString())
    if (params?.since_id) queryParams.set("since_id", params.since_id.toString())

    const query = queryParams.toString()
    const endpoint = query ? `/customers.json?${query}` : "/customers.json"

    const response = await this.request<{ customers: ShopifyCustomer[] }>(endpoint)
    return response.customers
  }

  async getCustomer(customerId: number): Promise<ShopifyCustomer> {
    const response = await this.request<{ customer: ShopifyCustomer }>(`/customers/${customerId}.json`)
    return response.customer
  }

  async searchCustomers(query: string): Promise<ShopifyCustomer[]> {
    const response = await this.request<{ customers: ShopifyCustomer[] }>(
      `/customers/search.json?query=${encodeURIComponent(query)}`
    )
    return response.customers
  }

  async getCustomersCount(): Promise<number> {
    const response = await this.request<{ count: number }>("/customers/count.json")
    return response.count
  }

  // Products
  async listProducts(params?: {
    status?: "active" | "archived" | "draft"
    collection_id?: number
    limit?: number
    since_id?: number
  }): Promise<ShopifyProduct[]> {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.set("status", params.status)
    if (params?.collection_id) queryParams.set("collection_id", params.collection_id.toString())
    if (params?.limit) queryParams.set("limit", params.limit.toString())
    if (params?.since_id) queryParams.set("since_id", params.since_id.toString())

    const query = queryParams.toString()
    const endpoint = query ? `/products.json?${query}` : "/products.json"

    const response = await this.request<{ products: ShopifyProduct[] }>(endpoint)
    return response.products
  }

  async getProduct(productId: number): Promise<ShopifyProduct> {
    const response = await this.request<{ product: ShopifyProduct }>(`/products/${productId}.json`)
    return response.product
  }

  async getProductsCount(params?: { status?: string }): Promise<number> {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.set("status", params.status)

    const query = queryParams.toString()
    const endpoint = query ? `/products/count.json?${query}` : "/products/count.json"

    const response = await this.request<{ count: number }>(endpoint)
    return response.count
  }

  // Inventory
  async getInventoryLevels(locationId: number): Promise<
    Array<{
      inventory_item_id: number
      location_id: number
      available: number
    }>
  > {
    const response = await this.request<{
      inventory_levels: Array<{
        inventory_item_id: number
        location_id: number
        available: number
      }>
    }>(`/inventory_levels.json?location_ids=${locationId}`)
    return response.inventory_levels
  }

  // Analytics / Dashboard
  async getDashboardMetrics(params: {
    startDate: string
    endDate: string
  }): Promise<{
    totalOrders: number
    totalRevenue: number
    averageOrderValue: number
    totalCustomers: number
    newCustomers: number
    returningCustomers: number
    topProducts: Array<{ id: number; title: string; quantity: number; revenue: number }>
  }> {
    const [orders, customersCount] = await Promise.all([
      this.listOrders({
        status: "any",
        created_at_min: params.startDate,
        created_at_max: params.endDate,
        limit: 250,
      }),
      this.getCustomersCount(),
    ])

    const totalRevenue = orders.reduce(
      (acc, order) => acc + parseFloat(order.total_price),
      0
    )

    const productSales: Record<
      number,
      { id: number; title: string; quantity: number; revenue: number }
    > = {}

    orders.forEach((order) => {
      order.line_items.forEach((item) => {
        if (!productSales[item.product_id]) {
          productSales[item.product_id] = {
            id: item.product_id,
            title: item.title,
            quantity: 0,
            revenue: 0,
          }
        }
        productSales[item.product_id].quantity += item.quantity
        productSales[item.product_id].revenue +=
          parseFloat(item.price) * item.quantity
      })
    })

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const uniqueCustomerEmails = new Set(orders.map((o) => o.email))

    return {
      totalOrders: orders.length,
      totalRevenue,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      totalCustomers: customersCount,
      newCustomers: uniqueCustomerEmails.size,
      returningCustomers: orders.filter(
        (o) => o.customer.orders_count > 1
      ).length,
      topProducts,
    }
  }
}

// Factory function
export function createShopifyService(
  credentials: Record<string, string>
): ShopifyService {
  if (!credentials.store_url) {
    throw new Error("Store URL is required")
  }
  if (!credentials.access_token) {
    throw new Error("Access Token is required")
  }

  return new ShopifyService({
    storeUrl: credentials.store_url,
    accessToken: credentials.access_token,
    apiVersion: credentials.api_version,
  })
}
