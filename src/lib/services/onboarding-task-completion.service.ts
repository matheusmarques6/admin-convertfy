import { AppError } from "@/lib/api/errors"
import { guardRequiredDeliverables } from "@/lib/api/task-deliverables-guard"
import { getOnboardingStageResponsibleRole } from "@/lib/permissions/onboarding-stage-access"
import { logger } from "@/lib/logger"
import { ensureColumnTasks } from "@/lib/services/onboarding-pipeline.service"
import { createAdminClient } from "@/lib/supabase/server"
import type { FeedbackSeverity } from "@/types/onboarding-pipeline"

const log = logger.child("OnboardingTaskCompletion")

type TaskRow = Record<string, unknown> & {
  id: string
  org_id: string
  onboarding_id: string | null
  operational_column_id: string | null
  version: number | null
  status: string
  metadata: Record<string, unknown> | null
}

type ColumnRow = {
  id: string
  pipeline_id: string
  name: string
  slug: string
  position: number
  is_final: boolean
  deliverables_template: Array<{
    slug: string
    label: string
    required?: boolean
  }> | null
}

export type OnboardingHandoffResult =
  | "not_onboarding"
  | "not_ready"
  | "waiting_client"
  | "advanced"
  | "returned_to_preview"
  | "completed"
  | "already_moved"

function hasDeliverableValue(deliverable: {
  value: string | null
  file_url: string | null
  filled_at: string | null
}): boolean {
  return Boolean(
    deliverable.value || deliverable.file_url || deliverable.filled_at,
  )
}

function normalizeSeverity(value: string | null): FeedbackSeverity {
  if (
    value === "small" ||
    value === "medium" ||
    value === "rework_part" ||
    value === "rework_all"
  ) {
    return value
  }
  return "medium"
}

async function notifyResponsibleRole(params: {
  onboardingId: string
  orgId: string
  fromColumn: ColumnRow
  toColumn: ColumnRow
}) {
  const role = getOnboardingStageResponsibleRole(params.toColumn.slug)
  if (!role) return

  const admin = createAdminClient()
  const { data: roleRows } = await admin
    .from("org_member_roles")
    .select("org_member_id")
    .eq("role", role)
  const memberIds = (roleRows ?? []).map((row) => row.org_member_id as string)
  if (memberIds.length === 0) return

  const { data: members } = await admin
    .from("org_members")
    .select("profile_id")
    .eq("org_id", params.orgId)
    .eq("is_active", true)
    .in("id", memberIds)
  const userIds = Array.from(
    new Set((members ?? []).map((row) => row.profile_id as string)),
  )
  if (userIds.length === 0) return

  const { data: onboarding } = await admin
    .from("onboardings")
    .select(
      "client:clients!onboardings_client_id_fkey(name), store:client_stores(store_name)",
    )
    .eq("id", params.onboardingId)
    .maybeSingle()
  const client = Array.isArray(onboarding?.client)
    ? onboarding?.client[0]
    : onboarding?.client
  const store = Array.isArray(onboarding?.store)
    ? onboarding?.store[0]
    : onboarding?.store

  await admin.from("notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      title: `Onboarding entrou em ${params.toColumn.name}`,
      body: `${client?.name ?? "Cliente"} - ${store?.store_name ?? "Loja"}`,
      type: "onboarding_column_change",
      link: `/admin/productivity/board?task=onboarding-${params.onboardingId}`,
      metadata: {
        onboarding_id: params.onboardingId,
        from_column: params.fromColumn.slug,
        to_column: params.toColumn.slug,
        responsible_role: role,
      },
      read: false,
    })),
  )
}

async function runStageEntryEffects(
  onboardingId: string,
  actorId: string | null,
  nextColumn: ColumnRow,
) {
  if (nextColumn.slug === "emails_finais") {
    const { applyPreFillFromPreview } = await import(
      "@/lib/services/onboarding-pre-fill.service"
    )
    await applyPreFillFromPreview(onboardingId, actorId)
  }

  if (nextColumn.slug === "implementacao") {
    const admin = createAdminClient()
    const { data: onboarding } = await admin
      .from("onboardings")
      .select("tutorial_token")
      .eq("id", onboardingId)
      .maybeSingle()
    if (!onboarding?.tutorial_token) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(18)))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
      await admin
        .from("onboardings")
        .update({ tutorial_token: token })
        .eq("id", onboardingId)
        .is("tutorial_token", null)
    }
  }
}

