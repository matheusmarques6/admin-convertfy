/**
 * GET  /api/conteudo/referencias — referências da org (mais peso primeiro).
 * POST /api/conteudo/referencias — cria por UPLOAD: { nome?, slidesUrls[], legenda? }
 *      (as URLs vêm do `/api/conteudo/upload` com kind=referencia). Guarda
 *      cópia dos slides e pede a transcrição à ConvertIA — pode levar
 *      até ~1 min com 10 slides, daí o maxDuration.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { criarReferenciaDeUpload, listarReferencias } from "@/lib/services/conteudo-referencias.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const criarSchema = z.object({
  nome: z.string().max(200).optional(),
  slidesUrls: z.array(z.string().min(1).max(600)).min(1).max(12),
  legenda: z.string().max(4000).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    return successResponse(request, { referencias: await listarReferencias(admin, orgId) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-referencias")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = criarSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Referência inválida: envie de 1 a 12 slides.", 400)
    const ref = await criarReferenciaDeUpload(admin, orgId, user.id, parsed.data)
    return successResponse(request, { referencia: ref }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "conteudo-referencias-post")
  }
}
