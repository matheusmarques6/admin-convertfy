/**
 * POST /api/admin/stores/reports/[reportId]/resync
 *
 * Recomputa o snapshot do relatório a partir dos dados atuais (Omnisend
 * cache + Shopify + soma dos rows). Usado quando o snapshot original ficou
 * com KPIs zerados ou o periodo nao matched o cache.
 *
 * Mantem os campos editorial (proximos_passos, insights) intactos.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { assertReportInUserOrg } from "@/lib/api/store-org-guard"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import {
  fetchSnapshotSources,
  buildReportSnapshot,
} from "@/lib/services/report-snapshot.service"

export const dynamic = "force-dynamic"
export const maxDuration = 90

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertReportInUserOrg(admin, user.id, reportId)

    const { data: report, error: fetchErr } = await admin
      .from("client_monthly_reports")
      .select("id, store_id, period_start, period_end, snapshot")
      .eq("id", reportId)
      .single()
    if (fetchErr || !report) throw new AppError("Relatório não encontrado", 404)

    // Recomputa o snapshot com o módulo compartilhado (mesma lógica da
    // criação — antes eram duas cópias divergentes). force_refresh e o
    // timeout de 75s por fetch ficam dentro de fetchSnapshotSources.
    const sources = await fetchSnapshotSources({
      origin: request.nextUrl.origin,
      cookie: request.headers.get("cookie") ?? "",
      storeId: report.store_id,
      periodStart: report.period_start,
      periodEnd: report.period_end,
      admin,
    })
    const core = buildReportSnapshot({
      sources,
      periodStart: report.period_start,
      periodEnd: report.period_end,
    })

    // Preserva campos editoriais do snapshot anterior (tone, insights,
    // extras) — o spread do core sobrescreve apenas os dados recomputados.
    const oldSnapshot = (report.snapshot ?? {}) as Record<string, unknown>
    const oldInsights = (oldSnapshot.insights ?? {}) as Record<string, unknown>

    const snapshot = {
      ...oldSnapshot,
      ...core,
      insights: oldInsights,
    }

    const { error: updateErr } = await admin
      .from("client_monthly_reports")
      .update({ snapshot })
      .eq("id", reportId)
    if (updateErr) throw updateErr

    return successResponse(request, {
      resynced: true,
      kpis: snapshot.kpis,
    })
  } catch (error) {
    return errorResponse(request, error, "report-resync")
  }
}
