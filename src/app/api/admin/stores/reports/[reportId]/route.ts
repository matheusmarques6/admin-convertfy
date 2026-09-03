/**
 * GET    /api/admin/stores/reports/[reportId] — busca relatório
 * PATCH  /api/admin/stores/reports/[reportId] — atualiza status/proximos_passos/snapshot
 * DELETE /api/admin/stores/reports/[reportId] — exclui
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { mergeKpisOverrides } from "@/lib/services/report-overrides.service"
import { assertReportInUserOrg } from "@/lib/api/store-org-guard"
import type { ReportKpisOverrides, ReportKpisOverridesPatch } from "@/types/monthly-report"

export const dynamic = "force-dynamic"

// ── Overrides de KPIs (edição manual dos números do relatório) ──────────
// Folhas nullable: null = restaurar campo (remove a chave persistida).
const money = z.number().finite().min(0)
const count = z.number().int().min(0)
const rate100 = z.number().min(0).max(100)
const orNull = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional()

const kpisOverridesPatchSchema = z
  .object({
    // Moeda de exibição (ISO 4217); null = restaurar a do snapshot.
    currency: orNull(z.string().regex(/^[A-Z]{3}$/)),
    kpis: z
      .object({
        receita_total: orNull(money),
        receita_atribuida: orNull(money),
        atribuicao_pct: orNull(z.number().min(0).max(1)), // fração 0-1
        receita_campanhas: orNull(money),
        receita_flows: orNull(money),
        pedidos_loja: orNull(count),
        pedidos_atribuidos: orNull(count),
        ticket_medio: orNull(money),
        ticket_medio_atribuido: orNull(money),
        novos_clientes: orNull(count),
        envios: orNull(count),
        total_leads: orNull(count),
        open_rate: orNull(rate100),
        click_rate: orNull(rate100),
        opened_unique: orNull(count),
        clicked_unique: orNull(count),
        spam_rate: orNull(rate100),
        recovery_rate: orNull(rate100),
        total_campaigns: orNull(count),
        total_flows: orNull(count),
      })
      .strict()
      .optional(),
    email: z
      .object({
        delivered: orNull(count),
        open_rate: orNull(rate100),
        click_rate: orNull(rate100),
        ctor: orNull(rate100),
        bounce_rate: orNull(rate100),
        unsub_rate: orNull(rate100),
      })
      .strict()
      .optional(),
    campaigns: z
      .record(
        z.string().min(1),
        z.object({ revenue: orNull(money), name: orNull(z.string().min(1).max(300)) }).strict(),
      )
      .optional(),
    flows: z
      .record(
        z.string().min(1),
        z.object({ revenue: orNull(money), name: orNull(z.string().min(1).max(300)) }).strict(),
      )
      .optional(),
  })
  .strict()

const patchSchema = z.object({
  status: z.enum(["draft", "sent", "presented"]).optional(),
  proximos_passos: z.string().nullable().optional(),
  snapshot: z.record(z.string(), z.unknown()).optional(),
  sent_to: z.string().nullable().optional(),
  pdf_url: z.string().nullable().optional(),
  kpis_overrides: kpisOverridesPatchSchema.optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertReportInUserOrg(admin, user.id, reportId)
    const { data, error } = await admin
      .from("client_monthly_reports")
      .select("*")
      .eq("id", reportId)
      .single()
    if (error) throw error
    return successResponse(request, { report: data })
  } catch (e) {
    return errorResponse(request, e, "report-get")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertReportInUserOrg(admin, user.id, reportId)

    const raw = await request.json()
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data
    const update: Record<string, unknown> = {}
    if (body.status !== undefined) {
      update.status = body.status
      if (body.status === "presented") update.presented_at = new Date().toISOString()
    }
    if (body.proximos_passos !== undefined) update.proximos_passos = body.proximos_passos
    if (body.snapshot !== undefined) update.snapshot = body.snapshot
    if (body.sent_to !== undefined) update.sent_to = body.sent_to
    if (body.pdf_url !== undefined) update.pdf_url = body.pdf_url

    // Edição manual de números: merge server-side sobre os overrides
    // persistidos (null nas folhas = restaurar). Nunca toca o snapshot cru.
    if (body.kpis_overrides !== undefined) {
      const { data: current } = await admin
        .from("client_monthly_reports")
        .select("kpis_overrides")
        .eq("id", reportId)
        .single()
      const prev = (current?.kpis_overrides ?? {}) as ReportKpisOverrides
      update.kpis_overrides = mergeKpisOverrides(
        prev,
        body.kpis_overrides as ReportKpisOverridesPatch,
      )
      update.edited_by = user.id
      update.edited_at = new Date().toISOString()
    }

    const { error } = await admin
      .from("client_monthly_reports")
      .update(update)
      .eq("id", reportId)
    if (error) throw error
    return successResponse(request, { updated: true })
  } catch (e) {
    return errorResponse(request, e, "report-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertReportInUserOrg(admin, user.id, reportId)
    const { error } = await admin
      .from("client_monthly_reports")
      .delete()
      .eq("id", reportId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (e) {
    return errorResponse(request, e, "report-delete")
  }
}
