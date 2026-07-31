/**
 * DELETE /api/crm/goals/[id] — remove a meta
 *
 * Editar valor é feito pelo POST (upsert por período); aqui só a
 * remoção, para quando a meta foi cadastrada por engano.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmGoalDetail")

export const dynamic = "force-dynamic"

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: org } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!org?.org_id) throw new AppError("Sem org membership", 403)

    const { error } = await admin
      .from("crm_sales_goals")
      .delete()
      .eq("id", id)
      .eq("org_id", org.org_id)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Goal DELETE error:", error)
    return errorResponse(request, error, "crm-goal-delete")
  }
}
