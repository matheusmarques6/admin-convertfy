/**
 * GET  /api/conteudo/templates — templates do time (criados de inspiração).
 * POST /api/conteudo/templates — cria { nome, templateId, estrutura, fidelidade? }.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import type { EstruturaDetectada, MeuTemplate } from "@/lib/conteudo/types"

export const dynamic = "force-dynamic"

const estruturaSchema = z
  .array(z.object({ tipo: z.enum(["capa", "dado", "texto", "prova", "lista", "mec", "cta"]), slotImagem: z.boolean().optional(), descricao: z.string().max(200).optional() }))
  .min(3)
  .max(30)

export const criarSchema = z.object({
  nome: z.string().min(1).max(120),
  templateId: z.string().max(80),
  estrutura: estruturaSchema,
  fidelidade: z.number().min(0).max(100).nullable().optional(),
  usos: z.number().int().min(0).optional(),
})

interface Row {
  id: string
  nome: string
  template_base: string | null
  estrutura: EstruturaDetectada[]
  fidelidade: number | null
  usos: number
  criado_em: string
}

export function rowToMeuTemplate(r: Row): MeuTemplate {
  return { id: r.id, nome: r.nome, origem: "inspiração", frames: r.estrutura.length, usos: r.usos, templateId: r.template_base ?? "molde-benchmark", estrutura: r.estrutura, fidelidade: r.fidelidade, criadoEm: r.criado_em }
}

const COLS = "id, nome, template_base, estrutura, fidelidade, usos, criado_em"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const { data, error } = await admin.from("conteudo_meus_templates").select(COLS).eq("org_id", orgId).order("criado_em", { ascending: false }).returns<Row[]>()
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
    const { data, error } = await admin
      .from("conteudo_meus_templates")
      .insert({ org_id: orgId, nome: p.nome, template_base: p.templateId, estrutura: p.estrutura, fidelidade: p.fidelidade == null ? null : Math.round(p.fidelidade), usos: p.usos ?? 0, criado_por: user.id })
      .select(COLS)
      .single<Row>()
    if (error) throw error
    return successResponse(request, { template: rowToMeuTemplate(data) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-templates-post")
  }
}
