import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { attemptOnboardingHandoff } from "@/lib/services/onboarding-task-completion.service"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

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
    const { data, error } = await admin
      .from("task_checklists")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true })
    if (error) throw error
    return successResponse(request, {
      checklists: data ?? [],
      can_work: access.canWork,
      can_admin: access.canAdmin,
    })
  } catch (error) {
    return errorResponse(request, error, "task-checklists-get")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireTaskAccess(user.id, id, "admin")
    const body = await request.json()
    if (!String(body.title ?? "").trim()) {
      throw new AppError("Titulo obrigatorio", 400)
    }

    const admin = createAdminClient()
    const { data: last } = await admin
      .from("task_checklists")
      .select("position")
      .eq("task_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data, error } = await admin
      .from("task_checklists")
      .insert({
        task_id: id,
        title: String(body.title).trim(),
        position: (last?.position ?? 0) + 1,
      })
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { checklist: data }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "task-checklists-create")
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
    const body = await request.json()
    if (!body.checklist_id) {
      throw new AppError("checklist_id obrigatorio", 400)
    }

    const hasAdminMutation =
      body.title !== undefined || body.position !== undefined
    const access = await requireTaskAccess(
      user.id,
      id,
      hasAdminMutation ? "admin" : "work",
    )
    const patch: Record<string, unknown> = {}
    if (body.title !== undefined) patch.title = String(body.title).trim()
    if (body.position !== undefined) patch.position = body.position
    if (body.is_completed !== undefined) {
      patch.is_completed = Boolean(body.is_completed)
      patch.completed_by = body.is_completed ? user.id : null
      patch.completed_at = body.is_completed ? new Date().toISOString() : null
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("Nenhum campo editavel informado", 400)
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("task_checklists")
      .update(patch)
      .eq("id", body.checklist_id)
      .eq("task_id", id)
      .select("*")
      .maybeSingle()
    if (error) throw error
    if (!data) throw new AppError("Checklist nao encontrado", 404)

    let handoff = "not_ready"
    if (access.task.onboarding_id) {
      handoff = await attemptOnboardingHandoff({
        onboardingId: access.task.onboarding_id,
        actorId: user.id,
      })
    }
    return successResponse(request, { checklist: data, handoff })
  } catch (error) {
    return errorResponse(request, error, "task-checklists-update")
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
    await requireTaskAccess(user.id, id, "admin")
    const checklistId = request.nextUrl.searchParams.get("checklist_id")
    if (!checklistId) throw new AppError("checklist_id obrigatorio", 400)

    const admin = createAdminClient()
    const { error } = await admin
      .from("task_checklists")
      .delete()
      .eq("id", checklistId)
      .eq("task_id", id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "task-checklists-delete")
  }
}
