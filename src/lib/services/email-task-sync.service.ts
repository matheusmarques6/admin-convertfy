/**
 * Sincroniza estados entre tasks de onboarding (produção de email) e as
 * linhas de email_flows / email_flow_emails do workspace de produção.
 *
 * 3 transições:
 *  - startTaskEmailProduction: pending → in_progress, garante flow+email
 *  - finishTaskOnEmailReady: email→ready dispara task→review (CAS)
 *  - approveTaskOnEmailApproved: email→approved dispara task→completed
 *
 * Todas idempotentes; falhas são logadas mas não derrubam o caller.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { attemptOnboardingHandoff } from "@/lib/services/onboarding-task-completion.service"
import {
  resolveTaskWorkspaceTarget,
  resolveTaskWorkspaceTargetByTitle,
  resolveSlugForEmail,
  type TaskWorkspaceTarget,
} from "@/lib/email-task-sync/slug-mapping"
import type { FlowType } from "@/types/email-workspace"

const log = logger.child("EmailTaskSync")

/**
 * Depois que um email aprovado conclui a task de onboarding, tenta o avanço
 * automático da etapa. Sem isto, o onboarding ficava "concluído porém parado"
 * até o cron diário de SLA (reconcileStuckHandoffs) — até ~24h de atraso.
 * Non-blocking e idempotente (o handoff re-valida tudo e usa CAS).
 */
async function tryHandoffAfterCompletion(
  onboardingId: string | null | undefined,
  taskId: string,
): Promise<void> {
  if (!onboardingId) return
  try {
    const result = await attemptOnboardingHandoff({
      onboardingId,
      actorId: null,
    })
    log.info("handoff pós-aprovação de email", { taskId, onboardingId, result })
  } catch (err) {
    log.error("handoff pós-aprovação de email falhou", {
      taskId,
      onboardingId,
      err,
    })
  }
}

type Admin = ReturnType<typeof createAdminClient>

const FLOW_TYPE_LABELS: Record<FlowType, string> = {
  welcome: "Welcome Flow",
  site_abandoned: "Site Abandoned",
  abandoned_cart: "Carrinho Abandonado",
  browse_abandonment: "Browse Abandoned",
  upsell: "Upsell",
  win_back: "Winback",
  shipping_stages: "Etapas de Envio",
  post_purchase: "Pós-compra",
  custom: "Custom",
}

const FLOW_POSITION: Record<FlowType, number> = {
  welcome: 1,
  site_abandoned: 2,
  browse_abandonment: 3,
  abandoned_cart: 4,
  upsell: 5,
  win_back: 6,
  shipping_stages: 7,
  post_purchase: 98,
  custom: 99,
}

// ── resolve (read-only) ─────────────────────────────────────────────────

export interface ResolvedTarget {
  ok: true
  target: TaskWorkspaceTarget
  storeId: string
  flowId?: string
  emailId?: string
}

export interface ResolveFailure {
  ok: false
  reason: "task_not_found" | "no_workspace_target" | "no_store_id"
}

/**
 * Read-only: resolve qual workspace abrir pra uma task. Não cria flow/email.
 * Retorna IDs apenas se já existirem no banco.
 */
export async function resolveTaskWorkspace(
  taskId: string,
): Promise<ResolvedTarget | ResolveFailure> {
  const admin = createAdminClient()

  const { data: task } = await admin
    .from("tasks")
    .select("id, slug, title, onboarding_id, store_id")
    .eq("id", taskId)
    .maybeSingle()
  if (!task) return { ok: false, reason: "task_not_found" }

  const target =
    resolveTaskWorkspaceTarget(task.slug as string | null) ??
    resolveTaskWorkspaceTargetByTitle(task.title as string | null)
  if (!target) return { ok: false, reason: "no_workspace_target" }

  const storeId = await resolveStoreId(admin, task)
  if (!storeId) return { ok: false, reason: "no_store_id" }

  // Sem flow específico: checkbox (brand/briefing) e a visão geral de
  // implementação (todos os flows) só precisam do storeId.
  if (
    target.kind === "checkbox-only" ||
    target.kind === "implementation-overview"
  ) {
    return { ok: true, target, storeId }
  }

  const { data: flow } = await admin
    .from("email_flows")
    .select("id")
    .eq("store_id", storeId)
    .eq("flow_type", target.flowType)
    .maybeSingle()

  const flowId = flow?.id as string | undefined
  if (!flowId) return { ok: true, target, storeId }

  if (target.kind === "email") {
    const { data: email } = await admin
      .from("email_flow_emails")
      .select("id")
      .eq("flow_id", flowId)
      .eq("number", target.emailNumber)
      .maybeSingle()
    return { ok: true, target, storeId, flowId, emailId: email?.id as string | undefined }
  }

  return { ok: true, target, storeId, flowId }
}

