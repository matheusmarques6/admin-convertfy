import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { ShopifyService } from "@/lib/integrations/shopify"
import { logger } from "@/lib/logger"

const log = logger.child("CronTrackingSync")

export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()

    // Get all stores with tracking enabled
    const { data: configs, error: configError } = await supabase
      .from("tracking_config")
      .select("store_id, org_id")
      .eq("enabled", true)

    if (configError || !configs || configs.length === 0) {
      log.info("No stores with tracking enabled")
      return NextResponse.json({ synced: 0, stores: 0 })
    }

    log.info("Starting tracking sync", { storeCount: configs.length })

    const results: Array<{ store_id: string; synced: number; error?: string }> = []

    for (const config of configs) {
      try {
        const synced = await syncStore(supabase, config.store_id, config.org_id)
        results.push({ store_id: config.store_id, synced })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn("Store sync failed", { storeId: config.store_id, error: msg })
        results.push({ store_id: config.store_id, synced: 0, error: msg })
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
    log.info("Tracking sync completed", { totalSynced, stores: configs.length })

    return NextResponse.json({
      stores: configs.length,
      total_synced: totalSynced,
      results,
    })
  } catch (err) {
    log.error("Cron tracking sync failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    )
  }
}

async function syncStore(
  supabase: ReturnType<typeof createAdminClient>,
  storeId: string,
  orgId: string
): Promise<number> {
  const credentials = await getStoreCredentials(storeId)
  const domain = credentials.shopify_store_domain
  const token = credentials.shopify_access_token

  if (!domain || !token) {
    log.info("Shopify credentials not available, skipping", { storeId })
    return 0
  }

  const shopify = new ShopifyService({ storeUrl: domain, accessToken: token })
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const orders = await shopify.listAllOrders({
    created_at_min: thirtyDaysAgo,
    status: "any",
  })

  if (!orders || orders.length === 0) return 0

  const rows = orders
    .filter((order) => order.fulfillments && order.fulfillments.length > 0)
    .map((order) => {
      const fulfillment = order.fulfillments![0]
      return {
        org_id: orgId,
        store_id: storeId,
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
    .filter((row) => row.customer_email)

  if (rows.length === 0) return 0

  let synced = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await supabase
      .from("order_tracking_cache")
      .upsert(batch, { onConflict: "store_id,order_id" })

    if (error) {
      log.warn("Batch upsert failed", { storeId, batch: i, error: error.message })
    } else {
      synced += batch.length
    }
  }

  return synced
}
