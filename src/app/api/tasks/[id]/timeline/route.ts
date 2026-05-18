import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/tasks/[id]/timeline
 *
 * Retorna timeline unificada da task, mesclando:
 *  - task_history (eventos sistema: created, status_changed, assigned, completed,
 *                   deliverable_status_changed, commented)
 *  - task_comments (comentários humanos com mentions e attachments)
 *
 * Ordenado cronologicamente. Cada item tem `type` ('history' | 'comment')
 * para o frontend renderizar com dot colorido.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()

    // task_history (eventos)
    const { data: history, error: historyErr } = await admin
      .from("task_history")
      .select("id, action, old_value, new_value, created_at, actor:profiles!task_history_actor_id_fkey(id, name, email, avatar_url)")
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(200)

    if (historyErr) throw new AppError("Erro ao carregar histórico", 500)

    // task_comments (comentários)
    const { data: comments, error: commentsErr } = await admin
      .from("task_comments")
      .select("id, content, mentions, attachments, created_at, updated_at, author:profiles!task_comments_author_id_fkey(id, name, email, avatar_url)")
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(200)

    if (commentsErr) throw new AppError("Erro ao carregar comentários", 500)

    // Mescla cronológica
    const timeline: Array<Record<string, unknown>> = []

    for (const h of history ?? []) {
      // 'commented' history duplica com task_comments — pulamos
      if (h.action === "commented") continue
      timeline.push({
        type: "history",
        id: h.id,
        action: h.action,
        old_value: h.old_value,
        new_value: h.new_value,
        created_at: h.created_at,
        actor: h.actor,
      })
    }

    for (const c of comments ?? []) {
      timeline.push({
        type: "comment",
        id: c.id,
        content: c.content,
        mentions: c.mentions,
        attachments: c.attachments,
        created_at: c.created_at,
        updated_at: c.updated_at,
        author: c.author,
      })
    }

    // Ordena descendente (mais recente primeiro)
    timeline.sort((a, b) => {
      const aT = new Date(a.created_at as string).getTime()
      const bT = new Date(b.created_at as string).getTime()
      return bT - aT
    })

    return successResponse(request, { timeline })
  } catch (error) {
    return errorResponse(request, error, "TasksTimeline")
  }
}
