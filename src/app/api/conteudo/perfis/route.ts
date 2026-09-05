/**
 * GET /api/conteudo/perfis — perfis do módulo Conteúdo (= canais Instagram
 * da org), com handle, foto servida pelo admin, seguidores e meta semanal.
 * `?refresh=1` força a leitura do perfil na Graph API.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { withTiming } from "@/lib/api/with-timing"
import { loadPerfis } from "@/lib/services/conteudo-perfis.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const refresh = request.nextUrl.searchParams.get("refresh") === "1"
    const { perfis } = await loadPerfis(admin, orgId, { refresh })
    return successResponse(request, { perfis })
  } catch (error) {
    return errorResponse(request, error, "conteudo-perfis")
  }
}

export const GET = withTiming("conteudo-perfis", handleGet, { slowMs: 8_000 })
