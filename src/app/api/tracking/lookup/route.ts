import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { OrderLookupService, OrderLookupResult } from "@/lib/services/order-lookup.service"
import { translateEventDescription } from "@/lib/tracking/translate-events"

const log = logger.child("TrackingLookup")

const LOOKUP_RATE_LIMIT = { limit: 20, windowSeconds: 60 }

/** Public CORS — this endpoint is called from merchant storefronts */
const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

/** Map OrderLookupResult[] to the widget-compatible format */
function mapLookupResults(lookupResults: OrderLookupResult[]) {
  return lookupResults
    .filter((r) => r.found && r.order)
    .map((r) => {
      const o = r.order!
      const fulfillmentToStatus: Record<string, string> = {
        fulfilled: "delivered",
        unfulfilled: "pending",
        partial: "in_transit",
      }
      const status = fulfillmentToStatus[o.fulfillment_status] || "pending"

      return {
        order: {
          id: `${r.source}-${o.order_number}`,
          order_name: o.order_number,
          customer_name: o.customer_name,
          customer_email: null,
          order_created_at: o.order_date,
          shipped_at: o.fulfillment_status === "fulfilled" ? o.order_date : null,
          delivered_at: o.fulfillment_status === "fulfilled" ? o.order_date : null,
          total_price: parseFloat(o.total_price) || null,
          currency: o.currency,
          line_items: [] as unknown[],
          shipping_address: {} as Record<string, string>,
        },
        tracking: o.tracking_code
          ? [
              {
                id: `${r.source}-${o.tracking_code}`,
                tracking_number: o.tracking_code,
                carrier_name: o.carrier,
                status,
                status_detail: null,
                last_event: null,
                tracking_events: [] as unknown[],
                estimated_delivery: null as string | null,
              },
            ]
          : [],
      }
    })
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: PUBLIC_CORS })
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "tracking:lookup", LOOKUP_RATE_LIMIT)
  if (limited) return limited

  try {
    const query = request.nextUrl.searchParams.get("q")?.trim()
    const storeParam = request.nextUrl.searchParams.get("store")?.trim()

    if (!query || query.length < 3) {
      return NextResponse.json(
        { error: "Query deve ter pelo menos 3 caracteres" },
        { status: 400, headers: PUBLIC_CORS }
      )
    }

    const admin = createAdminClient()
    const ip = getClientIp(request)

    // Resolve storeParam → tracking_store_id (required for data isolation)
    let trackingStoreId: string | null = null
    let clientStoreId: string | null = null

    if (storeParam) {
      // Try as tracking_store_id first
      const { data: tsCheck } = await admin
        .from("tracking_stores")
        .select("id, client_store_id")
        .eq("id", storeParam)
        .eq("is_active", true)
        .single()

      if (tsCheck) {
        trackingStoreId = tsCheck.id
        clientStoreId = tsCheck.client_store_id
      } else {
        // Try as client_store_id → resolve to tracking_store_id
        const { data: byClientStore } = await admin
          .from("tracking_stores")
          .select("id, client_store_id")
          .eq("client_store_id", storeParam)
          .eq("is_active", true)
          .limit(1)
          .single()

        if (byClientStore) {
          trackingStoreId = byClientStore.id
          clientStoreId = byClientStore.client_store_id
        }
      }
    }

    if (!trackingStoreId) {
      return NextResponse.json(
        { error: "Store not found or inactive" },
        { status: 400, headers: PUBLIC_CORS }
      )
    }

    // Determine search type
    const isEmail = query.includes("@")
    const isOrderNumber = query.startsWith("#") || /^\d{3,6}$/.test(query)
    const cleanQuery = query.replace(/^#/, "")

    type WidgetResult = {
      order: {
        id: string
        order_name: string | null
        customer_name: string | null
        customer_email: string | null
        order_created_at: string | null
        shipped_at: string | null
        delivered_at: string | null
        total_price: number | null
        currency: string
        line_items: unknown[]
        shipping_address: Record<string, string>
      }
      tracking: Array<{
        id: string
        tracking_number: string
        carrier_name: string | null
        status: string
        status_detail: string | null
        last_event: string | null
        tracking_events: unknown[]
        estimated_delivery: string | null
      }>
    }

    let results: WidgetResult[] = []

    if (isEmail) {
      // Use OrderLookupService cascade if we have a clientStoreId
      if (clientStoreId) {
        try {
          const lookupService = new OrderLookupService()
          const lookupResults = await lookupService.findByEmail(clientStoreId, cleanQuery)
          results = mapLookupResults(lookupResults)
        } catch (err) {
          log.warn("OrderLookupService failed, falling back to local", {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Fallback to local Supabase search — scoped to this store
      if (results.length === 0) {
        const { data: orders } = await admin
          .from("tracking_orders")
          .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency, line_items, shipping_address")
          .eq("tracking_store_id", trackingStoreId)
          .ilike("customer_email", cleanQuery)
          .order("order_created_at", { ascending: false })
          .limit(10)

        if (orders) {
          for (const order of orders) {
            const { data: codes } = await admin
              .from("tracking_codes")
              .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, estimated_delivery")
              .eq("tracking_order_id", order.id)

            results.push({ order, tracking: codes || [] })
          }
        }
      }
    } else if (isOrderNumber) {
      const { data: orders } = await admin
        .from("tracking_orders")
        .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency, line_items, shipping_address")
        .eq("tracking_store_id", trackingStoreId)
        .or(`shopify_order_number.eq.${cleanQuery},order_name.ilike.%${cleanQuery}%`)
        .order("order_created_at", { ascending: false })
        .limit(10)

      if (orders) {
        for (const order of orders) {
          const { data: codes } = await admin
            .from("tracking_codes")
            .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, estimated_delivery")
            .eq("tracking_order_id", order.id)

          results.push({ order, tracking: codes || [] })
        }
      }
    } else {
      const { data: codes } = await admin
        .from("tracking_codes")
        .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, estimated_delivery, tracking_order_id")
        .eq("tracking_store_id", trackingStoreId)
        .ilike("tracking_number", `%${query}%`)
        .limit(5)

      if (codes) {
        for (const code of codes) {
          const { data: order } = await admin
            .from("tracking_orders")
            .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency, line_items, shipping_address")
            .eq("id", code.tracking_order_id)
            .single()

          if (order) {
            const { tracking_order_id: _, ...codeData } = code
            results.push({ order, tracking: [codeData] })
          }
        }
      }
    }

    // Log lookup (fire and forget)
    try {
      await admin
        .from("tracking_lookups")
        .insert({
          tracking_store_id: trackingStoreId,
          tracking_number: !isEmail && !isOrderNumber ? query : null,
          order_number: isOrderNumber ? cleanQuery : null,
          customer_email: isEmail ? cleanQuery : null,
          ip_address: ip,
          found: results.length > 0,
        })
    } catch (err) {
      log.warn("Failed to log lookup", err)
    }

    // Translate tracking event descriptions to Portuguese
    for (const result of results) {
      for (const track of result.tracking) {
        if (track.status_detail) {
          track.status_detail = translateEventDescription(track.status_detail)
        }
        if (track.last_event) {
          track.last_event = translateEventDescription(track.last_event)
        }
        if (Array.isArray(track.tracking_events)) {
          for (const event of track.tracking_events as Array<{ description?: string }>) {
            if (event.description) {
              event.description = translateEventDescription(event.description)
            }
          }
        }
      }
    }

    return NextResponse.json(
      { results, query, found: results.length > 0 },
      { headers: PUBLIC_CORS }
    )
  } catch (error) {
    log.error("Lookup error", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: PUBLIC_CORS }
    )
  }
}
