import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
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
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
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
      console.error("[Task Comments] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar comentários" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ comments: comments || [] }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Task Comments] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
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
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const body = await request.json()

    if (!body.content) {
      return NextResponse.json(
        { error: "Conteúdo é obrigatório" },
        { status: 400, headers: corsHeaders() }
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
      console.error("[Task Comments] Insert error:", insertError)
      return NextResponse.json(
        { error: "Erro ao adicionar comentário" },
        { status: 500, headers: corsHeaders() }
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
      { status: 201, headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Task Comments] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
