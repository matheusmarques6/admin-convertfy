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

const VALID_STAGES = new Set([
  "idea",
  "briefing",
  "copy_creation",
  "design",
  "review",
  "ready_to_deploy",
  "deploying",
  "deployed",
])

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

    if (!body.stage || !VALID_STAGES.has(body.stage)) {
      throw new AppError("stage invalida", 400)
    }

    const { data, error } = await admin
      .from("campaign_pipeline_items")
      .update({ stage: body.stage })
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { item: data })
  } catch (error) {
    return errorResponse(request, error, "campaign-pipeline-move")
  }
}
