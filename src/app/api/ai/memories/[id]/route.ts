/**
 * PATCH  /api/ai/memories/[id] — aprovar/rejeitar ({status}) ou editar
 *        ({content, kind, store_id}) uma memória da org.
 * DELETE /api/ai/memories/[id] — remove de vez.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { MEMORY_KINDS } from "@/lib/ai/convertia/memories"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  content: z.string().min(3).max(600).optional(),
  kind: z.enum(MEMORY_KINDS).optional(),
  store_id: z.string().uuid().nullable().optional(),
})

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const body = patchSchema.parse(await request.json())

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.content !== undefined) patch.content = body.content.replace(/\s+/g, " ").trim()
    if (body.kind !== undefined) patch.kind = body.kind
    if (body.store_id !== undefined) {
      if (body.store_id) {
        const { data: store } = await admin.from("client_stores").select("id").eq("id", body.store_id).eq("org_id", orgId).maybeSingle()
        if (!store) throw new AppError("Loja não encontrada nesta organização", 404, "not-found")
      }
      patch.store_id = body.store_id
    }
    if (body.status !== undefined) {
      patch.status = body.status
      patch.reviewed_by = user.id
      patch.reviewed_at = new Date().toISOString()
    }
    const { data, error } = await admin
      .from("ai_memories")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, store_id, content, kind, status, source, created_at, reviewed_at")
      .maybeSingle()
    if (error) throw error
    if (!data) throw new AppError("Memória não encontrada", 404, "not-found")
    return successResponse(request, { memory: data })
  } catch (error) {
    return errorResponse(request, error, "ai-memories-patch")
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const { error } = await admin.from("ai_memories").delete().eq("id", id).eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "ai-memories-delete")
  }
}
