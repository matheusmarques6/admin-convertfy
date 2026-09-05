/**
 * GET    /api/transcricoes/[id] — detalhe (o cliente repõe por aqui).
 * PATCH  /api/transcricoes/[id] — coleção, título e tags.
 * DELETE /api/transcricoes/[id] — apaga a linha E os arquivos do Storage.
 *
 * A exclusão remove a mídia junto: linha apagada com arquivo órfão no
 * bucket é custo que ninguém mais consegue rastrear.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { carregarDetalhe } from "@/lib/services/transcricoes.service"
import { apagarArquivos, BUCKET_MEDIA, BUCKET_THUMBS } from "@/lib/services/transcricoes-assets"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const detalhe = await carregarDetalhe(admin, orgId, id)
    if (!detalhe) throw new AppError("Transcrição não encontrada.", 404)
    return successResponse(request, { transcricao: detalhe })
  } catch (error) {
    return errorResponse(request, error, "transcricao-detalhe")
  }
}

const patchSchema = z.object({
  colecaoId: z.string().uuid().nullable().optional(),
  titulo: z.string().min(1).max(300).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
})

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Dados inválidos.", 400)
    const p = parsed.data

    const patch: Record<string, unknown> = {}
    if ("colecaoId" in p) {
      // Coleção de outra org não pode entrar: a linha continuaria visível
      // aqui e passaria a contar na árvore de lá.
      if (p.colecaoId) {
        const { data } = await admin
          .from("transcricoes_colecoes")
          .select("id")
          .eq("id", p.colecaoId)
          .eq("org_id", orgId)
          .maybeSingle<{ id: string }>()
        if (!data) throw new AppError("Coleção não encontrada.", 404)
      }
      patch.colecao_id = p.colecaoId ?? null
    }
    if (p.titulo !== undefined) patch.titulo = p.titulo.trim()
    if (p.tags !== undefined) {
      patch.tags = [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))]
    }
    if (!Object.keys(patch).length) throw new AppError("Nada para atualizar.", 400)

    const { data, error } = await admin
      .from("transcricoes")
      .update(patch)
      .eq("org_id", orgId)
      .eq("id", id)
      .select("id, titulo, colecao_id, tags")
      .maybeSingle<{ id: string; titulo: string; colecao_id: string | null; tags: string[] }>()
    if (error) throw error
    if (!data) throw new AppError("Transcrição não encontrada.", 404)

    return successResponse(request, {
      transcricao: { id: data.id, titulo: data.titulo, colecaoId: data.colecao_id, tags: data.tags ?? [] },
    })
  } catch (error) {
    return errorResponse(request, error, "transcricao-patch")
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: linha } = await admin
      .from("transcricoes")
      .select("id, media_path, audio_path, thumb_path")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<{ id: string; media_path: string | null; audio_path: string | null; thumb_path: string | null }>()
    if (!linha) throw new AppError("Transcrição não encontrada.", 404)

    // Storage primeiro: se a linha some e o remove falha, o arquivo vira
    // órfão sem ninguém para apontá-lo.
    await Promise.all([
      apagarArquivos(admin, [linha.media_path, linha.audio_path], BUCKET_MEDIA),
      apagarArquivos(admin, [linha.thumb_path], BUCKET_THUMBS),
    ])

    // Blocos, locutores e chunks saem por CASCADE.
    const { error } = await admin.from("transcricoes").delete().eq("org_id", orgId).eq("id", id)
    if (error) throw error

    return successResponse(request, { excluida: true })
  } catch (error) {
    return errorResponse(request, error, "transcricao-excluir")
  }
}
