import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get single task with all details
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

    // Fetch task with related data
    const { data: task, error } = await adminClient
      .from("tasks")
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles(id, name, email, avatar_url)
        ),
        creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
        client:clients(id, name, company, email),
        store:client_stores(id, store_name, store_url, platform)
      `)
      .eq("id", id)
      .single()

    if (error || !task) {
      console.error("[Task] Fetch error:", error)
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404, headers: corsHeaders() })
    }

    // Fetch comments
    const { data: comments } = await adminClient
      .from("task_comments")
      .select(`
        *,
        author:profiles(id, name, email, avatar_url)
      `)
      .eq("task_id", id)
      .order("created_at", { ascending: true })

    // Fetch checklists
    const { data: checklists } = await adminClient
      .from("task_checklists")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true })

    // Fetch history
    const { data: history } = await adminClient
      .from("task_history")
      .select(`
        *,
        actor:profiles(id, name, avatar_url)
      `)
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(20)

    return NextResponse.json({
      task: {
        ...task,
        comments: comments || [],
        checklists: checklists || [],
        history: history || [],
      },
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Task] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// PUT - Update task
export async function PUT(
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
    const adminClient = createAdminClient()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.type !== undefined) updateData.type = body.type
    if (body.status !== undefined) {
      updateData.status = body.status

      // Set started_at when moving to in_progress
      if (body.status === "in_progress") {
        const { data: currentTask } = await adminClient
          .from("tasks")
          .select("started_at")
          .eq("id", id)
          .single()

        if (!currentTask?.started_at) {
          updateData.started_at = new Date().toISOString()
        }
      }

      // Set completed_at when completing
      if (body.status === "completed") {
        updateData.completed_at = new Date().toISOString()
      }
    }
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.assignee_id !== undefined) updateData.assignee_id = body.assignee_id
    if (body.client_id !== undefined) updateData.client_id = body.client_id
    if (body.store_id !== undefined) updateData.store_id = body.store_id
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.position !== undefined) updateData.position = body.position
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.metadata !== undefined) updateData.metadata = body.metadata

    const { data: task, error: updateError } = await adminClient
      .from("tasks")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles(id, name, email, avatar_url)
        ),
        creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
        client:clients(id, name, company),
        store:client_stores(id, store_name, platform)
      `)
      .single()

    if (updateError) {
      console.error("[Task] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar tarefa" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ task, message: "Tarefa atualizada com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Task] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// DELETE - Delete task
export async function DELETE(
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

    const { error: deleteError } = await adminClient
      .from("tasks")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[Task] Delete error:", deleteError)
      return NextResponse.json({ error: "Erro ao excluir tarefa" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ success: true, message: "Tarefa excluída com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Task] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
