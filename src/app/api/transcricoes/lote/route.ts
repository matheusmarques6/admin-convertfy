/**
 * POST /api/transcricoes/lote — ações em massa sobre a seleção.
 *
 * mover · excluir · tags. A exclusão remove os arquivos do Storage junto
 * (linha apagada com mídia órfã é custo que ninguém mais rastreia) e a
 * resposta diz quantos itens foram afetados de verdade — não quantos ids
 * chegaram.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { apagarArquivos, BUCKET_MEDIA, BUCKET_THUMBS } from "@/lib/services/transcricoes-assets"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  acao: z.enum(["mover", "excluir", "adicionar_tags", "remover_tags"]),
  colecaoId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Seleção ou ação inválida.", 400)
    const { ids, acao } = parsed.data

    if (acao === "mover") {
      if (parsed.data.colecaoId) {
        const { data } = await admin
          .from("transcricoes_colecoes")
          .select("id")
          .eq("id", parsed.data.colecaoId)
          .eq("org_id", orgId)
          .maybeSingle<{ id: string }>()
        if (!data) throw new AppError("Coleção não encontrada.", 404)
      }
      const { data, error } = await admin
        .from("transcricoes")
        .update({ colecao_id: parsed.data.colecaoId ?? null })
        .eq("org_id", orgId)
        .in("id", ids)
        .select("id")
      if (error) throw error
      return successResponse(request, { afetados: (data ?? []).length })
    }

    if (acao === "excluir") {
      const { data: linhas } = await admin
        .from("transcricoes")
        .select("id, media_path, audio_path, thumb_path")
        .eq("org_id", orgId)
        .in("id", ids)
        .returns<Array<{ id: string; media_path: string | null; audio_path: string | null; thumb_path: string | null }>>()
      const alvos = linhas ?? []
      if (!alvos.length) return successResponse(request, { afetados: 0 })

      await Promise.all([
        apagarArquivos(admin, alvos.flatMap((l) => [l.media_path, l.audio_path]), BUCKET_MEDIA),
        apagarArquivos(admin, alvos.map((l) => l.thumb_path), BUCKET_THUMBS),
      ])
      const { error } = await admin
        .from("transcricoes")
        .delete()
        .eq("org_id", orgId)
        .in("id", alvos.map((l) => l.id))
      if (error) throw error
      return successResponse(request, { afetados: alvos.length })
    }

    // Tags: leitura e escrita por linha, porque o array é por item. Com
    // teto de 200 a ida extra é aceitável e o resultado é exato.
    const tags = [...new Set((parsed.data.tags ?? []).map((t) => t.trim()).filter(Boolean))]
    if (!tags.length) throw new AppError("Informe ao menos uma tag.", 400)

    const { data: linhas } = await admin
      .from("transcricoes")
      .select("id, tags")
      .eq("org_id", orgId)
      .in("id", ids)
      .returns<Array<{ id: string; tags: string[] | null }>>()

    let afetados = 0
    for (const l of linhas ?? []) {
      const atuais = l.tags ?? []
      const novas =
        acao === "adicionar_tags"
          ? [...new Set([...atuais, ...tags])]
          : atuais.filter((t) => !tags.includes(t))
      if (novas.length === atuais.length && novas.every((t, i) => t === atuais[i])) continue
      const { error } = await admin.from("transcricoes").update({ tags: novas }).eq("id", l.id).eq("org_id", orgId)
      if (!error) afetados++
    }
    return successResponse(request, { afetados })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-lote")
  }
}
