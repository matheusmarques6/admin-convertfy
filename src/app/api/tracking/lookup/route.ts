import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { OrderLookupService, OrderLookupResult } from "@/lib/services/order-lookup.service"

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
function mapLookupResults(lookupResults: OrderLookupResult[]): Array<{
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
  }
  tracking: Array<{
    id: string
    tracking_number: string
    carrier_name: string | null
    status: string
    status_detail: string | null
    last_event: string | null
    tracking_events: unknown[]
  }>
}> {
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
                tracking_events: [],
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
      }
      tracking: Array<{
        id: string
        tracking_number: string
        carrier_name: string | null
        status: string
        status_detail: string | null
        last_event: string | null
        tracking_events: unknown[]
      }>
    }

    let results: WidgetResult[] = []

    if (isEmail) {
      // Resolve storeId: store param can be client_store_id or tracking_store_id
      let clientStoreId: string | null = null

      if (storeParam) {
        // Try as client_store_id first
        const { data: csCheck } = await admin
          .from("client_stores")
          .select("id")
          .eq("id", storeParam)
          .single()

        if (csCheck) {
          clientStoreId = csCheck.id
        } else {
          // Try as tracking_store_id → resolve to client_store_id
          const { data: tsCheck } = await admin
            .from("tracking_stores")
            .select("client_store_id")
            .eq("id", storeParam)
            .single()

          if (tsCheck?.client_store_id) {
            clientStoreId = tsCheck.client_store_id
          }
        }
      }

      // Use OrderLookupService cascade if we have a storeId
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

      // Fallback to local Supabase search if cascade returned nothing or failed
      if (results.length === 0) {
        const { data: orders } = await admin
          .from("tracking_orders")
          .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency")
          .ilike("customer_email", cleanQuery)
          .order("order_created_at", { ascending: false })
          .limit(10)

        if (orders) {
          for (const order of orders) {
            const { data: codes } = await admin
              .from("tracking_codes")
              .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events")
              .eq("tracking_order_id", order.id)

            results.push({ order, tracking: codes || [] })
          }
        }
      }
    } else if (isOrderNumber) {
      const { data: orders } = await admin
        .from("tracking_orders")
        .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency")
        .or(`shopify_order_number.eq.${cleanQuery},order_name.ilike.%${cleanQuery}%`)
        .order("order_created_at", { ascending: false })
        .limit(10)

      if (orders) {
        for (const order of orders) {
          const { data: codes } = await admin
            .from("tracking_codes")
            .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events")
            .eq("tracking_order_id", order.id)

          results.push({ order, tracking: codes || [] })
        }
      }
    } else {
      const { data: codes } = await admin
        .from("tracking_codes")
        .select("id, tracking_number, carrier_name, status, status_detail, last_event, tracking_events, tracking_order_id")
        .ilike("tracking_number", `%${query}%`)
        .limit(5)

      if (codes) {
        for (const code of codes) {
          const { data: order } = await admin
            .from("tracking_orders")
            .select("id, order_name, customer_name, customer_email, order_created_at, shipped_at, delivered_at, total_price, currency")
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
          tracking_number: !isEmail && !isOrderNumber ? query : null,
          order_number: isOrderNumber ? cleanQuery : null,
          customer_email: isEmail ? cleanQuery : null,
          ip_address: ip,
          found: results.length > 0,
        })
    } catch (err) {
      log.warn("Failed to log lookup", err)
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
