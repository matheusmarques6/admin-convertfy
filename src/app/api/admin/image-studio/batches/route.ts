/**
 * /api/admin/image-studio/batches
 *
 * GET  — histórico de lotes da org (com resultados), mais recentes primeiro.
 * POST — cria um lote novo.
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
import { createBatch, listBatches } from "@/lib/services/image-studio.service"

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const batches = await listBatches(orgId)
    return successResponse(request, { batches })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioBatches")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const body = await parseAndValidate(request, imageStudioBatchBodySchema)
    const batch = await createBatch(orgId, body, user.id)
    return successResponse(request, { batch })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioBatches")
  }
}
