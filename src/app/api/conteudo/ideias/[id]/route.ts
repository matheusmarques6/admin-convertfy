/**
 * PATCH  /api/conteudo/ideias/[id] — edita ou arquiva uma ideia.
 * DELETE /api/conteudo/ideias/[id] — apaga de vez (só o que nunca saiu do banco).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { excluirIdeia, patchIdeia } from "@/lib/services/conteudo-ideias.service"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  titulo: z.string().min(3).max(300).optional(),
  funil: z.enum(["topo", "meio", "fundo"]).nullable().optional(),
  formato: z.enum(["Carrossel", "Reels", "Vídeo", "Imagem"]).nullable().optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  molde: z.string().max(60).nullable().optional(),
  status: z.enum(["banco", "enviada", "arquivada"]).optional(),
})

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Alteração inválida.", 400)
    return successResponse(request, { ideia: await patchIdeia(admin, orgId, user.id, id, parsed.data) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-ideia-patch")
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    await excluirIdeia(admin, orgId, id)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "conteudo-ideia-delete")
  }
}
