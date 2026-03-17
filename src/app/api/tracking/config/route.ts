import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("TrackingConfigPublic")

const CONFIG_RATE_LIMIT = { limit: 30, windowSeconds: 60 }

const DEFAULT_CONFIG = {
  plugin_type: "complete",
  primary_color: "#6366F1",
  accent_color: "#8B5CF6",
  icon_color: "#6366F1",
  hide_carrier: false,
  hide_redirect: false,
  not_found_message: "Pedido não encontrado. Verifique o número informado e tente novamente.",
  show_estimated_delivery: true,
  show_carrier_logo: true,
  language: "pt-BR",
}

/** Public CORS — these endpoints are called from merchant storefronts */
const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: PUBLIC_CORS })
}

/**
 * GET /api/tracking/config?store={id}
 * Public endpoint — returns sanitized widget config (no API keys).
 * Accepts client_store_id or tracking_store_id.
 */
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, "tracking:config", CONFIG_RATE_LIMIT)
  if (limited) return limited

  try {
    const storeParam = request.nextUrl.searchParams.get("store")?.trim()

    if (!storeParam) {
      return NextResponse.json(
        { error: "store parameter is required" },
        { status: 400, headers: PUBLIC_CORS }
      )
    }

    const admin = createAdminClient()

    // Try finding tracking_store by id first, then by client_store_id
    let trackingStore: { widget_config: unknown; shop_name: string | null } | null = null

    const { data: byId } = await admin
      .from("tracking_stores")
      .select("widget_config, shop_name")
      .eq("id", storeParam)
      .eq("is_active", true)
      .single()

    if (byId) {
      trackingStore = byId
    } else {
      const { data: byClientStore } = await admin
        .from("tracking_stores")
        .select("widget_config, shop_name")
        .eq("client_store_id", storeParam)
        .eq("is_active", true)
        .limit(1)
        .single()

      if (byClientStore) {
        trackingStore = byClientStore
      }
    }

    if (!trackingStore) {
      return NextResponse.json(
        { config: DEFAULT_CONFIG },
        { headers: PUBLIC_CORS }
      )
    }

    const widgetConfig = trackingStore.widget_config as Record<string, unknown> | null
    // Merge saved config over defaults — all fields pass through to widget
    const config: Record<string, unknown> = widgetConfig ? { ...DEFAULT_CONFIG, ...widgetConfig } : { ...DEFAULT_CONFIG }

    return NextResponse.json(
      {
        config,
        store_name: trackingStore.shop_name || null,
      },
      {
        headers: {
          ...PUBLIC_CORS,
          "Cache-Control": "public, max-age=300",
        },
      }
    )
  } catch (error) {
    log.error("Config endpoint error", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: PUBLIC_CORS }
    )
  }
}