async function returnToPreview(params: {
  onboarding: {
    id: string
    org_id: string
    pipeline_id: string
    current_column_id: string
    current_version: number
  }
  currentColumn: ColumnRow
  actorId: string | null
  feedback: string | null
  severity: string | null
}): Promise<OnboardingHandoffResult> {
  const admin = createAdminClient()
  const { data: previewColumn } = await admin
    .from("operational_pipeline_columns")
    .select(
      "id, pipeline_id, name, slug, position, is_final, deliverables_template",
    )
    .eq("pipeline_id", params.onboarding.pipeline_id)
    .eq("slug", "preview_producao")
    .maybeSingle()
  if (!previewColumn) throw new AppError("Coluna de preview nao encontrada", 500)

  const nextVersion = params.onboarding.current_version + 1
  const now = new Date().toISOString()
  const { data: moved } = await admin
    .from("onboardings")
    .update({
      current_column_id: previewColumn.id,
      current_version: nextVersion,
      last_column_change_at: now,
    })
    .eq("id", params.onboarding.id)
    .eq("status", "in_progress")
    .eq("current_column_id", params.onboarding.current_column_id)
    .eq("current_version", params.onboarding.current_version)
    .select("id")
    .maybeSingle()
  if (!moved) return "already_moved"

  await admin
    .from("onboarding_versions")
    .update({
      status: "rejected_by_client",
      client_feedback:
        params.feedback?.trim() || "Ajustes solicitados pelo cliente",
      feedback_severity: normalizeSeverity(params.severity),
      completed_at: now,
    })
    .eq("onboarding_id", params.onboarding.id)
    .eq("version_number", params.onboarding.current_version)

  await admin.from("onboarding_versions").upsert(
    {
      onboarding_id: params.onboarding.id,
      column_id: previewColumn.id,
      version_number: nextVersion,
      status: "in_progress",
      created_by: params.actorId,
    },
    {
      onConflict: "onboarding_id,version_number",
      ignoreDuplicates: true,
    },
  )

  await ensureColumnTasks(
    params.onboarding.id,
    previewColumn.id as string,
    params.actorId,
  )
  await admin.from("events").insert({
    event_type: "onboarding.preview_rejected",
    entity_type: "onboarding",
    entity_id: params.onboarding.id,
    actor_id: params.actorId,
    actor_type: "user",
    payload: {
      onboarding_id: params.onboarding.id,
      feedback: params.feedback,
      severity: normalizeSeverity(params.severity),
      new_version: nextVersion,
    },
    metadata: { org_id: params.onboarding.org_id },
  })
  await notifyResponsibleRole({
    onboardingId: params.onboarding.id,
    orgId: params.onboarding.org_id,
    fromColumn: params.currentColumn,
    toColumn: previewColumn as ColumnRow,
  })

  return "returned_to_preview"
}

