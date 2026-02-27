import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { successResponse, errorResponse } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    // RLS check — user must have access to this store
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return errorResponse(request, new Error("Loja não encontrada"), "TrackingConfig GET")
    }

    const adminClient = createAdminClient()

    // Get tracking config
    const { data: config } = await adminClient
      .from("tracking_config")
      .select("enabled, seventeen_track_api_key, widget_config")
      .eq("store_id", storeId)
      .single()

    // Get stats
    const { count: cachedOrders } = await adminClient
      .from("order_tracking_cache")
      .select("*", { count: "exact", head: true })
      .eq("store_id", storeId)
      .gt("expires_at", new Date().toISOString())

    const { data: lastOrder } = await adminClient
      .from("order_tracking_cache")
      .select("created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    // Mask API key for frontend
    const maskedConfig = config
      ? {
          ...config,
          seventeen_track_api_key: config.seventeen_track_api_key ? "••••••••" : "",
        }
      : null

    return successResponse(request, {
      config: maskedConfig,
      stats: {
        cached_orders: cachedOrders || 0,
        last_sync: lastOrder?.created_at || null,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "TrackingConfig GET")
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    // RLS check
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("id, org_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return errorResponse(request, new Error("Loja não encontrada"), "TrackingConfig PUT")
    }

    const body = await request.json()
    const adminClient = createAdminClient()

    // Build update object
    const update: Record<string, unknown> = {
      org_id: store.org_id,
      store_id: storeId,
    }

    if (typeof body.enabled === "boolean") {
      update.enabled = body.enabled
    }

    if (body.seventeen_track_api_key && body.seventeen_track_api_key !== "••••••••") {
      update.seventeen_track_api_key = encrypt(body.seventeen_track_api_key)
    }

    if (body.widget_config) {
      update.widget_config = body.widget_config
    }

    // Upsert config
    const { error: upsertError } = await adminClient
      .from("tracking_config")
      .upsert(update, { onConflict: "store_id" })

    if (upsertError) {
      throw new Error(`Erro ao salvar configuração: ${upsertError.message}`)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "TrackingConfig PUT")
  }
}
