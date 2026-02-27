import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TrackingLookup")

const LOOKUP_RATE_LIMIT = { limit: 20, windowSeconds: 60 }

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "tracking:lookup", LOOKUP_RATE_LIMIT)
  if (limited) return limited

  const origin = request.headers.get("origin")

  try {
    const query = request.nextUrl.searchParams.get("q")?.trim()
    if (!query || query.length < 3) {
      return NextResponse.json(
        { error: "Query deve ter pelo menos 3 caracteres" },
        { status: 400, headers: corsHeaders(origin) }
      )
    }

    const admin = createAdminClient()
    const ip = getClientIp(request)

    // Determine search type
    const isEmail = query.includes("@")
    const isOrderNumber = query.startsWith("#") || /^\d{3,6}$/.test(query)
    const cleanQuery = query.replace(/^#/, "")

    const results: Array<{
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
    }> = []

    if (isEmail) {
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
      { headers: corsHeaders(origin) }
    )
  } catch (error) {
    log.error("Lookup error", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: corsHeaders(origin) }
    )
  }
}
