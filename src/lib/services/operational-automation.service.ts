/**
 * Engine de automacoes das pipelines operacionais.
 *
 * Cada pipeline armazena `automations` em JSONB como array de:
 *   { id, name, trigger, action, config, is_active }
 *
 * Esta service e chamada fire-and-forget pelos endpoints que mutam
 * tasks (create, move, etc). Erros sao logados mas nao bloqueiam
 * o fluxo principal.
 *
 * Acoes suportadas:
 * - notify_assignee     -> insert em notifications
 * - notify_channel      -> insert em notifications (canal in_app por padrao)
 * - assign_to           -> update tasks.assignee_id
 * - move_to_column      -> update tasks.operational_column_id
 * - create_subtask      -> insert em tasks (linkada via metadata.parent_task_id)
 * - update_field        -> update tasks[field] = value
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type {
  OperationalAutomation,
  OperationalAutomationTrigger,
} from "@/types/operational-pipeline"

const log = logger.child("OpAutomation")

interface TriggerContext {
  taskId: string
  assigneeId: string | null
  columnId: string | null
  // Campos adicionais opcionais que algumas acoes consomem.
  pipelineName?: string
  pipelineSlug?: string
}

export async function executeAutomations(
  pipelineId: string,
  trigger: OperationalAutomationTrigger,
  ctx: TriggerContext,
): Promise<void> {
  try {
    const admin = createAdminClient()

    // Carrega pipeline + task pra ter contexto rico
    const { data: pipeline } = await admin
      .from("operational_pipelines")
      .select("id, name, slug, automations, columns")
      .eq("id", pipelineId)
      .maybeSingle()
    if (!pipeline) return

    const { data: task } = await admin
      .from("tasks")
      .select("id, title, org_id, assignee_id, status")
      .eq("id", ctx.taskId)
      .maybeSingle()
    if (!task) return

    const automations = ((pipeline.automations as OperationalAutomation[]) ?? [])
      .filter((a) => a.is_active && a.trigger === trigger)

    for (const auto of automations) {
      // Trigger task_moved_to com config.column_id especifica: filtra
      if (
        auto.trigger === "task_moved_to" &&
        auto.config.column_id &&
        auto.config.column_id !== ctx.columnId
      ) {
        continue
      }

      try {
        await runAction(admin, auto, task, pipeline, ctx)
      } catch (e) {
        log.warn("Action failed", {
          automationId: auto.id,
          action: auto.action,
          error: (e as Error).message,
        })
      }
    }
  } catch (e) {
    log.error("executeAutomations failed", e)
  }
}

async function runAction(
  admin: ReturnType<typeof createAdminClient>,
  auto: OperationalAutomation,
  task: { id: string; title: string; org_id: string | null; assignee_id: string | null },
  pipeline: { id: string; name: string; slug: string },
  ctx: TriggerContext,
) {
  const message = (auto.config.message ?? "")
    .replace(/\{\{task\.title\}\}/g, task.title)
    .replace(/\{\{pipeline\.name\}\}/g, pipeline.name)

  switch (auto.action) {
    case "notify_assignee": {
      const targetMember = ctx.assigneeId
      if (!targetMember) return
      // org_members.id -> precisa do profile_id pra notification
      const { data: m } = await admin
        .from("org_members")
        .select("profile_id")
        .eq("id", targetMember)
        .maybeSingle()
      if (!m?.profile_id) return
      await admin.from("notifications").insert({
        user_id: m.profile_id,
        title: `[${pipeline.name}] ${task.title}`,
        body: message || `Tem uma atualizacao na task "${task.title}".`,
        type: "task_update",
        link: `/admin/operacional/workflows/${pipeline.slug}`,
        metadata: { pipeline_id: pipeline.id, task_id: task.id },
      })
      return
    }

    case "notify_channel": {
      // Por enquanto so suportamos canal in_app (=notifications).
      // Hooks de email/slack/whatsapp ficam pra integracao futura.
      const orgId = task.org_id
      if (!orgId) return
      const { data: members } = await admin
        .from("org_members")
        .select("profile_id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .limit(50)
      const rows = (members ?? [])
        .filter((m) => m.profile_id)
        .map((m) => ({
          user_id: m.profile_id as string,
          title: `[${pipeline.name}] ${task.title}`,
          body: message || `Movimentacao na pipeline "${pipeline.name}".`,
          type: "channel",
          link: `/admin/operacional/workflows/${pipeline.slug}`,
          metadata: { pipeline_id: pipeline.id, task_id: task.id },
        }))
      if (rows.length > 0) await admin.from("notifications").insert(rows)
      return
    }

    case "assign_to": {
      const memberId = auto.config.assignee_id
      if (!memberId) return
      await admin
        .from("tasks")
        .update({ assignee_id: memberId })
        .eq("id", task.id)
      return
    }

    case "move_to_column": {
      const colId = auto.config.target_column_id
      if (!colId) return
      await admin
        .from("tasks")
        .update({ operational_column_id: colId })
        .eq("id", task.id)
      return
    }

    case "create_subtask": {
      const title = auto.config.subtask_title || `Subtask de ${task.title}`
      await admin.from("tasks").insert({
        org_id: task.org_id,
        title,
        type: "general",
        status: "pending",
        priority: "medium",
        assignee_id: auto.config.subtask_assignee_id ?? task.assignee_id,
        source_type: "manual",
        operational_pipeline_id: pipeline.id,
        operational_column_id: ctx.columnId,
        metadata: { parent_task_id: task.id },
      })
      return
    }

    case "update_field": {
      const field = auto.config.field
      if (!field) return
      const allowed = new Set(["status", "priority", "due_date"])
      if (!allowed.has(field)) return
      await admin
        .from("tasks")
        .update({ [field]: auto.config.value })
        .eq("id", task.id)
      return
    }
  }
}
