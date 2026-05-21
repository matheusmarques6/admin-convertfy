/**
 * POST /api/tasks/[id]/sub-items/[slug]/toggle
 *
 * Marca/desmarca um sub_item dentro de tasks.metadata.sub_items.
 * Body opcional: { completed?: boolean } - se omitido, faz toggle do estado atual.
 *
 * Usado na Etapa 05 do onboarding pra marcar emails individuais dentro de um flow.
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

interface SubItem {
  slug: string
  label: string
  from_preview?: string
  completed?: boolean
  preview_deliverable_id?: string | null
  preview_file_url?: string | null
  completed_at?: string | null
  completed_by?: string | null
}

interface ToggleBody {
  completed?: boolean
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; slug: string }> },
) {
  try {
    const { id, slug } = await context.params
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

    const { data: task } = await admin
      .from("tasks")
      .select("id, org_id, metadata, assignee_id, assignee_role, status")
      .eq("id", id)
      .eq("org_id", orgMember.org_id)
      .maybeSingle()
    if (!task) throw new AppError("Task nao encontrada", 404)

    // Autorizacao: mesma regra de complete (dono, dono do role, ou elevated)
    const role = orgMember.role as string
    const isElevated = ["owner", "manager", "coo"].includes(role)
    const isOwnTask =
      task.assignee_id === orgMember.id || task.assignee_id === user.id
    const isRoleTask = !task.assignee_id && task.assignee_role === role
    if (!isElevated && !isOwnTask && !isRoleTask) {
      throw new AppError("Sem permissao pra editar essa task", 403)
    }

    const meta = (task.metadata ?? {}) as Record<string, unknown> & {
      sub_items?: SubItem[]
    }
    const subItems = Array.isArray(meta.sub_items) ? meta.sub_items : []
    const idx = subItems.findIndex((s) => s.slug === slug)
    if (idx === -1) throw new AppError("Sub-item nao encontrado", 404)

    const body = (await request.json().catch(() => ({}))) as ToggleBody
    const currentCompleted = subItems[idx].completed === true
    const nextCompleted =
      typeof body.completed === "boolean" ? body.completed : !currentCompleted

    subItems[idx] = {
      ...subItems[idx],
      completed: nextCompleted,
      completed_at: nextCompleted ? new Date().toISOString() : null,
      completed_by: nextCompleted ? user.id : null,
    }

    const { data: updated, error: updateErr } = await admin
      .from("tasks")
      .update({ metadata: { ...meta, sub_items: subItems } })
      .eq("id", id)
      .select("id, metadata")
      .maybeSingle()
    if (updateErr) throw updateErr

    return successResponse(request, {
      task: updated,
      sub_item: subItems[idx],
    })
  } catch (error) {
    return errorResponse(request, error, "sub-item-toggle")
  }
}
