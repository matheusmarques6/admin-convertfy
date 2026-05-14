import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { requireOnboardingPermission } from "@/lib/api/onboarding-permissions"
import { ensureColumnTasks } from "@/lib/services/onboarding-pipeline.service"
import {
  resolveEffectiveStatuses,
  applyEffectiveStatuses,
} from "@/lib/services/onboarding-effective-status.service"

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
         client:clients!onboardings_client_id_fkey(id, name, company, email, phone),
         store:client_stores(id, store_name, store_url, platform),
         source_deal:deals(id, title, value),
         current_column:operational_pipeline_columns(*),
         tasks(id, title, status, priority, assignee_role, assignee_id, operational_column_id, due_date, metadata, version),
         versions:onboarding_versions(*)`,
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (error) throw error
    if (!onb) throw new AppError("Onboarding nao encontrado", 404)

    // Self-healing: se a coluna atual nao tem tasks instanciadas, instancia agora.
    // Cobre onboardings criados antes da refatoracao do instantiateTaskForColumn.
    const tasksInCurrent = ((onb.tasks ?? []) as Array<{
      operational_column_id?: string
    }>).filter((t) => t.operational_column_id === onb.current_column_id)
    if (
      onb.current_column_id &&
      tasksInCurrent.length === 0 &&
      onb.status === "in_progress"
    ) {
      await ensureColumnTasks(onb.id, onb.current_column_id, user.id)
      // refetch tasks apos instanciar
      const { data: refreshed } = await admin
        .from("onboardings")
        .select(
          `*,
           client:clients!onboardings_client_id_fkey(id, name, company, email, phone),
           store:client_stores(id, store_name, store_url, platform),
           source_deal:deals(id, title, value),
           current_column:operational_pipeline_columns(*),
           tasks(id, title, status, priority, assignee_role, assignee_id, operational_column_id, due_date, metadata, version),
           versions:onboarding_versions(*)`,
        )
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle()
      if (refreshed) Object.assign(onb, refreshed)
    }

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

    // Atividade recente — events entity_id = onboarding.id (top 20 ordenado desc)
    const { data: activityRaw } = await admin
      .from("events")
      .select("id, event_type, actor_id, actor_type, payload, created_at")
      .eq("entity_type", "onboarding")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(20)
    const actorIds = (activityRaw ?? [])
      .map((a) => a.actor_id as string | null)
      .filter((x): x is string => !!x)
    const { data: actorProfiles } = actorIds.length
      ? await admin
          .from("profiles")
          .select("id, name, avatar_url")
          .in("id", actorIds)
      : { data: [] }
    const profileMap = new Map(
      (actorProfiles ?? []).map((p) => [p.id, p]),
    )
    const activity = (activityRaw ?? []).map((a) => ({
      ...a,
      actor: a.actor_id ? profileMap.get(a.actor_id) ?? null : null,
    }))

    // Status efetivo (real-time) — sobrescreve os campos armazenados
    const subId = (onb as { subscription_id?: string }).subscription_id
    const effective = await resolveEffectiveStatuses(
      admin,
      [onb.client_id as string],
      subId ? [subId] : [],
    )
    const [enrichedOnb] = applyEffectiveStatuses([onb], effective)

    return successResponse(request, {
      onboarding: enrichedOnb,
      columns: columns ?? [],
      deliverables: deliverables ?? [],
      activity,
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
    await requireOnboardingPermission(user.id, "edit_meta")
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
    await requireOnboardingPermission(user.id, "admin")
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
