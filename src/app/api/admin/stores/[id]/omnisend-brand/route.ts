/**
 * GET /api/admin/stores/[id]/omnisend-brand
 *
 * Retorna o brandID da conta Omnisend da loja (usado no campo Campaign do UTM,
 * na tela de Modo Implementação). O brandID NÃO é persistido no banco — vem do
 * endpoint `/v3/brands` da Omnisend, então buscamos ao vivo.
 *
 * `connected` = email_platform === "omnisend" e há api key. Se a chamada à
 * Omnisend falhar (rate-limit, key inválida), `brandId` vem null (a UI usa o
 * placeholder "id omnisend"), sem quebrar a tela.
 */

import { NextRequest } from "next/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
} from "@/lib/api/errors"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { omnisendRequest } from "@/lib/integrations/omnisend/client"

const log = logger.child("OmnisendBrand")

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("email_platform")
      .eq("id", storeId)
      .maybeSingle()

    if (!store || store.email_platform !== "omnisend") {
      return successResponse(request, { connected: false, brandId: null })
    }

    let apiKey: string | undefined
    try {
      const creds = await getStoreCredentials(storeId)
      apiKey = creds.omnisend_api_key
    } catch {
      apiKey = undefined
    }
    if (!apiKey) {
      return successResponse(request, { connected: false, brandId: null })
    }

    // Conectada — busca o brandID ao vivo. Falha → brandId null (placeholder).
    let brandId: string | null = null
    try {
      const resp = await omnisendRequest<{ brandID?: string }>(
        apiKey,
        "/v3/brands",
        { logTag: "OmnisendBrand" },
      )
      brandId = resp?.brandID ?? null
    } catch (err) {
      log.warn("falha ao buscar brandID", {
        storeId,
        err: err instanceof Error ? err.message : String(err),
      })
    }

    return successResponse(request, { connected: true, brandId })
  } catch (error) {
    log.error("omnisend-brand error:", error)
    return errorResponse(request, error, "omnisend-brand")
  }
}