// ── start ───────────────────────────────────────────────────────────────

export interface StartTaskResult {
  ok: true
  target: TaskWorkspaceTarget
  storeId: string
  flowId?: string
  emailId?: string
}

export interface StartTaskFailure {
  ok: false
  reason:
    | "task_not_found"
    | "no_workspace_target"
    | "no_store_id"
    | "unsupported_flow"
}

export async function startTaskEmailProduction(
  taskId: string,
): Promise<StartTaskResult | StartTaskFailure> {
  const admin = createAdminClient()

  const { data: task, error: taskErr } = await admin
    .from("tasks")
    .select("id, slug, title, status, onboarding_id, store_id")
    .eq("id", taskId)
    .maybeSingle()
  if (taskErr || !task) {
    return { ok: false, reason: "task_not_found" }
  }

  const target =
    resolveTaskWorkspaceTarget(task.slug as string | null) ??
    resolveTaskWorkspaceTargetByTitle(task.title as string | null)
  if (!target) {
    return { ok: false, reason: "no_workspace_target" }
  }

  const storeId = await resolveStoreId(admin, task)
  if (!storeId) return { ok: false, reason: "no_store_id" }

  // Sem flow específico: não há o que garantir no banco — o workspace carrega
  // todos os flows existentes via /producao.
  if (
    target.kind === "checkbox-only" ||
    target.kind === "implementation-overview"
  ) {
    return { ok: true, target, storeId }
  }

  const flowType = target.flowType
  const flowId = await ensureFlow(admin, storeId, flowType)
  if (!flowId) return { ok: false, reason: "unsupported_flow" }

  if (target.kind === "email") {
    const emailId = await ensureEmail(
      admin,
      flowId,
      target.emailNumber,
    )
    return { ok: true, target, storeId, flowId, emailId }
  }

  // email-list: garante todos os emails do flow
  for (const sub of target.subItems) {
    await ensureEmail(admin, flowId, sub.emailNumber)
  }
  return { ok: true, target, storeId, flowId }
}

async function resolveStoreId(
  admin: Admin,
  task: { store_id?: string | null; onboarding_id?: string | null },
): Promise<string | null> {
  const direct = (task.store_id ?? null) as string | null
  if (direct) return direct
  if (!task.onboarding_id) return null
  const { data: onb } = await admin
    .from("onboardings")
    .select("store_id")
    .eq("id", task.onboarding_id)
    .maybeSingle()
  return ((onb?.store_id ?? null) as string | null) ?? null
}

async function ensureFlow(
  admin: Admin,
  storeId: string,
  flowType: FlowType,
): Promise<string | null> {
  const { data: existing } = await admin
    .from("email_flows")
    .select("id, status")
    .eq("store_id", storeId)
    .eq("flow_type", flowType)
    .maybeSingle()
  if (existing?.id) {
    if (existing.status === "blocked") {
      await admin
        .from("email_flows")
        .update({ status: "in_progress" })
        .eq("id", existing.id)
    }
    return existing.id as string
  }
  const { data: created, error } = await admin
    .from("email_flows")
    .insert({
      store_id: storeId,
      flow_type: flowType,
      name: FLOW_TYPE_LABELS[flowType],
      status: "in_progress",
      position: FLOW_POSITION[flowType],
    })
    .select("id")
    .single()
  if (error) {
    log.error("ensureFlow: insert failed", { storeId, flowType, error })
    return null
  }
  return created.id as string
}