export async function attemptOnboardingHandoff(params: {
  onboardingId: string
  actorId: string | null
}): Promise<OnboardingHandoffResult> {
  const admin = createAdminClient()
  const { data: onboarding } = await admin
    .from("onboardings")
    .select(
      "id, org_id, pipeline_id, current_column_id, current_version, status",
    )
    .eq("id", params.onboardingId)
    .maybeSingle()
  if (
    !onboarding ||
    onboarding.status !== "in_progress" ||
    !onboarding.current_column_id
  ) {
    return "already_moved"
  }

  const { data: columns } = await admin
    .from("operational_pipeline_columns")
    .select(
      "id, pipeline_id, name, slug, position, is_final, deliverables_template",
    )
    .eq("pipeline_id", onboarding.pipeline_id)
    .order("position", { ascending: true })
  const orderedColumns = (columns ?? []) as ColumnRow[]
  const currentIndex = orderedColumns.findIndex(
    (column) => column.id === onboarding.current_column_id,
  )
  if (currentIndex < 0) throw new AppError("Coluna atual invalida", 500)
  const currentColumn = orderedColumns[currentIndex]

  const { data: tasks } = await admin
    .from("tasks")
    .select("id, status, metadata")
    .eq("onboarding_id", onboarding.id)
    .eq("operational_column_id", currentColumn.id)
    .eq("version", onboarding.current_version ?? 1)
    .neq("status", "cancelled")
  const stageTasks = tasks ?? []
  if (
    stageTasks.length === 0 ||
    stageTasks.some((task) => task.status !== "completed")
  ) {
    return "not_ready"
  }

  for (const task of stageTasks) {
    const metadata = (task.metadata ?? {}) as {
      sub_items?: Array<{ completed?: boolean }>
    }
    if (
      Array.isArray(metadata.sub_items) &&
      metadata.sub_items.some((item) => item.completed !== true)
    ) {
      return "not_ready"
    }
  }

  const taskIds = stageTasks.map((task) => task.id as string)
  const { data: deliverables } =
    taskIds.length > 0
      ? await admin
          .from("task_deliverables")
          .select(
            "field_slug, field_label, required, value, file_url, filled_at",
          )
          .in("task_id", taskIds)
      : { data: [] }
  const deliverableRows = deliverables ?? []
  const requiredTemplateSlugs = (
    currentColumn.deliverables_template ?? []
  )
    .filter((field) => field.required)
    .map((field) => field.slug)
  if (
    requiredTemplateSlugs.some((slug) => {
      const row = deliverableRows.find(
        (deliverable) => deliverable.field_slug === slug,
      )
      return !row || !hasDeliverableValue(row)
    })
  ) {
    return "not_ready"
  }

  if (currentColumn.slug === "preview_aprovacao") {
    const value = (slug: string) =>
      deliverableRows.find((row) => row.field_slug === slug)?.value ?? null
    const approval = value("client_approval_record")
    if (approval === "sem_resposta" || !approval) return "waiting_client"
    if (approval === "ajustes_solicitados") {
      return returnToPreview({
        onboarding: {
          id: onboarding.id as string,
          org_id: onboarding.org_id as string,
          pipeline_id: onboarding.pipeline_id as string,
          current_column_id: onboarding.current_column_id as string,
          current_version: onboarding.current_version ?? 1,
        },
        currentColumn,
        actorId: params.actorId,
        feedback: value("client_feedback"),
        severity: value("feedback_severity"),
      })
    }
    if (approval !== "aprovado") return "waiting_client"
  }

  const now = new Date().toISOString()
  const currentVersion = onboarding.current_version ?? 1
  const nextColumn = orderedColumns[currentIndex + 1]

  if (!nextColumn || currentColumn.is_final) {
    const { data: completed } = await admin
      .from("onboardings")
      .update({
        status: "completed",
        completed_at: now,
        last_column_change_at: now,
      })
      .eq("id", onboarding.id)
      .eq("status", "in_progress")
      .eq("current_column_id", currentColumn.id)
      .eq("current_version", currentVersion)
      .select("id")
      .maybeSingle()
    if (!completed) return "already_moved"

    await admin.from("events").insert({
      event_type: "onboarding.completed",
      entity_type: "onboarding",
      entity_id: onboarding.id,
      actor_id: params.actorId,
      actor_type: "user",
      payload: { onboarding_id: onboarding.id },
      metadata: { org_id: onboarding.org_id },
    })
    return "completed"
  }

  const { data: moved } = await admin
    .from("onboardings")
    .update({
      current_column_id: nextColumn.id,
      last_column_change_at: now,
    })
    .eq("id", onboarding.id)
    .eq("status", "in_progress")
    .eq("current_column_id", currentColumn.id)
    .eq("current_version", currentVersion)
    .select("id")
    .maybeSingle()
  if (!moved) return "already_moved"

  await ensureColumnTasks(onboarding.id as string, nextColumn.id, params.actorId)
  await runStageEntryEffects(
    onboarding.id as string,
    params.actorId,
    nextColumn,
  )
  await admin.from("events").insert({
    event_type: "onboarding.column_changed",
    entity_type: "onboarding",
    entity_id: onboarding.id,
    actor_id: params.actorId,
    actor_type: "user",
    payload: {
      onboarding_id: onboarding.id,
      from_column_id: currentColumn.id,
      to_column_id: nextColumn.id,
    },
    metadata: { org_id: onboarding.org_id },
  })
  await notifyResponsibleRole({
    onboardingId: onboarding.id as string,
    orgId: onboarding.org_id as string,
    fromColumn: currentColumn,
    toColumn: nextColumn,
  })

  return "advanced"
}

