import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignPipelineItem")

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
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("campaign_pipeline_items")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new AppError("Nao encontrado", 404)
    return successResponse(request, { item: data })
  } catch (error) {
    log.error("Get error", error)
    return errorResponse(request, error, "campaign-pipeline-get")
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

    const fields = [
      "title",
      "description",
      "stage",
      "campaign_type",
      "subject_line",
      "preview_text",
      "copy_data",
      "design_data",
      "target_stores",
      "deploy_config",
      "assigned_to",
      "priority",
      "due_date",
      "tags",
      "omnisend_campaign_ids",
    ] as const
    const patch: Record<string, unknown> = {}
    for (const f of fields) if (body[f] !== undefined) patch[f] = body[f]

    const { data, error } = await admin
      .from("campaign_pipeline_items")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { item: data })
  } catch (error) {
    log.error("Patch error", error)
    return errorResponse(request, error, "campaign-pipeline-patch")
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
      .from("campaign_pipeline_items")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Delete error", error)
    return errorResponse(request, error, "campaign-pipeline-delete")
  }
}
