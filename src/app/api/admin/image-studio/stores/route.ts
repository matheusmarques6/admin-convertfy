/**
 * GET /api/admin/image-studio/stores
 *
 * Lojas ativas da org para o seletor do Estúdio de Imagens (id, nome,
 * país, logo, cor primária). Qualquer usuário autenticado do admin.
 */

import { NextRequest } from "next/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { handleCorsPreFlight } from "@/lib/cors"
import { listEligibleStores } from "@/lib/services/image-studio.service"

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const stores = await listEligibleStores(orgId)
    return successResponse(request, { stores })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioStores")
  }
}
