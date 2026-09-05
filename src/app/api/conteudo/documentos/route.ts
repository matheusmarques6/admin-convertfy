/**
 * GET  /api/conteudo/documentos — biblioteca da org (documentos completos).
 * POST /api/conteudo/documentos — cria (id vem do cliente, uuid).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { withTiming } from "@/lib/api/with-timing"
import { criarDocumento, listarDocumentos, validarDocumento } from "@/lib/services/conteudo-documentos.service"

export const dynamic = "force-dynamic"

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const documentos = await listarDocumentos(admin, orgId)
    return successResponse(request, { documentos })
  } catch (error) {
    return errorResponse(request, error, "conteudo-documentos")
  }
}

async function handlePost(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const body = (await request.json().catch(() => null)) as { documento?: unknown } | null
    const doc = validarDocumento(body?.documento ?? body)
    const criado = await criarDocumento(admin, orgId, user.id, doc)
    return successResponse(request, { documento: criado })
  } catch (error) {
    return errorResponse(request, error, "conteudo-documentos-post")
  }
}

export const GET = withTiming("conteudo-documentos", handleGet, { slowMs: 4_000 })
export const POST = handlePost