/**
 * Reconciliador idempotente para a janela de corrida do auto-advance.
 *
 * `attemptOnboardingHandoff` LE "todas as tasks da etapa estao completed"
 * ANTES do CAS. Se as duas ultimas tasks de uma etapa sao concluidas em
 * requisicoes simultaneas, ambas podem ler "ainda pendente" e nenhuma avanca,
 * deixando a etapa concluida porem parada — sem ninguem para recuperar.
 *
 * Este reconciliador varre os onboardings ativos e re-tenta o handoff. Como
 * `attemptOnboardingHandoff` ja e:
 *   - barato/no-op quando a etapa NAO esta pronta (retorna "not_ready"),
 *   - protegido por CAS (so 1 vencedor avanca; demais viram "already_moved"),
 *   - idempotente em tasks/eventos/notificacoes (CAS + dedup de tasks),
 * basta re-chama-lo: nao duplica nada e fecha a janela na proxima passagem
 * do cron. `actorId` default = null (ator de sistema; todas as colunas FK
 * envolvidas — events.actor_id, tasks.created_by, onboarding_versions.created_by —
 * aceitam null).
 */
export async function reconcileStuckHandoffs(params?: {
  actorId?: string | null
  limit?: number
}): Promise<{
  scanned: number
  advanced: number
  completed: number
  returned: number
  failed: number
}> {
  const admin = createAdminClient()
  const actorId = params?.actorId ?? null
  const { data: rows } = await admin
    .from("onboardings")
    .select("id")
    .eq("status", "in_progress")
    .limit(params?.limit ?? 500)
  const onboardings = (rows ?? []) as Array<{ id: string }>

  let advanced = 0
  let completed = 0
  let returned = 0
  let failed = 0
  for (const row of onboardings) {
    try {
      const result = await attemptOnboardingHandoff({
        onboardingId: row.id,
        actorId,
      })
      if (result === "advanced") advanced += 1
      else if (result === "completed") completed += 1
      else if (result === "returned_to_preview") returned += 1
    } catch (error) {
      failed += 1
      log.error("reconcile stuck handoff failed", {
        onboardingId: row.id,
        error,
      })
    }
  }

  return {
    scanned: onboardings.length,
    advanced,
    completed,
    returned,
    failed,
  }
}

export async function completeTaskWithHandoff(params: {
  task: TaskRow
  actorId: string
}): Promise<{
  task: Record<string, unknown> | null
  alreadyDone: boolean
  handoff: OnboardingHandoffResult
}> {
  const metadata = (params.task.metadata ?? {}) as {
    sub_items?: Array<{ slug: string; label: string; completed?: boolean }>
  }
  const pendingSubItems = (metadata.sub_items ?? []).filter(
    (item) => item.completed !== true,
  )
  if (pendingSubItems.length > 0) {
    throw new AppError(
      `${pendingSubItems.length} sub-item(s) pendente(s) nesta task`,
      409,
    )
  }

  const admin = createAdminClient()
  let updated: Record<string, unknown> | null = null
  if (params.task.status !== "completed") {
    // Gate de entregável obrigatório: bloqueia concluir se um anexo required
    // (ex.: link do Figma) estiver faltando — mesmo gate do PUT /api/tasks/[id].
    const deliverableBlock = await guardRequiredDeliverables(
      admin,
      params.task.id as string,
    )
    if (deliverableBlock) throw new AppError(deliverableBlock, 409)

    const result = await admin
      .from("tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", params.task.id)
      .eq("status", params.task.status)
      .select("*")
      .maybeSingle()
    if (result.error) throw result.error
    updated = result.data
  }

  const alreadyDone = params.task.status === "completed" || !updated
  if (!alreadyDone) {
    await admin.from("events").insert({
      event_type: "task.completed",
      entity_type: "task",
      entity_id: params.task.id,
      actor_id: params.actorId,
      actor_type: "user",
      payload: {
        task_id: params.task.id,
        onboarding_id: params.task.onboarding_id,
      },
      metadata: { org_id: params.task.org_id },
    })
  }

  let handoff: OnboardingHandoffResult = "not_onboarding"
  if (params.task.onboarding_id) {
    try {
      handoff = await attemptOnboardingHandoff({
        onboardingId: params.task.onboarding_id,
        actorId: params.actorId,
      })
    } catch (error) {
      log.error("automatic handoff failed", {
        taskId: params.task.id,
        onboardingId: params.task.onboarding_id,
        error,
      })
      throw error
    }
  }

  return { task: updated, alreadyDone, handoff }
}
