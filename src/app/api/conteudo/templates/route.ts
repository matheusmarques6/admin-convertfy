/**
 * GET  /api/conteudo/templates — templates do time (criados de inspiração).
 * POST /api/conteudo/templates — cria { nome, templateId, estrutura, fidelidade? }.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  COLS,
  COLS_SEM_FAMILIA,
  criarSchema,
  rowToMeuTemplate,
  semColunaFamilia,
  type Row,
} from "@/lib/conteudo/meus-templates"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const ler = (cols: string) => admin.from("conteudo_meus_templates").select(cols).eq("org_id", orgId).order("criado_em", { ascending: false }).returns<Row[]>()
    let { data, error } = await ler(COLS)
    if (semColunaFamilia(error)) ({ data, error } = await ler(COLS_SEM_FAMILIA))
    if (error) throw error
    return successResponse(request, { templates: (data ?? []).map(rowToMeuTemplate) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-templates")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = criarSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Template inválido.", 400)
    const p = parsed.data
    const base = { org_id: orgId, nome: p.nome, template_base: p.templateId, estrutura: p.estrutura, fidelidade: p.fidelidade == null ? null : Math.round(p.fidelidade), usos: p.usos ?? 0, criado_por: user.id }
    const gravar = (linha: Record<string, unknown>, cols: string) => admin.from("conteudo_meus_templates").insert(linha).select(cols).single<Row>()
    let { data, error } = await gravar({ ...base, familia: p.familia ?? null }, COLS)
    // Sem a migration o template nasce igual, só sem a identidade gravada.
    if (semColunaFamilia(error)) ({ data, error } = await gravar(base, COLS_SEM_FAMILIA))
    if (error) throw error
    if (!data) throw new AppError("Template não foi gravado.", 500)
    return successResponse(request, { template: rowToMeuTemplate(data) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-templates-post")
  }
}
