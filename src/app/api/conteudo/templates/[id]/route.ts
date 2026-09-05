/**
 * PATCH  /api/conteudo/templates/[id] — { usar: true } incrementa usos; { nome } renomeia.
 * DELETE /api/conteudo/templates/[id]
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { rowToMeuTemplate } from "../route"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({ usar: z.boolean().optional(), nome: z.string().min(1).max(120).optional() })

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Pedido inválido.", 400)
    const { data: atual, error: e1 } = await admin.from("conteudo_meus_templates").select("id, nome, template_base, estrutura, fidelidade, usos, criado_em").eq("org_id", orgId).eq("id", id).maybeSingle()
    if (e1) throw e1
    if (!atual) throw new AppError("Template não encontrado", 404, "not-found")
    const patch: Record<string, unknown> = {}
    if (parsed.data.usar) patch.usos = (atual.usos ?? 0) + 1
    if (parsed.data.nome) patch.nome = parsed.data.nome
    if (!Object.keys(patch).length) return successResponse(request, { template: rowToMeuTemplate(atual) })
    const { data, error } = await admin.from("conteudo_meus_templates").update(patch).eq("id", id).select("id, nome, template_base, estrutura, fidelidade, usos, criado_em").single()
    if (error) throw error
    return successResponse(request, { template: rowToMeuTemplate(data) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-template-patch")
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const { error } = await admin.from("conteudo_meus_templates").delete().eq("org_id", orgId).eq("id", id)
    if (error) throw error
    return successResponse(request, { id })
  } catch (error) {
    return errorResponse(request, error, "conteudo-template-delete")
  }
}
