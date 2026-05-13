import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pageId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    // Verifica ownership
    const { data: page } = await admin
      .from("tutorial_pages")
      .select("id")
      .eq("id", pageId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!page) throw new AppError("Page nao encontrada", 404)

    const body = await request.json()
    if (!body.type) throw new AppError("type obrigatorio", 400)

    // Calcula proxima position
    const { count } = await admin
      .from("tutorial_blocks")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
    const position = body.position ?? count ?? 0

    const { data, error } = await admin
      .from("tutorial_blocks")
      .insert({
        page_id: pageId,
        type: body.type,
        position,
        content: body.content ?? {},
      })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { block: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "tutorial-blocks-create")
  }
}
