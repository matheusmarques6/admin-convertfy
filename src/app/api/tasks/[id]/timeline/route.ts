import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
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
    await requireTaskAccess(user.id, id, "read")
    const admin = createAdminClient()
    const [historyResult, commentsResult] = await Promise.all([
      admin
        .from("task_history")
        .select(
          "id, action, old_value, new_value, created_at, actor:profiles!task_history_actor_id_fkey(id, name, email, avatar_url)",
        )
        .eq("task_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("task_comments")
        .select(
          "id, content, mentions, attachments, created_at, updated_at, author:profiles!task_comments_author_id_fkey(id, name, email, avatar_url)",
        )
        .eq("task_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
    ])
    if (historyResult.error) throw historyResult.error
    if (commentsResult.error) throw commentsResult.error

    const timeline = [
      ...(historyResult.data ?? [])
        .filter((item) => item.action !== "commented")
        .map((item) => ({ type: "history", ...item })),
      ...(commentsResult.data ?? []).map((item) => ({
        type: "comment",
        ...item,
      })),
    ].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    return successResponse(request, { timeline })
  } catch (error) {
    return errorResponse(request, error, "task-timeline")
  }
}
