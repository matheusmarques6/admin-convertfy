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

interface SubItem {
  slug: string
  label: string
  completed?: boolean
  completed_at?: string | null
  completed_by?: string | null
  [key: string]: unknown
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; slug: string }> },
) {
  try {
    const { id, slug } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const body = (await request.json().catch(() => ({}))) as {
      completed?: boolean
    }
    const admin = createAdminClient()

    let updatedTask: Record<string, unknown> | null = null
    let updatedSubItem: SubItem | null = null
    let access = await requireTaskAccess(user.id, id, "work")

    for (let attempt = 0; attempt < 3 && !updatedTask; attempt += 1) {
      const metadata = (access.task.metadata ?? {}) as Record<string, unknown> & {
        sub_items?: SubItem[]
      }
      const subItems = Array.isArray(metadata.sub_items)
        ? metadata.sub_items.map((item) => ({ ...item }))
        : []
      const index = subItems.findIndex((item) => item.slug === slug)
      if (index < 0) throw new AppError("Sub-item nao encontrado", 404)

      const completed =
        typeof body.completed === "boolean"
          ? body.completed
          : subItems[index].completed !== true
      updatedSubItem = {
        ...subItems[index],
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? user.id : null,
      }
      subItems[index] = updatedSubItem

      const patch: Record<string, unknown> = {
        metadata: { ...metadata, sub_items: subItems },
      }
      if (!completed && access.task.status === "completed") {
        patch.status = "in_progress"
        patch.completed_at = null
      }

      const result = await admin
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .eq("updated_at", access.task.updated_at as string)
        .select("id, onboarding_id, metadata, status, updated_at")
        .maybeSingle()
      if (result.error) throw result.error
      updatedTask = result.data
      if (!updatedTask) access = await requireTaskAccess(user.id, id, "work")
    }

    if (!updatedTask || !updatedSubItem) {
      throw new AppError("Task foi alterada por outra pessoa; tente novamente", 409)
    }

    let handoff = "not_ready"
    if (access.task.onboarding_id) {
      handoff = await attemptOnboardingHandoff({
        onboardingId: access.task.onboarding_id,
        actorId: user.id,
      })
    }

    return successResponse(request, {
      task: updatedTask,
      sub_item: updatedSubItem,
      handoff,
    })
  } catch (error) {
    return errorResponse(request, error, "sub-item-toggle")
  }
}
