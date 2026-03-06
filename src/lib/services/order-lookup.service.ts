import { createAdminClient } from "@/lib/supabase/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { ShopifyService } from "@/lib/integrations/shopify"
import { klaviyoRequest } from "@/lib/integrations/klaviyo"
import { logger } from "@/lib/logger"

const log = logger.child("OrderLookup")

// =============================================
// Types
// =============================================

export interface OrderLookupResult {
  found: boolean
  source: "shopify" | "klaviyo" | "cache"
  order: {
    order_number: string
    customer_name: string
    tracking_code: string | null
    carrier: string | null
    items: Array<{
      title: string
      quantity: number
      price: string
      image_url?: string
    }>
    total_price: string
    currency: string
    order_date: string
    fulfillment_status: string
  } | null
}

// =============================================
// Service
// =============================================

export class OrderLookupService {
  /**
   * Lookup chain: Shopify → Klaviyo → Cache local
   * Returns all orders found for the given email.
   */
  async findByEmail(
    storeId: string,
    email: string
  ): Promise<OrderLookupResult[]> {
    const normalizedEmail = email.toLowerCase().trim()

    // 1. Try Shopify first
    const shopifyResults = await this.lookupShopify(storeId, normalizedEmail)
    if (shopifyResults.length > 0) {
      // Cache results for future lookups
      await this.cacheOrders(storeId, normalizedEmail, shopifyResults).catch((err) =>
        log.warn("Failed to cache Shopify orders", { error: err.message })
      )
      return shopifyResults
    }

    // 2. Try Klaviyo
    const klaviyoResults = await this.lookupKlaviyo(storeId, normalizedEmail)
    if (klaviyoResults.length > 0) {
      await this.cacheOrders(storeId, normalizedEmail, klaviyoResults).catch((err) =>
        log.warn("Failed to cache Klaviyo orders", { error: err.message })
      )
      return klaviyoResults
    }

    // 3. Try local cache (30 days)
    const cacheResults = await this.lookupCache(storeId, normalizedEmail)
    if (cacheResults.length > 0) {
      return cacheResults
    }

    return []
  }

  /**
   * Direct lookup by tracking code in the local cache.
   */
  async findByTrackingCode(
    storeId: string,
    trackingCode: string
  ): Promise<OrderLookupResult | null> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("order_tracking_cache")
      .select("*")
      .eq("store_id", storeId)
      .eq("tracking_code", trackingCode)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .single()

    if (error || !data) return null

