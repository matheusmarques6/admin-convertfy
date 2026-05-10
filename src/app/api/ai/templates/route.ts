import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { requireOrgAdmin } from "@/lib/api/require-org-admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const sp = request.nextUrl.searchParams
    const category = sp.get("category")
    let q = admin
      .from("ai_prompt_templates")
      .select("*")
      .eq("org_id", orgId)
      .order("category")
      .order("name")
    if (category) q = q.eq("category", category)
    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { templates: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "ai-templates-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await requireOrgAdmin(user.id, orgId)
    const admin = createAdminClient()
    const body = await request.json()
    if (!body.name || !body.category || !body.template) {
      throw new AppError("name, category, template obrigatorios", 400)
    }
    const { data, error } = await admin
      .from("ai_prompt_templates")
      .insert({
        org_id: orgId,
        name: body.name,
        category: body.category,
        template: body.template,
        variables: body.variables ?? [],
        is_default: body.is_default ?? false,
        created_by: user.id,
      })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { template: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "ai-templates-create")
  }
}