async function ensureEmail(
  admin: Admin,
  flowId: string,
  number: number,
): Promise<string> {
  const { data: existing } = await admin
    .from("email_flow_emails")
    .select("id, status")
    .eq("flow_id", flowId)
    .eq("number", number)
    .maybeSingle()
  if (existing?.id) {
    if (existing.status === "draft") {
      await admin
        .from("email_flow_emails")
        .update({ status: "in_progress" })
        .eq("id", existing.id)
        .eq("status", "draft")
    }
    return existing.id as string
  }
  const { data: created, error } = await admin
    .from("email_flow_emails")
    .insert({
      flow_id: flowId,
      number,
      name: `E-mail #${String(number).padStart(2, "0")}`,
      status: "in_progress",
    })
    .select("id")
    .single()
  if (error) throw error
  return created.id as string
}

/**
 * Marca o email correspondente a um piloto aprovado no preview como `ready`
 * no workspace de produção. Usado pelo pre-fill 03→05: garante flow+email e
 * promove o status para `ready` (mesmo nível que o workspace conta como feito).
 *
 * Idempotente e não-rebaixante: só promove de draft/in_progress/copy_ready →
 * ready; nunca rebaixa um email já `ready`/`approved`/`live`. Falhas são
 * logadas mas não derrubam o caller (fire-and-forget pelo pre-fill).
 */
export async function markPreviewEmailReady(
  storeId: string,
  flowType: FlowType,
  emailNumber: number,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const flowId = await ensureFlow(admin, storeId, flowType)
    if (!flowId) return
    const emailId = await ensureEmail(admin, flowId, emailNumber)

    const { data: email } = await admin
      .from("email_flow_emails")
      .select("status")
      .eq("id", emailId)
      .maybeSingle()
    // Não rebaixa estados terminais/avançados.
    const terminal = ["ready", "approved", "live"]
    if (email && terminal.includes(email.status as string)) return

    await admin
      .from("email_flow_emails")
      .update({ status: "ready" })
      .eq("id", emailId)
      .not("status", "in", `(${terminal.join(",")})`)
    log.info("preview email → ready", { storeId, flowType, emailNumber })
  } catch (e) {
    log.error("markPreviewEmailReady failed", { storeId, flowType, emailNumber, error: e })
  }
}

export interface SyncFromEmailArgs {
  flowId: string
  emailId: string
}

interface EmailContext {
  storeId: string
  flowType: FlowType
  number: number
  flowStatus: string
}

async function loadEmailContext(
  admin: Admin,
  { flowId, emailId }: SyncFromEmailArgs,
): Promise<EmailContext | null> {
  const { data: row } = await admin
    .from("email_flow_emails")
    .select("number")
    .eq("id", emailId)
    .eq("flow_id", flowId)
    .maybeSingle()
  if (!row) return null

  const { data: flow } = await admin
    .from("email_flows")
    .select("store_id, flow_type, status")
    .eq("id", flowId)
    .maybeSingle()
  if (!flow) return null

  return {
    storeId: flow.store_id as string,
    flowType: flow.flow_type as FlowType,
    number: row.number as number,
    flowStatus: flow.status as string,
  }
}

interface TaskRow {
  id: string
  status: string
  metadata: Record<string, unknown> | null
  store_id: string | null
  onboarding_id: string | null
}

interface SubItem {
  slug: string
  completed?: boolean
  completed_at?: string | null
}

