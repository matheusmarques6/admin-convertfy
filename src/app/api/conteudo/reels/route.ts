/**
 * GET  /api/conteudo/reels — o pipeline inteiro (as 6 colunas) + o progresso
 *      da semana por funil. Uma rota só porque os dois leem os MESMOS reels.
 * POST /api/conteudo/reels — cria um card.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { criarReel, listarReels } from "@/lib/services/conteudo-ideias.service"
import { progressoDaSemana } from "@/lib/conteudo/reels/pipeline"

export const dynamic = "force-dynamic"

const criarSchema = z.object({
  titulo: z.string().min(3).max(300),
  funil: z.enum(["topo", "meio", "fundo"]),
  etapa: z.enum(["ideias", "roteiro", "gravar", "editar", "agendado", "publicado"]).optional(),
  tema: z.string().max(80).nullable().optional(),
  formato: z.string().max(60).nullable().optional(),
  duracaoS: z.number().int().min(1).max(3600).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const reels = await listarReels(admin, orgId)
    return successResponse(request, {
      reels,
      progresso: progressoDaSemana(
        reels.map((r) => ({ funil: r.funil, etapa: r.etapa, publicadoEm: r.publicadoEm, agendadoPara: r.agendadoPara })),
      ),
    })
  } catch (error) {
    return errorResponse(request, error, "conteudo-reels")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = criarSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Reel inválido: título e funil são obrigatórios.", 400)
    const id = await criarReel(admin, orgId, user.id, parsed.data)
    return successResponse(request, { id }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "conteudo-reels-post")
  }
}