    return {
      found: true,
      source: "cache",
      order: {
        order_number: data.order_number,
        customer_name: data.customer_name || "",
        tracking_code: data.tracking_code,
        carrier: data.tracking_carrier,
        items: (data.line_items as Array<{
          title: string
          quantity: number
          price: string
          image_url?: string
        }>) || [],
        total_price: String(data.total_price || "0"),
        currency: data.currency || "BRL",
        order_date: data.order_created_at || data.created_at,
        fulfillment_status: data.fulfillment_status || "unknown",
      },
    }
  }

  // =============================================
  // Shopify Lookup (AC 4.1.7)
  // =============================================

  private async lookupShopify(
    storeId: string,
    email: string
  ): Promise<OrderLookupResult[]> {
    try {
      const credentials = await getStoreCredentials(storeId)
      const domain = credentials.shopify_store_domain
      const token = credentials.shopify_access_token

      if (!domain || !token) {
        log.info("Shopify credentials not available", { storeId })
        return []
      }

      const shopify = new ShopifyService({
        storeUrl: domain,
        accessToken: token,
      })

      const orders = await shopify.getOrdersByEmail(email)
      if (!orders || orders.length === 0) return []

      return orders.map((order) => {
        // Extract tracking from first fulfillment
        const fulfillment = order.fulfillments?.[0]

        return {
          found: true,
          source: "shopify" as const,
          order: {
            order_number: order.name || `#${order.order_number}`,
            customer_name: order.customer
              ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
              : "",
            tracking_code: fulfillment?.tracking_number || null,
            carrier: fulfillment?.tracking_company || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items: order.line_items.map((item: any) => ({
              title: item.title,
              quantity: item.quantity,
              price: item.price,
              image_url: item.image?.src || null,
            })),
            total_price: order.total_price,
            currency: order.currency,
            order_date: order.created_at,
            fulfillment_status: order.fulfillment_status || "unfulfilled",
          },
        }
      })
    } catch (err) {
      log.warn("Shopify lookup failed", {
        storeId,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  // =============================================
  // Klaviyo Lookup (AC 4.1.8)
  // =============================================

  private async lookupKlaviyo(
    storeId: string,
    email: string
  ): Promise<OrderLookupResult[]> {
    try {
      const credentials = await getStoreCredentials(storeId)
      const apiKey =
        credentials.klaviyo_private_key || credentials.klaviyo_api_key

      if (!apiKey) {
        log.info("Klaviyo credentials not available", { storeId })
        return []
      }

      // 1. Find profile by email
      const profileResponse = await klaviyoRequest<{
        data: Array<{
          id: string
          attributes: {
            email: string
            first_name: string
            last_name: string
          }
        }>
      }>(apiKey, `/profiles/?filter=equals(email,"${encodeURIComponent(email)}")`)

      const profile = profileResponse?.data?.[0]
      if (!profile) return []

      // 2. Get Fulfilled Order events for this profile
      const eventsResponse = await klaviyoRequest<{
        data: Array<{
          attributes: {
            metric_id: string
            event_properties: Record<string, unknown>
            datetime: string
          }
        }>
      }>(
        apiKey,
        `/events/?filter=equals(profile_id,"${profile.id}")&sort=-datetime&page[size]=10`
      )

      if (!eventsResponse?.data) return []

      // Filter for order-related events (Fulfilled Order, Placed Order)
      const orderEvents = eventsResponse.data.filter((event) => {
        const props = event.attributes.event_properties
        // Events with order data typically have these fields
        return props && (props.OrderId || props.order_id || props.$value)
      })

      if (orderEvents.length === 0) return []

      const profileName = `${profile.attributes.first_name || ""} ${profile.attributes.last_name || ""}`.trim()

      return orderEvents.map((event) => {
        const props = event.attributes.event_properties
        const items = (props.Items || props.items || []) as Array<{
          ProductName?: string
          product_name?: string
          Quantity?: number
          quantity?: number
          ItemPrice?: number
          item_price?: number
        }>

        return {
          found: true,
          source: "klaviyo" as const,
          order: {
            order_number: String(
              props.OrderId || props.order_id || props.$event_id || "Unknown"
            ),
            customer_name: profileName,
            tracking_code:
              (props.tracking_number as string) ||
              (props.TrackingNumber as string) ||
              null,
            carrier:
              (props.tracking_company as string) ||
              (props.TrackingCompany as string) ||
              null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items: items.map((item: any) => ({
              title: String(item.ProductName || item.product_name || "Item"),
              quantity: Number(item.Quantity || item.quantity || 1),
              price: String(item.ItemPrice || item.item_price || "0"),
              image_url: item.ImageURL || item.image_url || item.ProductImageURL || null,
            })),
            total_price: String(props.$value || props.value || "0"),
            currency: String(props.Currency || props.currency || "BRL"),
            order_date: event.attributes.datetime,
            fulfillment_status: props.tracking_number || props.TrackingNumber
              ? "fulfilled"
              : "unknown",
          },
        }
      })
    } catch (err) {
      log.warn("Klaviyo lookup failed", {
        storeId,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  // =============================================
  // Cache Lookup (AC 4.1.9)
  // =============================================

  private async lookupCache(
    storeId: string,
    email: string
  ): Promise<OrderLookupResult[]> {
    try {
      const supabase = createAdminClient()

      const { data, error } = await supabase
        .from("order_tracking_cache")
        .select("*")
        .eq("store_id", storeId)
        .ilike("customer_email", email)
        .gt("expires_at", new Date().toISOString())
        .order("order_created_at", { ascending: false })
        .limit(20)

      if (error || !data || data.length === 0) return []

      return data.map((row) => ({
        found: true,
        source: "cache" as const,
        order: {
          order_number: row.order_number,
          customer_name: row.customer_name || "",
          tracking_code: row.tracking_code,
          carrier: row.tracking_carrier,
          items: (row.line_items as Array<{
            title: string
            quantity: number
            price: string
            image_url?: string
          }>) || [],
          total_price: String(row.total_price || "0"),
          currency: row.currency || "BRL",
          order_date: row.order_created_at || row.created_at,
          fulfillment_status: row.fulfillment_status || "unknown",
        },
      }))
    } catch (err) {
      log.warn("Cache lookup failed", {
        storeId,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  // =============================================
  // Cache Writer
  // =============================================

  private async cacheOrders(
    storeId: string,
    email: string,
    results: OrderLookupResult[]
  ): Promise<void> {
    const supabase = createAdminClient()

    // Get org_id for the store
    const { data: store } = await supabase
      .from("client_stores")
      .select("org_id")
      .eq("id", storeId)
      .single()

    if (!store?.org_id) return

    const rows = results
      .filter((r) => r.order)
      .map((r) => ({
        org_id: store.org_id,
        store_id: storeId,
        order_id: r.order!.order_number,
        order_number: r.order!.order_number,
        customer_email: email,
        customer_name: r.order!.customer_name,
        tracking_code: r.order!.tracking_code,
        tracking_carrier: r.order!.carrier,
        fulfillment_status: r.order!.fulfillment_status,
        line_items: r.order!.items,
        total_price: parseFloat(r.order!.total_price) || 0,
        currency: r.order!.currency,
        order_created_at: r.order!.order_date,
        source: r.source,
        expires_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
      }))

    if (rows.length === 0) return

    // Upsert — update if store_id + order_id already exists
    await supabase
      .from("order_tracking_cache")
      .upsert(rows, { onConflict: "store_id,order_id" })
  }
}
