/**
 * POST /api/tasks/[id]/complete
 *
 * Marca uma task como completed. Side effects:
 *  - Se task era do role (assignee_id null), claim pelo user que clicou.
 *  - Publica evento task.completed no event bus.
 *  - Se source_type='onboarding', verifica se todas as tasks da etapa
 *    foram concluidas. Se sim, NAO avanca automaticamente (deixa o
 *    operador clicar "Avancar coluna" pra ter controle). Apenas notifica
 *    que pode avancar.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: orgMember } = await admin
      .from("org_members")
      .select("id, org_id, role")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (!orgMember) throw new AppError("Sem org membership", 403)

    const { data: task, error: fetchErr } = await admin
      .from("tasks")
      .select(
        "id, org_id, source_type, source_id, onboarding_id, operational_column_id, assignee_id, assignee_role, status, version",
      )
      .eq("id", id)
      .eq("org_id", orgMember.org_id)
      .maybeSingle()
    if (fetchErr || !task) throw new AppError("Task nao encontrada", 404)

    // Autorizacao: dono direto, dono do role, ou owner/manager
    const role = orgMember.role as string
    const isElevated = ["owner", "manager", "coo"].includes(role)
    const isOwnTask = task.assignee_id === user.id
    const isRoleTask = !task.assignee_id && task.assignee_role === role
    if (!isElevated && !isOwnTask && !isRoleTask) {
      throw new AppError("Sem permissao pra concluir essa task", 403)
    }

    // Update: marca completed + claim se era do role
    const updateData: Record<string, unknown> = {
      status: "completed",
      completed_at: new Date().toISOString(),
    }
    if (!task.assignee_id) updateData.assignee_id = user.id

    const { data: updated, error: updateErr } = await admin
      .from("tasks")
      .update(updateData)
      .eq("id", id)
      .eq("status", task.status) // optimistic lock: so atualiza se status nao mudou
      .select("*")
      .maybeSingle()
    if (updateErr) throw updateErr
    if (!updated) {
      // Outro user ja completou ou status mudou
      return successResponse(request, { task: null, already_done: true })
    }

    // Side effect: publica evento
    await admin.from("events").insert({
      event_type: "task.completed",
      entity_type: "task",
      entity_id: id,
      actor_id: user.id,
      actor_type: "user",
      payload: {
        task_id: id,
        source_type: task.source_type,
        source_id: task.source_id,
        onboarding_id: task.onboarding_id,
      },
      metadata: { org_id: orgMember.org_id },
    })

    // Side effect onboarding: checa se etapa ficou pronta pra avancar
    let stage_ready_to_advance = false
    if (task.source_type === "onboarding" && task.operational_column_id) {
      const { data: stageTasks } = await admin
        .from("tasks")
        .select("id, status")
        .eq("onboarding_id", task.onboarding_id)
        .eq("operational_column_id", task.operational_column_id)
        .eq("version", task.version ?? 1)
      const pending = (stageTasks ?? []).filter((t) => t.status !== "completed")
      stage_ready_to_advance = pending.length === 0
    }

    return successResponse(request, {
      task: updated,
      stage_ready_to_advance,
    })
  } catch (error) {
    return errorResponse(request, error, "task-complete")
  }
}
