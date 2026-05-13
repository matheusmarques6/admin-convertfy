import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; blockId: string }> },
) {
  try {
    const { id: pageId, blockId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const body = await request.json()

    // Verifica que block pertence a uma page da org
    const { data: page } = await admin
      .from("tutorial_pages")
      .select("id")
      .eq("id", pageId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!page)
      return errorResponse(
        request,
        new Error("Page nao encontrada"),
        "tutorial-block-patch",
      )

    const patch: Record<string, unknown> = {}
    if (body.content !== undefined) patch.content = body.content
    if (body.position !== undefined) patch.position = body.position
    if (body.type !== undefined) patch.type = body.type

    const { data, error } = await admin
      .from("tutorial_blocks")
      .update(patch)
      .eq("id", blockId)
      .eq("page_id", pageId)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { block: data })
  } catch (error) {
    return errorResponse(request, error, "tutorial-block-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; blockId: string }> },
) {
  try {
    const { id: pageId, blockId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const { data: page } = await admin
      .from("tutorial_pages")
      .select("id")
      .eq("id", pageId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!page) throw new Error("Page nao encontrada")
    const { error } = await admin
      .from("tutorial_blocks")
      .delete()
      .eq("id", blockId)
      .eq("page_id", pageId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "tutorial-block-delete")
  }
}
