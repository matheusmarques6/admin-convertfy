import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { ensureOnboardingBootstrap } from "@/lib/services/onboarding-bootstrap.service"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await ensureOnboardingBootstrap(orgId, user.id)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("tutorial_pages")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
    if (error) throw error
    return successResponse(request, { pages: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "tutorial-pages-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await requireOnboardingPermission(user.id, "admin")
    const admin = createAdminClient()
    const body = await request.json()
    if (!body.slug || !body.name) throw new AppError("slug e name obrigatorios", 400)
    const { data, error } = await admin
      .from("tutorial_pages")
      .insert({
        org_id: orgId,
        slug: body.slug,
        name: body.name,
        description: body.description ?? null,
        status: body.status ?? "draft",
        created_by: user.id,
        updated_by: user.id,
      })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { page: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "tutorial-pages-create")
  }
}
