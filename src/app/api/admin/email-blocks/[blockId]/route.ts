/**
 * PATCH  /api/admin/email-blocks/[blockId]
 *   Atualiza um bloco (content, applied, label). Trigger no banco
 *   recalcula automaticamente o progresso do email + flow.
 *
 * DELETE /api/admin/email-blocks/[blockId]
 *   Remove o bloco. Trigger recalcula progresso.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailBlock")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  position: z.number().int().min(1).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  applied: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ blockId: string }> },
) {
  try {
    const { blockId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const update: Record<string, unknown> = { ...parsed }
    if (parsed.applied !== undefined) {
      update.applied_at = parsed.applied ? new Date().toISOString() : null
      update.applied_by = parsed.applied ? user.id : null
    }

    const { error } = await admin
      .from("email_blocks")
      .update(update)
      .eq("id", blockId)

    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Block PATCH error:", error)
    return errorResponse(request, error, "block-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ blockId: string }> },
) {
  try {
    const { blockId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { error } = await admin
      .from("email_blocks")
      .delete()
      .eq("id", blockId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Block DELETE error:", error)
    return errorResponse(request, error, "block-delete")
  }
}
