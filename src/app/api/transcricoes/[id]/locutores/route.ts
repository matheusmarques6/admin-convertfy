/**
 * PATCH /api/transcricoes/[id]/locutores — renomear locutor.
 *
 * Uma linha só é atualizada: o nome vive em `transcricoes_locutores` e os
 * blocos guardam o RÓTULO ORIGINAL do provedor. Renomear não reescreve as
 * N mil falas, e o rótulo original preservado é o que permite a um
 * reprocessamento remapear os nomes que o humano deu.
 *
 * A resposta devolve quantas falas passam a exibir o nome novo — é a
 * contagem que o toast mostra.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const schema = z.object({
  locutorId: z.number().int().positive(),
  nome: z.string().min(1).max(120),
})

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Nome inválido.", 400)
    const nome = parsed.data.nome.trim()
    if (!nome) throw new AppError("O nome não pode ficar vazio.", 400)

    const { data: locutor, error } = await admin
      .from("transcricoes_locutores")
      .update({ nome })
      .eq("id", parsed.data.locutorId)
      .eq("transcricao_id", id)
      .eq("org_id", orgId)
      .select("id, rotulo_original, nome, cor")
      .maybeSingle<{ id: number; rotulo_original: string; nome: string; cor: number }>()
    if (error) throw error
    if (!locutor) throw new AppError("Locutor não encontrado.", 404)

    const { count } = await admin
      .from("transcricoes_blocos")
      .select("id", { count: "exact", head: true })
      .eq("transcricao_id", id)
      .eq("locutor", locutor.rotulo_original)

    return successResponse(request, {
      locutor: { id: locutor.id, rotuloOriginal: locutor.rotulo_original, nome: locutor.nome, cor: locutor.cor },
      falasAtualizadas: count ?? 0,
    })
  } catch (error) {
    return errorResponse(request, error, "transcricao-locutor")
  }
}
