/**
 * /api/admin/image-studio/batches/[id]
 *
 * PATCH  — edita o lote (nome/formato/instrução/flags/lojas/variações).
 * DELETE — exclui o lote (+ imagem-base do storage, best-effort).
 */

import { NextRequest } from "next/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { handleCorsPreFlight } from "@/lib/cors"
import { imageStudioBatchBodySchema } from "@/lib/schemas/image-studio"
import { deleteBatch, updateBatch } from "@/lib/services/image-studio.service"

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const body = await parseAndValidate(request, imageStudioBatchBodySchema)
    const batch = await updateBatch(id, orgId, body)
    return successResponse(request, { batch })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioBatch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await deleteBatch(id, orgId)
    return successResponse(request, { deleted: true })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioBatch")
  }
}
