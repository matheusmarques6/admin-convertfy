/**
 * PATCH /api/admin/email-flows/[flowId]
 *   Atualiza status, nome ou descricao de um flow.
 *   Status validos: blocked, in_progress, ready_for_review, approved, live.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailFlow")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z
    .enum(["blocked", "in_progress", "ready_for_review", "approved", "live"])
    .optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ flowId: string }> },
) {
  try {
    const { flowId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { error } = await admin
      .from("email_flows")
      .update(parsed)
      .eq("id", flowId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Flow PATCH error:", error)
    return errorResponse(request, error, "flow-patch")
  }
}
