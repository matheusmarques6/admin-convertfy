/**
 * GET  /api/conteudo/templates — templates do time (criados de inspiração).
 * POST /api/conteudo/templates — cria { nome, templateId, estrutura, fidelidade? }.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { ehFamilia } from "@/lib/conteudo/familias"
import { TEMPLATE_PADRAO_ID } from "@/lib/conteudo/templates"
import type { EstruturaDetectada, MeuTemplate } from "@/lib/conteudo/types"

export const dynamic = "force-dynamic"

const estruturaSchema = z
  .array(z.object({ tipo: z.enum(["capa", "dado", "texto", "prova", "lista", "mec", "cta"]), slotImagem: z.boolean().optional(), descricao: z.string().max(200).optional() }))
  .min(3)
  .max(30)

export const criarSchema = z.object({
  nome: z.string().min(1).max(120),
  templateId: z.string().max(80),
  familia: z.enum(["padrao", "editorial", "alternado", "post", "post-largo"]).optional(),
  estrutura: estruturaSchema,
  fidelidade: z.number().min(0).max(100).nullable().optional(),
  usos: z.number().int().min(0).optional(),
})

export interface Row {
  id: string
  nome: string
  template_base: string | null
  familia?: string | null
  estrutura: EstruturaDetectada[]
  fidelidade: number | null
  usos: number
  criado_em: string
}

export function rowToMeuTemplate(r: Row): MeuTemplate {
  return {
    id: r.id,
    nome: r.nome,
    origem: "inspiração",
    frames: r.estrutura.length,
    usos: r.usos,
    templateId: r.template_base ?? TEMPLATE_PADRAO_ID,
    ...(ehFamilia(r.familia) ? { familia: r.familia } : {}),
    estrutura: r.estrutura,
    fidelidade: r.fidelidade,
    criadoEm: r.criado_em,
  }
}

export const COLS = "id, nome, template_base, familia, estrutura, fidelidade, usos, criado_em"
/** Sem a migration 20261157: a prateleira funciona, a prévia herda do molde. */
export const COLS_SEM_FAMILIA = "id, nome, template_base, estrutura, fidelidade, usos, criado_em"

/** 42703/PGRST204 falando da coluna nova — a migration deste repo escorrega. */
export function semColunaFamilia(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false
  if (e.code !== "42703" && e.code !== "PGRST204") return false
  return (e.message ?? "").includes("familia")
}

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
