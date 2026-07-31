/**
 * PATCH  /api/crm/saved-views/[id]  — renomeia / atualiza o recorte
 * DELETE /api/crm/saved-views/[id]  — remove a visão
 *
 * Só o dono altera ou remove — inclusive as compartilhadas. Colega que
 * usa uma visão da equipe não pode reescrevê-la sem querer.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmSavedViewDetail")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  sort: z.string().max(40).optional(),
  view_mode: z.enum(["kanban", "table"]).optional(),
  columns: z.array(z.string().max(40)).max(30).optional(),
  is_shared: z.boolean().optional(),
})

async function assertOwner(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  userId: string,
) {
  const { data } = await admin
    .from("crm_saved_views")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle()

  if (!data) throw new AppError("Visão não encontrada", 404, "not-found")
  if (data.created_by !== userId) {
    throw new AppError(
      "Só quem criou esta visão pode alterá-la.",
      403,
      "forbidden",
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    await assertOwner(admin, id, user.id)

    const body = await request.json()
    const parsed = patchSchema.parse(body)
    if (Object.keys(parsed).length === 0) {
      return successResponse(request, { ok: true })
    }

    const { data, error } = await admin
      .from("crm_saved_views")
      .update(parsed)
      .eq("id", id)
      .select(
        "id, pipeline_id, scope, name, filters, sort, view_mode, columns, is_shared, created_by, created_at, updated_at",
      )
      .single()

    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          "Você já tem uma visão com esse nome neste pipeline.",
          409,
          "conflict",
        )
      }
      throw error
    }

    return successResponse(request, { view: { ...data, is_owner: true } })
  } catch (error) {
    log.error("Saved view PATCH error:", error)
    return errorResponse(request, error, "crm-saved-view-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    await assertOwner(admin, id, user.id)

    const { error } = await admin.from("crm_saved_views").delete().eq("id", id)
    if (error) throw error

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Saved view DELETE error:", error)
    return errorResponse(request, error, "crm-saved-view-delete")
  }
}
