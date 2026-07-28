/**
 * GET /api/admin/image-studio/batches/[id]/results
 *
 * Resultados ao vivo de um lote — alimenta o polling (4s) do frontend
 * enquanto houver item queued/generating.
 */

import { NextRequest } from "next/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { handleCorsPreFlight } from "@/lib/cors"
import { getBatchResults } from "@/lib/services/image-studio.service"

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const results = await getBatchResults(id, orgId)
    return successResponse(request, { results })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioResults")
  }
}
