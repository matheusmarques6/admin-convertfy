/**
 * PATCH /api/conteudo/posts/[id] — classificação da casa para uma mídia do
 * Instagram (pilar, molde, palavra-chave do comment gate, documento do
 * Estúdio de origem). É o que alimenta mix por pilar e desempenho por molde.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const schema = z.object({
  pilar: z.enum(["Case", "Educacional", "Bastidor", "Benchmark"]).nullable().optional(),
  molde: z.enum(["Turbo", "MEC", "Benchmark", "Lista", "Bastidor"]).nullable().optional(),
  palavraChave: z.string().max(80).nullable().optional(),
  documentoId: z.string().uuid().nullable().optional(),
})

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Classificação inválida.", 400)
    const p = parsed.data
    const patch: Record<string, unknown> = {}
    if ("pilar" in p) patch.pilar = p.pilar ?? null
    if ("molde" in p) patch.molde = p.molde ?? null
    if ("palavraChave" in p) patch.palavra_chave = p.palavraChave?.trim() || null
    if ("documentoId" in p) patch.documento_id = p.documentoId ?? null
    if (!Object.keys(patch).length) throw new AppError("Nada para atualizar.", 400)

    const { data, error } = await admin.from("conteudo_ig_media").update(patch).eq("org_id", orgId).eq("media_id", id).select("media_id, pilar, molde, palavra_chave, documento_id, permalink, channel_id").maybeSingle()
    if (error) throw error
    if (!data) throw new AppError("Post não encontrado", 404, "not-found")

    // Documento vinculado passa a "publicado" com a referência da mídia.
    if (p.documentoId) {
      const { data: doc } = await admin.from("conteudo_documentos").select("id, dados").eq("org_id", orgId).eq("id", p.documentoId).maybeSingle<{ id: string; dados: Record<string, unknown> }>()
      if (doc) {
        await admin
          .from("conteudo_documentos")
          .update({ status: "publicado", dados: { ...doc.dados, status: "publicado", publicacao: { mediaId: id, permalink: data.permalink, perfil: data.channel_id } } })
          .eq("id", doc.id)
      }
    }
    return successResponse(request, { post: data })
  } catch (error) {
    return errorResponse(request, error, "conteudo-post-patch")
  }
}
