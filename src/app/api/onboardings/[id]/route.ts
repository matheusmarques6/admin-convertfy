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

    const { data: onb, error } = await admin
      .from("onboardings")
      .select(
        `*,
         client:clients(id, name, company, email, phone),
         store:client_stores(id, store_name, store_url, platform),
         source_deal:deals(id, title, value),
         current_column:operational_pipeline_columns(*),
         tasks(id, title, status, priority, assignee_role, operational_column_id, due_date, metadata),
         versions:onboarding_versions(*)`,
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (error) throw error
    if (!onb) throw new AppError("Onboarding nao encontrado", 404)

    // Tambem retorna todas as colunas da pipeline (pra UI saber a sequencia)
    const { data: columns } = await admin
      .from("operational_pipeline_columns")
      .select("*")
      .eq("pipeline_id", onb.pipeline_id)
      .order("position", { ascending: true })

    // Deliverables das tasks
    const taskIds = ((onb.tasks ?? []) as Array<{ id: string }>).map((t) => t.id)
    const { data: deliverables } = taskIds.length
      ? await admin.from("task_deliverables").select("*").in("task_id", taskIds)
      : { data: [] }

    return successResponse(request, {
      onboarding: onb,
      columns: columns ?? [],
      deliverables: deliverables ?? [],
    })
  } catch (error) {
    return errorResponse(request, error, "onboarding-get")
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

    const allowed = [
      "payment_status",
      "contract_status",
      "form_responses",
      "briefing",
      "briefing_status",
      "status",
    ]
    const patch: Record<string, unknown> = {}
    for (const f of allowed) if (body[f] !== undefined) patch[f] = body[f]

    const { data, error } = await admin
      .from("onboardings")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { onboarding: data })
  } catch (error) {
    return errorResponse(request, error, "onboarding-patch")
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
    // Soft cancel
    const { error } = await admin
      .from("onboardings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "onboarding-delete")
  }
}
