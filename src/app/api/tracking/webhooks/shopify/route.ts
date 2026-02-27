import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ShopifyTrackingWebhook")

function verifyShopifyWebhook(
  body: string,
  hmacHeader: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64")
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  )
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const topic = request.headers.get("x-shopify-topic") || ""
    const shopDomain = request.headers.get("x-shopify-shop-domain") || ""
    const hmac = request.headers.get("x-shopify-hmac-sha256") || ""

    log.info(`Webhook received: ${topic} from ${shopDomain}`)

    const adminClient = createAdminClient()

    // Find the tracking store by shop domain
    const { data: trackingStore } = await adminClient
      .from("tracking_stores")
      .select("id, org_id, webhook_secret")
      .eq("shop_domain", shopDomain)
      .eq("is_active", true)
      .single()

    if (!trackingStore) {
      log.warn(`No tracking store found for ${shopDomain}`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Verify webhook signature if secret is configured
    if (trackingStore.webhook_secret && hmac) {
      const isValid = verifyShopifyWebhook(rawBody, hmac, trackingStore.webhook_secret)
      if (!isValid) {
        log.error("Invalid webhook signature", { shopDomain })
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    const payload = JSON.parse(rawBody)

    switch (topic) {
      case "orders/create":
      case "orders/updated":
        await handleOrder(adminClient, trackingStore, payload)
        break

      case "orders/fulfilled":
        await handleOrder(adminClient, trackingStore, payload)
        break

      case "fulfillments/create":
      case "fulfillments/update":
        await handleFulfillment(adminClient, trackingStore, payload)
        break

      default:
        log.info(`Unhandled topic: ${topic}`)
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    log.error("Webhook processing error:", error)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}

async function handleOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  trackingStore: { id: string; org_id: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any
) {
  const shopifyOrderId = String(order.id)

  // Extract line items for rich widget display
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItems = (order.line_items || []).map((item: any) => ({
    title: item.title || "",
    quantity: item.quantity || 1,
    price: item.price || "0",
    image_url: item.image?.src || null,
    product_id: item.product_id || null,
    variant_id: item.variant_id || null,
    sku: item.sku || null,
  }))

  // Extract shipping address
  const shippingAddr = order.shipping_address
    ? {
        first_name: order.shipping_address.first_name || "",
        last_name: order.shipping_address.last_name || "",
        address1: order.shipping_address.address1 || "",
        city: order.shipping_address.city || "",
        province: order.shipping_address.province || "",
        country: order.shipping_address.country || "",
        zip: order.shipping_address.zip || "",
      }
    : {}

  // Upsert order
  const orderData = {
    tracking_store_id: trackingStore.id,
    org_id: trackingStore.org_id,
    shopify_order_id: shopifyOrderId,
    shopify_order_number: String(order.order_number || ""),
    order_name: order.name || `#${order.order_number}`,
    customer_name: order.customer
      ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
      : "",
    customer_email: order.customer?.email || order.email || "",
    customer_phone: order.customer?.phone || order.phone || "",
    financial_status: order.financial_status || "",
    fulfillment_status: order.fulfillment_status || "unfulfilled",
    total_price: parseFloat(order.total_price) || 0,
    currency: order.currency || "BRL",
    order_created_at: order.created_at,
    line_items: lineItems,
    shipping_address: shippingAddr,
  }

  // Check if order exists
  const { data: existing } = await adminClient
    .from("tracking_orders")
    .select("id")
    .eq("tracking_store_id", trackingStore.id)
    .eq("shopify_order_id", shopifyOrderId)
    .single()

  if (existing) {
    await adminClient
      .from("tracking_orders")
      .update(orderData)
      .eq("id", existing.id)
  } else {
    await adminClient
      .from("tracking_orders")
      .insert(orderData)
  }

  // Process fulfillments if present
  if (order.fulfillments && order.fulfillments.length > 0) {
    for (const fulfillment of order.fulfillments) {
      await handleFulfillment(adminClient, trackingStore, {
        ...fulfillment,
        order_id: order.id,
      })
    }
  }
}

async function handleFulfillment(
  adminClient: ReturnType<typeof createAdminClient>,
  trackingStore: { id: string; org_id: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fulfillment: any
) {
  const orderId = String(fulfillment.order_id)
  const trackingNumber = fulfillment.tracking_number || fulfillment.tracking_numbers?.[0]

  if (!trackingNumber) return

  // Find the order
  const { data: order } = await adminClient
    .from("tracking_orders")
    .select("id")
    .eq("tracking_store_id", trackingStore.id)
    .eq("shopify_order_id", orderId)
    .single()

  if (!order) {
    log.warn(`Order not found for fulfillment: ${orderId}`)
    return
  }

  // Update order fulfillment status
  await adminClient
    .from("tracking_orders")
    .update({
      fulfillment_status: fulfillment.status || "fulfilled",
      shipped_at: fulfillment.created_at || new Date().toISOString(),
    })
    .eq("id", order.id)

  // Upsert tracking code
  const { data: existingCode } = await adminClient
    .from("tracking_codes")
    .select("id")
    .eq("tracking_order_id", order.id)
    .eq("tracking_number", trackingNumber)
    .single()

  const carrierName = fulfillment.tracking_company || ""

  const codeData = {
    tracking_order_id: order.id,
    tracking_store_id: trackingStore.id,
    org_id: trackingStore.org_id,
    tracking_number: trackingNumber,
    carrier_name: carrierName,
    carrier_code: carrierName.toLowerCase().replace(/\s+/g, ""),
    status: fulfillment.shipment_status || "in_transit",
  }

  if (existingCode) {
    await adminClient
      .from("tracking_codes")
      .update(codeData)
      .eq("id", existingCode.id)
  } else {
    await adminClient
      .from("tracking_codes")
      .insert(codeData)
  }

  log.info(`Tracking code upserted: ${trackingNumber} for order ${orderId}`)
}
