import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse, AppError } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("StoreTrackingConfig")

/**
 * GET - Get tracking config for a specific client_store (admin)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { id: storeId } = await params
    const admin = createAdminClient()

    // Get tracking_store for this client_store
    const { data: trackingStore } = await admin
      .from("tracking_stores")
      .select("id, is_active, seventeen_track_api_key, widget_config, last_sync_at")
      .eq("client_store_id", storeId)
      .eq("is_active", true)
      .maybeSingle()

    // Get cached orders count
    const { count } = await admin
      .from("tracking_orders")
      .select("id", { count: "exact", head: true })
      .eq("tracking_store_id", trackingStore?.id || "00000000-0000-0000-0000-000000000000")

    return successResponse(request, {
      config: trackingStore ? {
        enabled: trackingStore.is_active,
        seventeen_track_api_key: trackingStore.seventeen_track_api_key ? "configured" : "",
        widget_config: trackingStore.widget_config || {
          primary_color: "#000000",
          logo_url: null,
          custom_css: null,
          show_carrier_logo: true,
          language: "pt-BR",
          placeholder_tracking: "Digite seu código de rastreio",
          placeholder_email: "Digite seu email",
        },
      } : null,
      stats: {
        cached_orders: count || 0,
        last_sync: trackingStore?.last_sync_at || null,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "StoreTrackingConfig GET")
  }
}

/**
 * PUT - Update tracking config for a specific client_store (admin)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { id: storeId } = await params
    const body = await request.json()
    const { enabled, widget_config, seventeen_track_api_key } = body

    const admin = createAdminClient()

    // Verify store exists
    const { data: clientStore } = await admin
      .from("client_stores")
      .select("id, org_id, shopify_store_domain, store_name")
      .eq("id", storeId)
      .single()

    if (!clientStore) {
      throw new AppError("Loja não encontrada", 404)
    }

    // Get or create tracking_store
    const { data: existing } = await admin
      .from("tracking_stores")
      .select("id")
      .eq("client_store_id", storeId)
      .maybeSingle()

    const updateData: Record<string, unknown> = {
      is_active: enabled !== undefined ? enabled : true,
    }

    if (widget_config) {
      updateData.widget_config = widget_config
    }

    if (seventeen_track_api_key && seventeen_track_api_key !== "configured") {
      updateData.seventeen_track_api_key = encrypt(seventeen_track_api_key)
    }

    if (existing) {
      await admin
        .from("tracking_stores")
        .update(updateData)
        .eq("id", existing.id)
    } else {
      const crypto = await import("crypto")
      await admin
        .from("tracking_stores")
        .insert({
          ...updateData,
          client_store_id: storeId,
          org_id: clientStore.org_id,
          shop_domain: clientStore.shopify_store_domain || "",
          shop_name: clientStore.store_name || "",
          webhook_secret: crypto.randomBytes(32).toString("hex"),
        })
    }

    log.info("Tracking config updated via admin", { storeId })
    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "StoreTrackingConfig PUT")
  }
}
