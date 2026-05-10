/**
 * POST /api/stores/[id]/weekly-report/review
 *
 * Marca o relatorio da semana como revisado pelo CS.
 * Body: { week: "YYYY-MM-DD" }
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
import { logger } from "@/lib/logger"

const log = logger.child("StoreWeeklyReportReview")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json().catch(() => ({}))
    if (!body.week) throw new AppError("week obrigatorio", 400)

    const { error } = await admin
      .from("weekly_reports")
      .update({
        is_reviewed: true,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("week_start", body.week)
      .eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Review error", error)
    return errorResponse(request, error, "store-weekly-report-review")
  }
}
