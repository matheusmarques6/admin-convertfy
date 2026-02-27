import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { successResponse, errorResponse } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { ShopifyService } from "@/lib/integrations/shopify"
import { logger } from "@/lib/logger"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const log = logger.child("TrackingSync")

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, "tracking:sync", RATE_LIMITS.admin)
  if (rateLimited) return rateLimited

  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { store_id } = body

    if (!store_id) {
      return errorResponse(request, new Error("store_id é obrigatório"), "TrackingSync")
    }

    // Verify store access via RLS (user-scoped client)
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("id, org_id")
      .eq("id", store_id)
      .single()

    if (storeError || !store) {
      return errorResponse(request, new Error("Loja não encontrada"), "TrackingSync")
    }

    // Check tracking is enabled
    const adminClient = createAdminClient()
    const { data: config } = await adminClient
      .from("tracking_config")
      .select("enabled")
      .eq("store_id", store_id)
      .single()

    if (!config?.enabled) {
      return errorResponse(request, new Error("Rastreio não habilitado para esta loja"), "TrackingSync")
    }

    // Get Shopify credentials
    const credentials = await getStoreCredentials(store_id)
    const domain = credentials.shopify_store_domain
    const token = credentials.shopify_access_token

    if (!domain || !token) {
      return errorResponse(request, new Error("Credenciais Shopify não configuradas"), "TrackingSync")
    }

    // Fetch orders from last 30 days
    const shopify = new ShopifyService({ storeUrl: domain, accessToken: token })
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const orders = await shopify.listAllOrders({
      created_at_min: thirtyDaysAgo,
      status: "any",
    })

    if (!orders || orders.length === 0) {
      return successResponse(request, { synced: 0, message: "Nenhum pedido encontrado" })
    }

    // Build cache rows
    const rows = orders
      .filter((order) => order.fulfillments && order.fulfillments.length > 0)
      .map((order) => {
        const fulfillment = order.fulfillments![0]
        return {
          org_id: store.org_id,
          store_id: store_id,
          order_id: String(order.id),
          order_number: order.name || `#${order.order_number}`,
          customer_email: order.email?.toLowerCase() || "",
          customer_name: order.customer
            ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
            : "",
          tracking_code: fulfillment.tracking_number || null,
          tracking_carrier: fulfillment.tracking_company || null,
          fulfillment_status: order.fulfillment_status || "unknown",
          line_items: order.line_items.map((item) => ({
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
          total_price: parseFloat(order.total_price) || 0,
          currency: order.currency,
          order_created_at: order.created_at,
          source: "shopify" as const,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }
      })
      .filter((row) => row.customer_email) // Skip orders without email

    if (rows.length === 0) {
      return successResponse(request, { synced: 0, message: "Nenhum pedido com fulfillment encontrado" })
    }

    // Upsert in batches of 100
    let synced = 0
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error: upsertError } = await adminClient
        .from("order_tracking_cache")
        .upsert(batch, { onConflict: "store_id,order_id" })

      if (upsertError) {
        log.warn("Batch upsert failed", { batch: i, error: upsertError.message })
      } else {
        synced += batch.length
      }
    }

    log.info("Tracking sync completed", { storeId: store_id, synced, total: orders.length })

    return successResponse(request, {
      synced,
      total_orders: orders.length,
      fulfilled_orders: rows.length,
    })
  } catch (error) {
    return errorResponse(request, error, "TrackingSync")
  }
}