async function findTaskBySlug(
  admin: Admin,
  slug: string,
  storeId: string,
): Promise<TaskRow | null> {
  const { data, error } = await admin
    .from("tasks")
    .select("id, status, metadata, store_id, onboarding_id")
    .eq("slug", slug)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error || !data) return null

  const rows = data as TaskRow[]

  // Match direto via store_id
  const direct = rows.find((t) => t.store_id === storeId)
  if (direct) return direct

  // Fallback: resolve store via onboarding_id (tasks de bootstrap não setam store_id)
  const candidates = rows.filter((t) => t.onboarding_id)
  if (candidates.length === 0) return null

  const ids = candidates.map((t) => t.onboarding_id as string)
  const { data: onbs } = await admin
    .from("onboardings")
    .select("id, store_id")
    .in("id", ids)
  const onbStoreMap = new Map<string, string>()
  for (const o of (onbs ?? []) as Array<{ id: string; store_id: string }>) {
    onbStoreMap.set(o.id, o.store_id)
  }
  return (
    candidates.find(
      (t) => onbStoreMap.get(t.onboarding_id as string) === storeId,
    ) ?? null
  )
}

export async function finishTaskOnEmailReady(
  args: SyncFromEmailArgs,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const ctx = await loadEmailContext(admin, args)
    if (!ctx) return
    const slugInfo = resolveSlugForEmail(ctx.flowType, ctx.number)
    if (!slugInfo) return

    const task = await findTaskBySlug(admin, slugInfo.parentSlug, ctx.storeId)
    if (!task) return

    if (!slugInfo.subItemSlug) {
      // 1:1: in_progress → review (CAS via .eq status)
      if (task.status !== "in_progress") return
      await admin
        .from("tasks")
        .update({ status: "review" })
        .eq("id", task.id)
        .eq("status", "in_progress")
      log.info("task→review (1:1)", { taskId: task.id, slug: slugInfo.parentSlug })
      return
    }

    // 1:N: marca sub_item completed; se todos, status → review
    const meta = (task.metadata ?? {}) as { sub_items?: SubItem[] }
    const subs = meta.sub_items ?? []
    if (subs.length === 0) return

    const now = new Date().toISOString()
    const nextSubs = subs.map((s) =>
      s.slug === slugInfo.subItemSlug
        ? { ...s, completed: true, completed_at: s.completed_at ?? now }
        : s,
    )
    const allDone = nextSubs.every((s) => s.completed)
    const nextMeta = { ...meta, sub_items: nextSubs }

    const update: Record<string, unknown> = { metadata: nextMeta }
    if (allDone && task.status === "in_progress") {
      update.status = "review"
    }
    await admin.from("tasks").update(update).eq("id", task.id)
    log.info("sub_item completed", {
      taskId: task.id,
      subItemSlug: slugInfo.subItemSlug,
      allDone,
    })
  } catch (err) {
    log.error("finishTaskOnEmailReady: unexpected", { args, err })
  }
}

export async function approveTaskOnEmailApproved(
  args: SyncFromEmailArgs,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const ctx = await loadEmailContext(admin, args)
    if (!ctx) return
    const slugInfo = resolveSlugForEmail(ctx.flowType, ctx.number)
    if (!slugInfo) return

    const task = await findTaskBySlug(admin, slugInfo.parentSlug, ctx.storeId)
    if (!task) return

    if (!slugInfo.subItemSlug) {
      // 1:1: review → completed (CAS)
      if (task.status !== "review") return
      await admin
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task.id)
        .eq("status", "review")
      log.info("task→completed (1:1)", { taskId: task.id })
      await tryHandoffAfterCompletion(task.onboarding_id, task.id)
      return
    }

    // 1:N: completed só quando TODOS os emails do flow estão approved/live
    const { data: allEmails } = await admin
      .from("email_flow_emails")
      .select("status")
      .eq("flow_id", args.flowId)
    const emails = (allEmails ?? []) as Array<{ status: string }>
    if (emails.length === 0) return
    const allApproved = emails.every(
      (e) => e.status === "approved" || e.status === "live",
    )
    if (!allApproved) return
    if (task.status !== "review") return
    await admin
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("status", "review")
    log.info("task→completed (1:N)", { taskId: task.id })
    await tryHandoffAfterCompletion(task.onboarding_id, task.id)
  } catch (err) {
    log.error("approveTaskOnEmailApproved: unexpected", { args, err })
  }
}
