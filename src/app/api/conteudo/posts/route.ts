/**
 * PATCH /api/conteudo/posts — classificação EM LOTE das mídias.
 *
 * A Meta não sabe o que é um "Turbo": pilar, molde e palavra-chave são a
 * leitura da casa. Classificar post a post no drawer não escala para um
 * histórico inteiro, então aqui vai a seleção da tabela de uma vez.
 *
 * Campo ausente no corpo NÃO é tocado (dá para marcar só o molde sem apagar
 * o pilar já preenchido); campo enviado como null limpa.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const schema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
  pilar: z.enum(["Case", "Educacional", "Bastidor", "Benchmark"]).nullable().optional(),
  molde: z.enum(["Turbo", "MEC", "Benchmark", "Lista", "Bastidor"]).nullable().optional(),
  palavraChave: z.string().max(80).nullable().optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Seleção ou classificação inválida.", 400)
    const p = parsed.data

    const patch: Record<string, unknown> = {}
    if ("pilar" in p) patch.pilar = p.pilar ?? null
    if ("molde" in p) patch.molde = p.molde ?? null
    if ("palavraChave" in p) patch.palavra_chave = p.palavraChave?.trim() || null
    if (!Object.keys(patch).length) throw new AppError("Escolha ao menos pilar, molde ou palavra-chave.", 400)

    const { data, error } = await admin
      .from("conteudo_ig_media")
      .update(patch)
      .eq("org_id", orgId)
      .in("media_id", p.ids)
      .select("media_id")
    if (error) throw error

    return successResponse(request, { atualizados: (data ?? []).length, ids: (data ?? []).map((d: { media_id: string }) => d.media_id) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-posts-bulk")
  }
}
