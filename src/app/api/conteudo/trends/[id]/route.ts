/**
 * DELETE /api/conteudo/trends/[id] — tira o assunto do painel.
 *
 * Arquiva (`ativo = false`), não apaga: o título continua no banco e é ele
 * que impede a rodada seguinte de propor o mesmo assunto de novo — apagar
 * faria a IA reoferecer amanhã o que alguém acabou de descartar.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { arquivarTrend } from "@/lib/services/conteudo-trends.service"

export const dynamic = "force-dynamic"

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    await arquivarTrend(admin, orgId, id)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "conteudo-trend-delete")
  }
}
