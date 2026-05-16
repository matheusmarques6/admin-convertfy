/**
 * GET  /api/admin/stores/[id]/reports                 — lista
 * POST /api/admin/stores/[id]/reports                 — gera novo
 *
 * Tabela: client_monthly_reports
 *  - status: draft | sent | presented
 *  - snapshot: jsonb cristalizado no momento da geracao (dados imutaveis)
 *  - sections: jsonb { resumo: true, financeiro: true, ... }
 *  - tone: editorial | corporate | casual
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const sectionsSchema = z.object({
  resumo: z.boolean().default(true),
  financeiro: z.boolean().default(true),
  email_perf: z.boolean().default(true),
  top_campanhas: z.boolean().default(true),
  top_flows: z.boolean().default(true),
  trabalho: z.boolean().default(true),
  proximos: z.boolean().default(true),
})

const createSchema = z.object({
  period_start: z.string(), // YYYY-MM-DD
  period_end: z.string(),
  month_label: z.string().optional(),
  sections: sectionsSchema.default({
    resumo: true,
    financeiro: true,
    email_perf: true,
    top_campanhas: true,
    top_flows: true,
    trabalho: true,
    proximos: true,
  }),
  tone: z.enum(["editorial", "corporate", "casual"]).default("editorial"),
  proximos_passos: z.string().optional(),
  ai_filled: z.boolean().default(true),
})

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("client_monthly_reports")
      .select(
        "id, month_label, period_start, period_end, status, " +
          "generated_at, presented_at, sent_to, tone, ai_filled, pdf_url, " +
          "snapshot, generated_by, " +
          "generator:profiles!client_monthly_reports_generated_by_fkey(name, avatar_url)",
      )
      .eq("store_id", storeId)
      .order("period_start", { ascending: false })
    if (error) throw error
    return successResponse(request, { reports: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "store-reports-list")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data

    // Deriva month_label se nao veio
    const ps = new Date(body.period_start + "T12:00:00")
    const monthLabel =
      body.month_label ||
      `${MONTH_LABELS[ps.getMonth()]} ${ps.getFullYear()}`

    // Snapshot inicial — placeholder. Idealmente puxa de
    // /api/reports?store_id=... e congela aqui.
    const snapshot = {
      generated_at: new Date().toISOString(),
      period: { start: body.period_start, end: body.period_end },
      tone: body.tone,
      // estes ficam vazios por default e sao preenchidos pelo job
      // de "ai-fill" que pode rodar depois (ver /api/admin/stores/[id]/
      // reports/[reportId]/ai-fill).
      kpis: {},
      campaigns: [],
      flows: [],
      insights: {},
    }

    const { data, error } = await admin
      .from("client_monthly_reports")
      .insert({
        store_id: storeId,
        month_label: monthLabel,
        period_start: body.period_start,
        period_end: body.period_end,
        sections: body.sections,
        tone: body.tone,
        snapshot,
        proximos_passos: body.proximos_passos || null,
        ai_filled: body.ai_filled,
        generated_by: user.id,
        status: "draft",
      })
      .select("id")
      .single()
    if (error) throw error
    return successResponse(request, { id: data.id, month_label: monthLabel })
  } catch (error) {
    return errorResponse(request, error, "store-reports-create")
  }
}
