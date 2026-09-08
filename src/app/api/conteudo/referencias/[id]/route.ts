/**
 * PATCH  /api/conteudo/referencias/[id] — edita copy/porquê/classificação/peso/ativa;
 *        `{ retranscrever: true }` pede a leitura de novo à ConvertIA.
 * DELETE /api/conteudo/referencias/[id] — apaga a linha e os slides guardados.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { atualizarReferencia, excluirReferencia, transcreverReferencia } from "@/lib/services/conteudo-referencias.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

const frameTipo = z.enum(["capa", "dado", "texto", "prova", "lista", "mec", "cta"])

const patchSchema = z.object({
  retranscrever: z.boolean().optional(),
  nome: z.string().min(1).max(200).optional(),
  slides: z.array(z.object({ ordem: z.number().int().min(1).max(20), tipo: frameTipo.optional(), titulo: z.string().max(400).optional(), corpo: z.string().max(1200).optional() })).max(20).optional(),
  legenda: z.string().max(4000).nullable().optional(),
  palavraChave: z.string().max(40).nullable().optional(),
  pilar: z.enum(["Case", "Educacional", "Bastidor", "Benchmark"]).nullable().optional(),
  molde: z.enum(["Turbo", "MEC", "Benchmark", "Lista", "Bastidor"]).nullable().optional(),
  porQueFunciona: z.array(z.string().max(300)).max(8).optional(),
  peso: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  ativa: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Pedido inválido.", 400)
    const { retranscrever, ...patch } = parsed.data
    let ref = await atualizarReferencia(admin, orgId, id, patch)
    if (retranscrever) ref = await transcreverReferencia(admin, orgId, id)
    return successResponse(request, { referencia: ref })
  } catch (error) {
    return errorResponse(request, error, "conteudo-referencia-patch")
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    await excluirReferencia(admin, orgId, id)
    return successResponse(request, { id })
  } catch (error) {
    return errorResponse(request, error, "conteudo-referencia-delete")
  }
}
