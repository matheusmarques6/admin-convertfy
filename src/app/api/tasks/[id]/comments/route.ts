import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

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
      return NextResponse.json({ error: "Erro ao buscar comentários" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ comments: comments || [] }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Task Comments] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body = await request.json()

    if (!body.content) {
      return NextResponse.json(
        { error: "Conteúdo é obrigatório" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
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
      return NextResponse.json(
        { error: "Erro ao adicionar comentário" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Record in history
    await adminClient.from("task_history").insert({
      task_id: id,
      actor_id: user.id,
      action: "commented",
      new_value: { comment_id: comment.id },
    })

    return NextResponse.json(
      { comment, message: "Comentário adicionado" },
      { status: 201, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    log.error("[Task Comments] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
