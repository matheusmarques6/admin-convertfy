/**
 * POST /api/conteudo/ideias/[id]/voto — alterna o voto do usuário atual.
 * A contagem devolvida é COUNT do banco, não o número da tela mais um: com
 * duas pessoas votando ao mesmo tempo, incrementar no cliente diverge.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { alternarVoto } from "@/lib/services/conteudo-ideias.service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    return successResponse(request, await alternarVoto(admin, orgId, user.id, id))
  } catch (error) {
    return errorResponse(request, error, "conteudo-ideia-voto")
  }
}
