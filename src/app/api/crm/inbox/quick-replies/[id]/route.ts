/**
 * PATCH/DELETE /api/crm/inbox/quick-replies/[id]
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

async function resolveOrgId(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()
  if (!data?.org_id) throw new AppError("Acesso negado: usuario sem organizacao", 403)
  return data.org_id
}

const patchSchema = z.object({
  shortcut: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i)
    .optional(),
  title: z.string().max(120).nullable().optional(),
  body: z.string().min(1).max(4000).optional(),
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
    const orgId = await resolveOrgId(admin, user.id)

    const parsed = patchSchema.parse(await request.json())
    const update: Record<string, unknown> = {}
    if (parsed.shortcut !== undefined) update.shortcut = parsed.shortcut.toLowerCase()
    if (parsed.title !== undefined) update.title = parsed.title
    if (parsed.body !== undefined) update.body = parsed.body
    if (Object.keys(update).length === 0) {
      throw new AppError("Nada pra atualizar", 400, "validation")
    }

    const { data, error } = await admin
      .from("crm_quick_replies")
      .update(update)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, shortcut, title, body")
      .single()

    if (error) throw error
    return successResponse(request, { quick_reply: data })
  } catch (error) {
    return errorResponse(request, error, "crm-quick-replies-update")
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
    const orgId = await resolveOrgId(admin, user.id)

    const { error } = await admin.from("crm_quick_replies").delete().eq("id", id).eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "crm-quick-replies-delete")
  }
}
