import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getTutorialPageWithBlocks } from "@/lib/services/tutorial-page.service"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const page = await getTutorialPageWithBlocks(orgId, id)
    if (!page) throw new AppError("Tutorial nao encontrado", 404)
    return successResponse(request, { page })
  } catch (error) {
    return errorResponse(request, error, "tutorial-page-get")
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
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const body = await request.json()
    const patch: Record<string, unknown> = { updated_by: user.id }
    for (const f of ["name", "description", "status", "slug"]) {
      if (body[f] !== undefined) patch[f] = body[f]
    }
    const { data, error } = await admin
      .from("tutorial_pages")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { page: data })
  } catch (error) {
    return errorResponse(request, error, "tutorial-page-patch")
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
    const { error } = await admin
      .from("tutorial_pages")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "tutorial-page-delete")
  }
}
