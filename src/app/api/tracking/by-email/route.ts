import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { SeventeenTrackService } from "@/lib/integrations/seventeen-track"
import { OrderLookupService } from "@/lib/services/order-lookup.service"
import { decrypt } from "@/lib/crypto"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("TrackingByEmail")

function publicCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicCorsHeaders() })
}

export async function POST(request: NextRequest) {
  // Rate limit: 6 req/min per IP
  const rateLimited = checkRateLimit(request, "tracking:email", RATE_LIMITS.trackingByEmail, publicCorsHeaders())
  if (rateLimited) return rateLimited

  try {
    const body = await request.json()
    const { store_id, email } = body

    if (!store_id || !email) {
      return NextResponse.json(
        { error: "store_id e email são obrigatórios" },
        { status: 400, headers: publicCorsHeaders() }
      )
    }

    // Basic email validation
    if (!email.includes("@") || email.length < 5) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400, headers: publicCorsHeaders() }
      )
    }

    // Validate store exists and tracking is enabled
    const supabase = createAdminClient()
    const { data: config } = await supabase
      .from("tracking_config")
      .select("seventeen_track_api_key, enabled")
      .eq("store_id", store_id)
      .single()

    if (!config || !config.enabled) {
      return NextResponse.json(
        { error: "Rastreio não habilitado para esta loja" },
        { status: 404, headers: publicCorsHeaders() }
      )
    }

    // Lookup orders via chain: Shopify → Klaviyo → Cache
    const lookupService = new OrderLookupService()
    const orders = await lookupService.findByEmail(store_id, email)

    if (orders.length === 0) {
      return NextResponse.json(
        { orders: [], message: "Nenhum pedido encontrado para este email" },
        { headers: publicCorsHeaders() }
      )
    }

    // For orders with tracking codes, enrich with 17Track status
    if (config.seventeen_track_api_key) {
      const apiKey = config.seventeen_track_api_key.startsWith("enc:")
        ? decrypt(config.seventeen_track_api_key)
        : config.seventeen_track_api_key

      const tracker = new SeventeenTrackService(apiKey)

      // Collect unique tracking codes
      const trackingCodes = orders
        .map((o) => o.order?.tracking_code)
        .filter((code): code is string => !!code)

      const uniqueCodes = [...new Set(trackingCodes)]

      if (uniqueCodes.length > 0) {
        const trackingResults = await tracker.trackBatch(uniqueCodes)
        const trackingMap = new Map(
          trackingResults.map((r) => [r.tracking_code, r])
        )

        // Enrich each order with tracking data
        for (const orderResult of orders) {
          if (orderResult.order?.tracking_code) {
            const tracking = trackingMap.get(orderResult.order.tracking_code)
            if (tracking) {
              ;(orderResult as unknown as Record<string, unknown>).tracking = tracking
            }
          }
        }
      }
    }

    return NextResponse.json({ orders }, { headers: publicCorsHeaders() })
  } catch (err) {
    log.error("Tracking by email failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "Erro ao buscar pedidos" },
      { status: 500, headers: publicCorsHeaders() }
    )
  }
}
