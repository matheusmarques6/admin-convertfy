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
  if (!storeId) {
    return NextResponse.json(
      { error: "store_id é obrigatório" },
      { status: 400, headers: publicCorsHeaders() }
    )
  }

  const supabase = createAdminClient()
  const { data: config } = await supabase
    .from("tracking_config")
    .select("widget_config, enabled")
    .eq("store_id", storeId)
    .single()

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "Rastreio não habilitado para esta loja" },
      { status: 404, headers: publicCorsHeaders() }
    )
  }

  return NextResponse.json(
    { widget_config: config.widget_config },
    {
      headers: {
        ...publicCorsHeaders(),
        "Cache-Control": "public, max-age=300",
      },
    }
  )
}
