/**
 * GET  /api/campaign-pipeline   — lista items com filtros
 * POST /api/campaign-pipeline   — cria novo item
 */

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

const log = logger.child("CampaignPipeline")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const stage = sp.get("stage")
    const assignedTo = sp.get("assigned_to")
    const campaignType = sp.get("campaign_type")

    let q = admin
      .from("campaign_pipeline_items")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (stage) q = q.eq("stage", stage)
    if (assignedTo) q = q.eq("assigned_to", assignedTo)
    if (campaignType) q = q.eq("campaign_type", campaignType)

    const { data, error } = await q
    if (error) throw error
    return successResponse(request, { items: data ?? [] })
  } catch (error) {
    log.error("List error", error)
    return errorResponse(request, error, "campaign-pipeline-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    if (!body.title) throw new AppError("title obrigatorio", 400)

    const { data, error } = await admin
      .from("campaign_pipeline_items")
      .insert({
        org_id: orgId,
        title: body.title,
        description: body.description ?? null,
        stage: body.stage ?? "idea",
        campaign_type: body.campaign_type ?? null,
        subject_line: body.subject_line ?? null,
        preview_text: body.preview_text ?? null,
        copy_data: body.copy_data ?? {},
        design_data: body.design_data ?? {},
        target_stores: body.target_stores ?? [],
        deploy_config: body.deploy_config ?? {},
        priority: body.priority ?? "medium",
        due_date: body.due_date ?? null,
        tags: body.tags ?? [],
        created_by: user.id,
      })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { item: data }, { status: 201 })
  } catch (error) {
    log.error("Create error", error)
    return errorResponse(request, error, "campaign-pipeline-create")
  }
}
