/**
 * PATCH/DELETE /api/ai/skills/[id] — edição e remoção de skill da
 * ConvertIA (escopo: skills da org do usuário).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(200).nullable().optional(),
  icon: z.string().max(30).nullable().optional(),
  workspace: z.enum(["operacional", "comercial", "geral"]).optional(),
  instructions: z.string().min(10).max(8000).optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const parsed = patchSchema.parse(await request.json())
    const { data, error } = await admin
      .from("ai_skills")
      .update({ ...parsed, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, name, description, icon, workspace, instructions, is_active")
      .single()
    if (error) throw error
    return successResponse(request, { skill: data })
  } catch (error) {
    return errorResponse(request, error, "ai-skills-patch")
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
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const { error } = await admin.from("ai_skills").delete().eq("id", id).eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "ai-skills-delete")
  }
}
