import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailReferenceTemplate")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  flow_type: z.string().optional().nullable(),
  email_number: z.number().int().min(1).optional().nullable(),
  html: z.string().optional().nullable(),
  copy: z.string().optional().nullable(),
  thumbnail: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
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

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    const { data, error } = await admin
      .from("email_reference_templates")
      .update(parsed)
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error

    return successResponse(request, { template: data })
  } catch (error) {
    log.error("ReferenceTemplate PATCH error:", error)
    return errorResponse(request, error, "ref-template-patch")
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
      .from("email_reference_templates")
      .delete()
      .eq("id", id)

    if (error) throw error

    return successResponse(request, { deleted: true })
  } catch (error) {
    log.error("ReferenceTemplate DELETE error:", error)
    return errorResponse(request, error, "ref-template-delete")
  }
}
