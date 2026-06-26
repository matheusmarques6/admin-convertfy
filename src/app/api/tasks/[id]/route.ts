import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { completeTaskWithHandoff } from "@/lib/services/onboarding-task-completion.service"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const ADMIN_FIELDS = new Set([
  "title",
  "type",
  "priority",
  "assignee_id",
  "client_id",
  "store_id",
  "due_date",
  "position",
  "tags",
  "operational_column_id",
  "operational_pipeline_id",
])

const WORK_FIELDS = new Set(["description", "status", "metadata"])
const WORK_STATUSES = new Set(["pending", "in_progress", "in_review"])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "read")
    const admin = createAdminClient()
    const [taskResult, commentsResult, checklistsResult, historyResult, deliverablesResult] =
      await Promise.all([
        admin
          .from("tasks")
          .select(
            `*,
             assignee:org_members(id, role, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)),
             creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
             client:clients(id, name, company, email),
             store:client_stores(id, store_name, store_url, platform)`,
          )
          .eq("id", id)
          .maybeSingle(),
        admin
          .from("task_comments")
          .select(
            "*, author:profiles!task_comments_author_id_fkey(id, name, email, avatar_url)",
          )
          .eq("task_id", id)
          .order("created_at", { ascending: true }),
        admin
          .from("task_checklists")
          .select("*")
          .eq("task_id", id)
          .order("position", { ascending: true }),
        admin
          .from("task_history")
          .select(
            "*, actor:profiles!task_history_actor_id_fkey(id, name, avatar_url)",
          )
          .eq("task_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        admin.from("task_deliverables").select("*").eq("task_id", id),
      ])
    if (taskResult.error) throw taskResult.error
    if (!taskResult.data) throw new AppError("Task nao encontrada", 404)

    return successResponse(request, {
      task: {
        ...taskResult.data,
        comments: commentsResult.data ?? [],
        checklists: checklistsResult.data ?? [],
        history: historyResult.data ?? [],
        deliverables: deliverablesResult.data ?? [],
        can_work: access.canWork,
        can_admin: access.canAdmin,
        stage_slug: access.stageSlug,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "task-get")
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const body = (await request.json()) as Record<string, unknown>
    const requestedFields = Object.keys(body).filter(
      (field) => ADMIN_FIELDS.has(field) || WORK_FIELDS.has(field),
    )
    if (requestedFields.length === 0) {
      throw new AppError("Nenhum campo editavel informado", 400)
    }

    const requiresAdmin = requestedFields.some((field) =>
      ADMIN_FIELDS.has(field),
    )
    const access = await requireTaskAccess(
      user.id,
      id,
      requiresAdmin ? "admin" : "work",
    )

    if (body.status === "completed") {
      const result = await completeTaskWithHandoff({
        task: access.task as unknown as Parameters<
          typeof completeTaskWithHandoff
        >[0]["task"],
        actorId: user.id,
      })
      return successResponse(request, {
        task: result.task,
        already_done: result.alreadyDone,
        handoff: result.handoff,
      })
    }
    if (
      body.status !== undefined &&
      !access.canAdmin &&
      !WORK_STATUSES.has(String(body.status))
    ) {
      throw new AppError("Status nao permitido", 403)
    }

    const patch: Record<string, unknown> = {}
    for (const field of requestedFields) patch[field] = body[field]
    if (body.status === "in_progress" && !access.task.started_at) {
      patch.started_at = new Date().toISOString()
    }
    if (body.status !== undefined && body.status !== "completed") {
      patch.completed_at = null
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("org_id", access.member.orgId)
      .select("*")
      .maybeSingle()
    if (error) throw error
    if (!data) throw new AppError("Task nao encontrada", 404)

    return successResponse(request, {
      task: data,
      can_work: access.canWork,
      can_admin: access.canAdmin,
    })
  } catch (error) {
    return errorResponse(request, error, "task-update")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "admin")
    const admin = createAdminClient()
    const { error } = await admin
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("org_id", access.member.orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "task-delete")
  }
}
