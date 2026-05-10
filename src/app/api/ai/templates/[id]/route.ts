import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { requireOrgAdmin } from "@/lib/api/require-org-admin"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await requireOrgAdmin(user.id, orgId)
    const admin = createAdminClient()
    const body = await request.json()
    const patch: Record<string, unknown> = {}
    for (const k of ["name", "category", "template", "variables", "is_default"]) {
      if (body[k] !== undefined) patch[k] = body[k]
    }
    const { data, error } = await admin
      .from("ai_prompt_templates")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { template: data })
  } catch (error) {
    return errorResponse(request, error, "ai-templates-patch")
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
    await requireOrgAdmin(user.id, orgId)
    const admin = createAdminClient()
    const { error } = await admin
      .from("ai_prompt_templates")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "ai-templates-delete")
  }
}
