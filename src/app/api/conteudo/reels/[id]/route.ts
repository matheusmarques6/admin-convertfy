/**
 * PATCH  /api/conteudo/reels/[id] — mover de coluna, reordenar, editar.
 * DELETE /api/conteudo/reels/[id] — remover o card.
 *
 * `posicao` é fracionária: arrastar entre dois cards manda o ponto médio,
 * então mover um card não reescreve a coluna inteira (e dois arrastos
 * simultâneos não embaralham a ordem).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { excluirReel, patchReel } from "@/lib/services/conteudo-ideias.service"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  titulo: z.string().min(3).max(300).optional(),
  funil: z.enum(["topo", "meio", "fundo"]).optional(),
  etapa: z.enum(["ideias", "roteiro", "gravar", "editar", "agendado", "publicado"]).optional(),
  tema: z.string().max(80).nullable().optional(),
  formato: z.string().max(60).nullable().optional(),
  duracaoS: z.number().int().min(1).max(3600).nullable().optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  roteiro: z.array(z.object({ papel: z.string().max(40), texto: z.string().max(2000), segundos: z.number().int().min(0).max(600).nullable().optional() })).max(12).optional(),
  responsavelId: z.string().uuid().nullable().optional(),
  canalId: z.string().uuid().nullable().optional(),
  agendadoPara: z.string().datetime().nullable().optional(),
  posicao: z.number().optional(),
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
    await patchReel(admin, orgId, id, parsed.data)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "conteudo-reel-patch")
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    await excluirReel(admin, orgId, id)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "conteudo-reel-delete")
  }
}
