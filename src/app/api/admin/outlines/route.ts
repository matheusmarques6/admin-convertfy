/**
 * Estrutura geral (Epic AE — input do agente gerador).
 * GET: lista outlines (filtro flow_type). POST: cria.
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { normalizeSuggestedBlocks } from "@/lib/agents/shared/component-categories"

const log = logger.child("EmailOutlines")

export const dynamic = "force-dynamic"

// Mapa { idioma: código } — chaves e valores não vazios. Normaliza pra evitar
// entradas em branco vindas da UI (linha adicionada e não preenchida).
const couponCodesSchema = z
  .record(z.string(), z.string())
  .default({})
  .transform((rec) => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(rec)) {
      const key = k.trim()
      const code = (v ?? "").trim()
      if (key && code) out[key] = code
    }
    return out
  })

const postSchema = z.object({
  flow_type: z.string().min(1),
  email_number: z.number().int().min(1),
  objective: z.string().min(1),
  guidance: z.string().nullable().optional(),
  // Fixa nas 8 categorias canônicas — descarta qualquer coisa fora do
  // vocabulário (fonte de acertividade do Montador).
  suggested_blocks: z
    .array(z.string())
    .default([])
    .transform(normalizeSuggestedBlocks),
  tone_hint: z.string().nullable().optional(),
  coupon_codes: couponCodesSchema,
  is_active: z.boolean().default(true),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const flowType = request.nextUrl.searchParams.get("flow_type")
    let query = admin
      .from("email_outline_templates")
      .select("*")
      .order("flow_type", { ascending: true })
      .order("email_number", { ascending: true })
    if (flowType) query = query.eq("flow_type", flowType)

    const { data, error } = await query
    if (error) throw error
    return successResponse(request, { outlines: data ?? [] })
  } catch (error) {
    log.error("outlines.get", error)
    return errorResponse(request, error, "outlines-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const parsed = postSchema.parse(await request.json())
    const { data, error } = await admin
      .from("email_outline_templates")
      .insert({ ...parsed, created_by: user.id })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { outline: data }, { status: 201 })
  } catch (error) {
    log.error("outlines.post", error)
    return errorResponse(request, error, "outlines-post")
  }
}
