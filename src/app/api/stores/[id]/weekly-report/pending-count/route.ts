/**
 * GET /api/stores/[id]/weekly-report/pending-count
 *
 * Retorna quantos relatorios semanais existem nao revisados pra esta
 * loja (badge no header).
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

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

    const { count } = await admin
      .from("weekly_reports")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("org_id", orgId)
      .eq("is_reviewed", false)

    return successResponse(request, { pending: count ?? 0 })
  } catch (error) {
    return errorResponse(request, error, "weekly-report-pending-count")
  }
}
