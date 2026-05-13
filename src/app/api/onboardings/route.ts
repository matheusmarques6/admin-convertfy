/**
 * GET  /api/onboardings  — lista onboardings da org (Kanban)
 * POST /api/onboardings  — cria onboarding manual (selecionando client+store)
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
import {
  createOnboarding,
} from "@/lib/services/onboarding-pipeline.service"
import { ensureOnboardingBootstrap } from "@/lib/services/onboarding-bootstrap.service"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingsApi")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    await ensureOnboardingBootstrap(orgId, user.id)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const status = sp.get("status")

    let q = admin
      .from("onboardings")
      .select(
        `*,
         client:clients(id, name, company),
         store:client_stores(id, store_name, store_url, platform),
         current_column:operational_pipeline_columns(*),
         tasks(id, title, status, priority, assignee_role, operational_column_id, due_date)`,
      )
      .eq("org_id", orgId)
      .order("entered_at", { ascending: false })

    if (status) q = q.eq("status", status)
    else q = q.eq("status", "in_progress")

    const { data, error } = await q
    if (error) throw error

    // Tambem retorna a pipeline + colunas
    const { data: pipeline } = await admin
      .from("operational_pipelines")
      .select("*")
      .eq("org_id", orgId)
      .eq("type", "onboarding")
      .eq("is_active", true)
      .maybeSingle()

    const { data: columns } = await admin
      .from("operational_pipeline_columns")
      .select("*")
      .eq("pipeline_id", pipeline?.id ?? "")
      .order("position", { ascending: true })

    return successResponse(request, {
      pipeline,
      columns: columns ?? [],
      onboardings: data ?? [],
    })
  } catch (error) {
    log.error("List error", error)
    return errorResponse(request, error, "onboardings-list")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()
    if (!body.client_id || !body.store_id) {
      throw new AppError("client_id e store_id sao obrigatorios", 400)
    }

    const result = await createOnboarding({
      orgId,
      clientId: body.client_id,
      storeId: body.store_id,
      sourceDealId: body.source_deal_id ?? null,
      createdBy: user.id,
    })

    return successResponse(
      request,
      { onboarding: result.onboarding, created: result.created },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    log.error("Create error", error)
    return errorResponse(request, error, "onboardings-create")
  }
}
