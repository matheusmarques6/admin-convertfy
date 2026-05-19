/**
 * PATCH  /api/admin/email-qa/[itemId]
 *   Atualiza um item de QA (toggle done, notas).
 *
 * DELETE /api/admin/email-qa/[itemId]
 *   Remove o item.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailQAItem")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  done: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  label: z.string().min(1).max(120).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const update: Record<string, unknown> = { ...parsed }
    if (parsed.done !== undefined) {
      update.done_at = parsed.done ? new Date().toISOString() : null
      update.done_by = parsed.done ? user.id : null
    }

    const { error } = await admin
      .from("email_qa_checklist")
      .update(update)
      .eq("id", itemId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("QA PATCH error:", error)
    return errorResponse(request, error, "qa-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { error } = await admin
      .from("email_qa_checklist")
      .delete()
      .eq("id", itemId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("QA DELETE error:", error)
    return errorResponse(request, error, "qa-delete")
  }
}
