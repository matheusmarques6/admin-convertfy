import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TasksComments")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get comments for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const adminClient = createAdminClient()

    const { data: comments, error } = await adminClient
      .from("task_comments")
      .select(`
        *,
        author:profiles(id, name, email, avatar_url)
      `)
      .eq("task_id", id)
      .order("created_at", { ascending: true })

    if (error) {
      log.error("[Task Comments] Error fetching:", error)
      throw new AppError("Erro ao buscar comentários", 500)
    }

    return successResponse(request, { comments: comments || [] })
  } catch (error) {
    return errorResponse(request, error, "TasksComments")
  }
}

// POST - Add comment to task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()

    if (!body.content) {
      throw new AppError("Conteúdo é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    const { data: comment, error: insertError } = await adminClient
      .from("task_comments")
      .insert({
        task_id: id,
        author_id: user.id,
        content: body.content,
        mentions: body.mentions || [],
        attachments: body.attachments || [],
      })
      .select(`
        *,
        author:profiles(id, name, email, avatar_url)
      `)
      .single()

    if (insertError) {
      log.error("[Task Comments] Insert error:", insertError)
      throw new AppError("Erro ao adicionar comentário", 500)
    }

    // Record in history
    await adminClient.from("task_history").insert({
      task_id: id,
      actor_id: user.id,
      action: "commented",
      new_value: { comment_id: comment.id },
    })

    return successResponse(request, { comment, message: "Comentário adicionado" }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "TasksComments")
  }
}
