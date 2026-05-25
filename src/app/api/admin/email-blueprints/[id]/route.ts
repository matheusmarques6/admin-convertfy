import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailBlueprint")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  objective: z.string().min(1).optional(),
  messaging: z.string().min(1).optional(),
  subject_hint: z.string().nullable().optional(),
  blocks: z.array(z.record(z.string(), z.unknown())).optional(),
  tone_override: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { error } = await admin
      .from("email_blueprints")
      .update({
        ...parsed,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", id)

    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Blueprint PATCH error:", error)
    return errorResponse(request, error, "blueprint-patch")
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
      .from("email_blueprints")
      .delete()
      .eq("id", id)

    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Blueprint DELETE error:", error)
    return errorResponse(request, error, "blueprint-delete")
  }
}
