/**
 * GET /api/admin/campaign-central/production
 *
 * Lista as campanhas aprovadas em produção (pipeline items da Central) com
 * estágio + designer por loja, e a lista de designers disponíveis.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { getProduction } from "@/lib/services/campaign-central/production.service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "production:list")

    const result = await getProduction(ctx.orgId)
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "production:list")
  }
}
