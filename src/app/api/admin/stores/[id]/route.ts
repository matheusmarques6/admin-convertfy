/**
 * PATCH /api/admin/stores/[id]
 *
 * Atualiza campos editaveis de client_stores. Cobre o caso da edicao
 * inline na tela Identidade Visual (Segmento/niche). Por enquanto so
 * niche e exposto — outros campos passam pelo wizard/onboarding.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("StorePatch")

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

const patchSchema = z.object({
  niche: z.string().max(240).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      throw new AppError(`invalid_body: ${parsed.error.message}`, 400)
    }

    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updateData[k] = v
    }
    if (Object.keys(updateData).length === 0) {
      throw new AppError("nothing_to_update", 400)
    }

    const { data, error } = await admin
      .from("client_stores")
      .update(updateData)
      .eq("id", id)
      .select("id, store_name, store_url, platform, niche")
      .single()

    if (error) throw error
    return successResponse(request, { store: data })
  } catch (error) {
    log.error("store patch error:", error)
    return errorResponse(request, error, "store-patch")
  }
}
