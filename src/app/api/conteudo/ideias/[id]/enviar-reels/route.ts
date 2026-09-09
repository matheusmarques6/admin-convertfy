/**
 * POST /api/conteudo/ideias/[id]/enviar-reels — a ideia vira card na coluna
 * "Ideias" do pipeline. Idempotente: ideia já enviada devolve o mesmo reel
 * em vez de criar um segundo card com o mesmo título.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { enviarIdeiaParaReels } from "@/lib/services/conteudo-ideias.service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    return successResponse(request, { reelId: await enviarIdeiaParaReels(admin, orgId, user.id, id) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-ideia-enviar-reels")
  }
}
