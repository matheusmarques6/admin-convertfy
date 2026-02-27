import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

function publicCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicCorsHeaders() })
}

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, "tracking:config", RATE_LIMITS.trackingByCode, publicCorsHeaders())
  if (rateLimited) return rateLimited

  const storeId = request.nextUrl.searchParams.get("store_id")
  const domain = request.nextUrl.searchParams.get("domain")

  if (!storeId && !domain) {
    return NextResponse.json(
      { error: "store_id ou domain é obrigatório" },
      { status: 400, headers: publicCorsHeaders() }
    )
  }

  const supabase = createAdminClient()

  // Resolve store_id from domain if needed
  let resolvedStoreId = storeId
  if (!resolvedStoreId && domain) {
    resolvedStoreId = await resolveStoreByDomain(supabase, domain)
    if (!resolvedStoreId) {
      return NextResponse.json(
        { error: "Loja não encontrada para este domínio" },
        { status: 404, headers: publicCorsHeaders() }
      )
    }
  }

  const { data: config } = await supabase
    .from("tracking_config")
    .select("widget_config, enabled")
    .eq("store_id", resolvedStoreId!)
    .single()

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "Rastreio não habilitado para esta loja" },
      { status: 404, headers: publicCorsHeaders() }
    )
  }

  return NextResponse.json(
    { widget_config: config.widget_config, store_id: resolvedStoreId },
    {
      headers: {
        ...publicCorsHeaders(),
        "Cache-Control": "public, max-age=300",
      },
    }
  )
}

/**
 * Resolve store_id from a domain by matching against client_stores fields.
 * Tries: store_url, url, shopify_store_domain (exact and partial matches).
 */
async function resolveStoreByDomain(
  supabase: ReturnType<typeof createAdminClient>,
  domain: string
): Promise<string | null> {
  const cleanDomain = domain.toLowerCase().replace(/^www\./, "")

  // Try exact match on store_url or url (most common: custom domain)
  const { data: byUrl } = await supabase
    .from("client_stores")
    .select("id")
    .or(`store_url.ilike.%${cleanDomain}%,url.ilike.%${cleanDomain}%`)
    .limit(1)
    .single()

  if (byUrl) return byUrl.id

  // Try matching shopify_store_domain (e.g., domain is "oakvintage.myshopify.com")
  const { data: byShopify } = await supabase
    .from("client_stores")
    .select("id")
    .ilike("shopify_store_domain", `%${cleanDomain}%`)
    .limit(1)
    .single()

  if (byShopify) return byShopify.id

  return null
}
