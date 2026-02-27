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
    const { store_id, domain, tracking_code } = body

    if (!tracking_code) {
      return NextResponse.json(
        { error: "tracking_code é obrigatório" },
        { status: 400, headers: publicCorsHeaders() }
      )
    }

    if (!store_id && !domain) {
      return NextResponse.json(
        { error: "store_id ou domain é obrigatório" },
        { status: 400, headers: publicCorsHeaders() }
      )
    }

    const supabase = createAdminClient()

    // Resolve store_id from domain if needed
    let resolvedStoreId = store_id
    if (!resolvedStoreId && domain) {
      resolvedStoreId = await resolveStoreByDomain(supabase, domain)
      if (!resolvedStoreId) {
        return NextResponse.json(
          { error: "Loja não encontrada para este domínio" },
          { status: 404, headers: publicCorsHeaders() }
        )
      }
    }

    // Validate store exists and tracking is enabled
    const { data: config } = await supabase
      .from("tracking_config")
      .select("seventeen_track_api_key, enabled")
      .eq("store_id", resolvedStoreId)
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

async function resolveStoreByDomain(
  supabase: ReturnType<typeof createAdminClient>,
  domain: string
): Promise<string | null> {
  const cleanDomain = domain.toLowerCase().replace(/^www\./, "")

  const { data: byUrl } = await supabase
    .from("client_stores")
    .select("id")
    .or(`store_url.ilike.%${cleanDomain}%,url.ilike.%${cleanDomain}%`)
    .limit(1)
    .single()

  if (byUrl) return byUrl.id

  const { data: byShopify } = await supabase
    .from("client_stores")
    .select("id")
    .ilike("shopify_store_domain", `%${cleanDomain}%`)
    .limit(1)
    .single()

  if (byShopify) return byShopify.id

  return null
}
