/**
 * GET /api/conteudo/referencias/candidatos — carrosséis REAIS do Instagram
 * (já sincronizados em `conteudo_ig_media`) que ainda não viraram
 * referência, mais salvos primeiro. É a lista do diálogo "Do Instagram".
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { listarCandidatos } from "@/lib/services/conteudo-referencias.service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    return successResponse(request, { candidatos: await listarCandidatos(admin, orgId) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-referencias-candidatos")
  }
}
