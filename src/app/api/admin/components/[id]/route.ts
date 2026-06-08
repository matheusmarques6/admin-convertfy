/**
 * Biblioteca de componentes — detalhe (PATCH/DELETE).
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailComponent")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  html: z.string().min(1).optional(),
  slots: z.array(z.string()).optional(),
  niche_affinity: z.array(z.string()).optional(),
  positioning: z.array(z.string()).optional(),
  mood: z.array(z.string()).optional(),
  density: z.enum(["minimal", "balanced", "rich"]).nullable().optional(),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().nullable().optional(),
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
      .from("email_component_variants")
      .update(parsed)
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { variant: data })
  } catch (error) {
    log.error("component.patch", error)
    return errorResponse(request, error, "component-patch")
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
      .from("email_component_variants")
      .delete()
      .eq("id", id)
    if (error) throw error
    return successResponse(request, { deleted: true })
  } catch (error) {
    log.error("component.delete", error)
    return errorResponse(request, error, "component-delete")
  }
}
