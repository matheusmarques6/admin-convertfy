/**
 * GET  /api/stores/[id]/weekly-report?week=YYYY-MM-DD
 *      Retorna o relatorio da semana especificada (ou da ultima
 *      fechada se omitido). Se nao existir, gera on-demand.
 *
 * POST /api/stores/[id]/weekly-report/review
 *      (na rota /review) Marca como revisado.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  addDays,
  applyMetricsOverrides,
  generateWeeklyReport,
  startOfWeek,
} from "@/lib/services/weekly-report.service"
import type { WeeklyReportMetrics } from "@/types/weekly-report"
import { logger } from "@/lib/logger"

const log = logger.child("StoreWeeklyReport")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    // Confirma loja pertence a org
    const { data: store } = await admin
      .from("client_stores")
      .select("id, store_name, platform, org_id")
      .eq("id", storeId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!store) throw new AppError("Loja nao encontrada", 404)

    const sp = request.nextUrl.searchParams
    const weekParam = sp.get("week")
    const start = weekParam
      ? startOfWeek(new Date(weekParam + "T00:00:00Z"))
      : startOfWeek(addDays(new Date(), -7))
    const end = addDays(start, 7)

    const weekStartStr = start.toISOString().slice(0, 10)

    const { data: existing } = await admin
      .from("weekly_reports")
      .select("*")
      .eq("store_id", storeId)
      .eq("week_start", weekStartStr)
      .maybeSingle()

    let report = existing
    if (!report) {
      report = await generateWeeklyReport(storeId, start, end)
    }

    // Aplica overrides manuais sobre metrics antes de retornar
    if (report) {
      const baseMetrics = (report.metrics ?? {}) as WeeklyReportMetrics
      const overrides = (report.metrics_overrides ?? null) as
        | Parameters<typeof applyMetricsOverrides>[1]
        | null
      report.metrics = applyMetricsOverrides(baseMetrics, overrides)
    }

    return successResponse(request, { store, report })
  } catch (error) {
    log.error("Weekly report GET error", error)
    return errorResponse(request, error, "store-weekly-report")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Forca geracao da semana atual (regenera se ja existe)
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("id, org_id")
      .eq("id", storeId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!store) throw new AppError("Loja nao encontrada", 404)

    const body = await request.json().catch(() => ({}))
    const weekParam = body.week as string | undefined
    const start = weekParam
      ? startOfWeek(new Date(weekParam + "T00:00:00Z"))
      : startOfWeek(addDays(new Date(), -7))
    const end = addDays(start, 7)

    const report = await generateWeeklyReport(storeId, start, end, {
      force: true,
    })
    return successResponse(request, { report })
  } catch (error) {
    log.error("Weekly report POST error", error)
    return errorResponse(request, error, "store-weekly-report-generate")
  }
}

// ── PATCH: edicao manual (overrides + listas + summary) ─────────
const patchSchema = z.object({
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metrics_overrides: z
    .object({
      revenue: z
        .object({
          current: z.number().nonnegative().optional(),
          previous: z.number().nonnegative().optional(),
        })
        .optional(),
      campaigns_sent: z.number().int().nonnegative().optional(),
      opens: z
        .object({
          current: z.number().int().nonnegative().optional(),
          rate: z.number().min(0).max(1).optional(),
        })
        .optional(),
      clicks: z
        .object({
          current: z.number().int().nonnegative().optional(),
          rate: z.number().min(0).max(1).optional(),
        })
        .optional(),
      paid_orders: z
        .object({
          count: z.number().int().nonnegative().optional(),
          value: z.number().nonnegative().optional(),
          previous_count: z.number().int().nonnegative().optional(),
          previous_value: z.number().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
  highlights: z.array(z.string().min(1).max(500)).max(20).optional(),
  concerns: z.array(z.string().min(1).max(500)).max(20).optional(),
  suggestions: z.array(z.string().min(1).max(500)).max(20).optional(),
  ai_summary: z.string().max(20_000).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("id, org_id")
      .eq("id", storeId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!store) throw new AppError("Loja nao encontrada", 404)

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    // Localiza o report da semana
    const { data: existing } = await admin
      .from("weekly_reports")
      .select("id, metrics_overrides, highlights, concerns, suggestions")
      .eq("store_id", storeId)
      .eq("week_start", parsed.week)
      .maybeSingle()
    if (!existing) {
      throw new AppError(
        "Relatorio nao encontrado para essa semana. Gere primeiro.",
        404,
      )
    }

    // Merge: mantem overrides anteriores + aplica os novos por chave
    const update: Record<string, unknown> = {
      edited_by: user.id,
      edited_at: new Date().toISOString(),
    }
    if (parsed.metrics_overrides) {
      const prev = (existing.metrics_overrides ?? {}) as Record<string, unknown>
      update.metrics_overrides = {
        ...prev,
        ...parsed.metrics_overrides,
        // deep-merge nas chaves aninhadas que recebemos
        ...(parsed.metrics_overrides.revenue
          ? {
              revenue: {
                ...((prev.revenue as object) ?? {}),
                ...parsed.metrics_overrides.revenue,
              },
            }
          : {}),
        ...(parsed.metrics_overrides.opens
          ? {
              opens: {
                ...((prev.opens as object) ?? {}),
                ...parsed.metrics_overrides.opens,
              },
            }
          : {}),
        ...(parsed.metrics_overrides.clicks
          ? {
              clicks: {
                ...((prev.clicks as object) ?? {}),
                ...parsed.metrics_overrides.clicks,
              },
            }
          : {}),
        ...(parsed.metrics_overrides.paid_orders
          ? {
              paid_orders: {
                ...((prev.paid_orders as object) ?? {}),
                ...parsed.metrics_overrides.paid_orders,
              },
            }
          : {}),
      }
    }
    if (parsed.highlights !== undefined) update.highlights = parsed.highlights
    if (parsed.concerns !== undefined) update.concerns = parsed.concerns
    if (parsed.suggestions !== undefined) update.suggestions = parsed.suggestions
    if (parsed.ai_summary !== undefined) update.ai_summary = parsed.ai_summary

    const { error: updateErr } = await admin
      .from("weekly_reports")
      .update(update)
      .eq("id", existing.id)
    if (updateErr) throw new AppError(updateErr.message, 500)

    log.info("Weekly report edited manually", {
      reportId: existing.id,
      storeId,
      userId: user.id,
      keys: Object.keys(parsed),
    })
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Weekly report PATCH error", error)
    return errorResponse(request, error, "store-weekly-report-edit")
  }
}
