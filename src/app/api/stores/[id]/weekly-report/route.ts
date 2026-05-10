/**
 * GET  /api/stores/[id]/weekly-report?week=YYYY-MM-DD
 *      Retorna o relatorio da semana especificada (ou da ultima
 *      fechada se omitido). Se nao existir, gera on-demand.
 *
 * POST /api/stores/[id]/weekly-report/review
 *      (na rota /review) Marca como revisado.
 */

import { NextRequest } from "next/server"
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
  generateWeeklyReport,
  startOfWeek,
} from "@/lib/services/weekly-report.service"
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
