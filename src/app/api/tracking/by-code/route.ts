import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { SeventeenTrackService } from "@/lib/integrations/seventeen-track"
import { decrypt } from "@/lib/crypto"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("TrackingByCode")

// Public CORS headers — widget can be on any domain
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
  // Rate limit: 10 req/min per IP
  const rateLimited = checkRateLimit(request, "tracking:code", RATE_LIMITS.trackingByCode, publicCorsHeaders())
  if (rateLimited) return rateLimited

  try {
    const body = await request.json()
    const { store_id, tracking_code } = body

    if (!store_id || !tracking_code) {
      return NextResponse.json(
        { error: "store_id e tracking_code são obrigatórios" },
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

    if (!config.seventeen_track_api_key) {
      return NextResponse.json(
        { error: "Configuração de rastreio incompleta" },
        { status: 500, headers: publicCorsHeaders() }
      )
    }

    // Decrypt API key
    const apiKey = config.seventeen_track_api_key.startsWith("enc:")
      ? decrypt(config.seventeen_track_api_key)
      : config.seventeen_track_api_key

    // Track
    const tracker = new SeventeenTrackService(apiKey)
    const result = await tracker.track(tracking_code.trim())

    return NextResponse.json(result, { headers: publicCorsHeaders() })
  } catch (err) {
    log.error("Tracking by code failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "Erro ao buscar rastreio" },
      { status: 500, headers: publicCorsHeaders() }
    )
  }
}
