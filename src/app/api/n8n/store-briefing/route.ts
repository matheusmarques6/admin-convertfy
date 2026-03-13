import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { AppError, errorResponse, successResponse } from "@/lib/api/errors"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("N8nStoreBriefing")

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/n8n/store-briefing?store_id=X
 * Returns the current briefing for a store. Auth via x-webhook-secret.
 */
export async function GET(request: NextRequest) {
  try {
    requireWebhookSecret(request)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      throw new AppError("store_id e obrigatorio", 400)
    }

    if (!UUID_REGEX.test(storeId)) {
      throw new AppError("Loja nao encontrada", 404)
    }

    const adminClient = createAdminClient()

    // Fetch store metadata
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select("id, store_name, platform")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja nao encontrada", 404)
    }

    // Fetch current briefing
    const { data: briefing } = await adminClient
      .from("store_briefings")
      .select("id, store_id, briefing_data, version, generated_by, created_at")
      .eq("store_id", storeId)
      .eq("status", "current")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    log.info("Briefing fetched", {
      store_id: storeId,
      has_briefing: !!briefing,
    })

    const response = successResponse(request, {
      store: {
        id: store.id,
        store_name: store.store_name,
        platform: store.platform,
      },
      briefing: briefing
        ? {
            id: briefing.id,
            version: briefing.version,
            generated_by: briefing.generated_by,
            created_at: briefing.created_at,
            data: briefing.briefing_data,
          }
        : null,
    })

    response.headers.set("Cache-Control", "private, max-age=300")

    return response
  } catch (error) {
    return errorResponse(request, error, "N8nStoreBriefing")
  }
}
