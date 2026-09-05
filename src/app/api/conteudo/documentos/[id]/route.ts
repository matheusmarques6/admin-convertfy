/**
 * GET/PUT/DELETE /api/conteudo/documentos/[id]
 *
 * PUT substitui o documento. Body: `{ documento, baseAtualizadoEm?, force? }`.
 * Se `baseAtualizadoEm` não bate com o banco (outro navegador salvou antes)
 * responde 409 com `documento_atual` — a UI oferece recarregar ou
 * sobrescrever (`force: true`).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { ConflitoDocumentoError, excluirDocumento, obterDocumento, rowToDocumento, salvarDocumento, validarDocumento } from "@/lib/services/conteudo-documentos.service"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const row = await obterDocumento(admin, orgId, id)
    if (!row) throw new AppError("Carrossel não encontrado", 404, "not-found")
    return successResponse(request, { documento: rowToDocumento(row) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-documento-get")
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const body = (await request.json().catch(() => null)) as { documento?: unknown; baseAtualizadoEm?: string | null; force?: boolean } | null
    const doc = validarDocumento(body?.documento)
    if (doc.id !== id) throw new AppError("O id do documento não corresponde à rota.", 400)
    try {
      const salvo = await salvarDocumento(admin, orgId, user.id, doc, { baseAtualizadoEm: body?.baseAtualizadoEm ?? null, force: Boolean(body?.force) })
      return successResponse(request, { documento: salvo })
    } catch (e) {
      if (e instanceof ConflitoDocumentoError) {
        return NextResponse.json({ success: false, error: e.message, code: "conflict", documento_atual: e.atual }, { status: 409 })
      }
      throw e
    }
  } catch (error) {
    return errorResponse(request, error, "conteudo-documento-put")
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    await excluirDocumento(admin, orgId, id)
    return successResponse(request, { id })
  } catch (error) {
    return errorResponse(request, error, "conteudo-documento-delete")
  }
}
