/**
 * Estrutura geral — detalhe (PATCH/DELETE).
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailOutline")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  objective: z.string().min(1).optional(),
  guidance: z.string().nullable().optional(),
  suggested_blocks: z.array(z.string()).optional(),
  tone_hint: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const parsed = patchSchema.parse(await request.json())
    const { data, error } = await admin
      .from("email_outline_templates")
      .update(parsed)
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { outline: data })
  } catch (error) {
    log.error("outline.patch", error)
    return errorResponse(request, error, "outline-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { error } = await admin
      .from("email_outline_templates")
      .delete()
      .eq("id", id)
    if (error) throw error
    return successResponse(request, { deleted: true })
  } catch (error) {
    log.error("outline.delete", error)
    return errorResponse(request, error, "outline-delete")
  }
}
