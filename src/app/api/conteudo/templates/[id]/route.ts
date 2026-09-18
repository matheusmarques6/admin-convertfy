/**
 * PATCH  /api/conteudo/templates/[id] — { usar: true } incrementa usos;
 *        { nome } renomeia; { estrutura, templateId } substitui a FORMA
 *        (é o "atualizar o existente" de quem salva um carrossel com nome
 *        de template que já está na prateleira).
 * DELETE /api/conteudo/templates/[id]
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { COLS, COLS_SEM_FAMILIA, criarSchema, rowToMeuTemplate, semColunaFamilia, type Row } from "@/lib/conteudo/meus-templates"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({
  usar: z.boolean().optional(),
  nome: z.string().min(1).max(120).optional(),
  estrutura: criarSchema.shape.estrutura.optional(),
  templateId: z.string().max(80).optional(),
  familia: criarSchema.shape.familia,
  fidelidade: z.number().min(0).max(100).nullable().optional(),
})

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Pedido inválido.", 400)
    const ler = (cols: string) => admin.from("conteudo_meus_templates").select(cols).eq("org_id", orgId).eq("id", id).maybeSingle<Row>()
    let { data: atual, error: e1 } = await ler(COLS)
    let temColuna = true
    if (semColunaFamilia(e1)) {
      temColuna = false
      ;({ data: atual, error: e1 } = await ler(COLS_SEM_FAMILIA))
    }
    if (e1) throw e1
    if (!atual) throw new AppError("Template não encontrado", 404, "not-found")
    const patch: Record<string, unknown> = {}
    if (parsed.data.usar) patch.usos = (atual.usos ?? 0) + 1
    if (parsed.data.nome) patch.nome = parsed.data.nome
    if (parsed.data.estrutura) patch.estrutura = parsed.data.estrutura
    if (parsed.data.templateId) patch.template_base = parsed.data.templateId
    // Atualizar a FORMA atualiza a identidade junto: a prévia tem de
    // continuar sendo o que o template entrega depois da substituição.
    if (parsed.data.familia && temColuna) patch.familia = parsed.data.familia
    // `fidelidade` é a confiança da LEITURA de uma inspiração. A forma que
    // veio de um carrossel do Estúdio não foi lida por ninguém — é o
    // documento em si —, então `null` aqui APAGA o número de propósito:
    // manter a fidelidade antiga descreveria uma estrutura que já não é a
    // gravada.
    if (parsed.data.fidelidade !== undefined) patch.fidelidade = parsed.data.fidelidade == null ? null : Math.round(parsed.data.fidelidade)
    if (!Object.keys(patch).length) return successResponse(request, { template: rowToMeuTemplate(atual) })
    const cols = temColuna ? COLS : COLS_SEM_FAMILIA
    const { data, error } = await admin.from("conteudo_meus_templates").update(patch).eq("id", id).select(cols).single<Row>()
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
