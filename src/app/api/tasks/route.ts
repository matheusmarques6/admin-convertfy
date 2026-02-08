import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { TaskFormData } from "@/types"

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

// GET - List tasks with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const adminClient = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const type = searchParams.get("type")
    const assigneeId = searchParams.get("assignee_id")
    const clientId = searchParams.get("client_id")
    const storeId = searchParams.get("store_id")
    const priority = searchParams.get("priority")
    const myTasks = searchParams.get("my_tasks") === "true"

    let query = adminClient
      .from("tasks")
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
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })

    // Apply filters
    if (status) {
      query = query.eq("status", status)
    }

    if (type) {
      query = query.eq("type", type)
    }

    if (assigneeId) {
      query = query.eq("assignee_id", assigneeId)
    }

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    if (priority) {
      query = query.eq("priority", priority)
    }

    // Get current user's org_member_id for "my tasks" filter
    if (myTasks) {
      const { data: orgMember } = await adminClient
        .from("org_members")
        .select("id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .single()

      if (orgMember) {
        query = query.eq("assignee_id", orgMember.id)
      }
    }

    const { data: tasks, error } = await query

    if (error) {
      console.error("[Tasks] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar tarefas" }, { status: 500, headers: corsHeaders() })
    }

    // Get comments count for each task
    const tasksWithCounts = await Promise.all(
      (tasks || []).map(async (task) => {
        const { count } = await adminClient
          .from("task_comments")
          .select("*", { count: "exact", head: true })
          .eq("task_id", task.id)

        return {
          ...task,
          comments_count: count || 0,
        }
      })
    )

    return NextResponse.json({ tasks: tasksWithCounts }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Tasks] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// POST - Create new task
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const body: TaskFormData = await request.json()

    if (!body.title) {
      return NextResponse.json(
        { error: "Título é obrigatório" },
        { status: 400, headers: corsHeaders() }
      )
    }

    const adminClient = createAdminClient()

    // Get next position for the status
    const { data: lastTask } = await adminClient
      .from("tasks")
      .select("position")
      .eq("status", "pending")
      .order("position", { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (lastTask?.position || 0) + 1

    const { data: task, error: insertError } = await adminClient
      .from("tasks")
      .insert({
        title: body.title,
        description: body.description || null,
        type: body.type || "general",
        priority: body.priority || "medium",
        assignee_id: body.assignee_id || null,
        created_by: user.id,
        client_id: body.client_id || null,
        store_id: body.store_id || null,
        due_date: body.due_date || null,
        tags: body.tags || [],
        metadata: body.metadata || {},
        position: nextPosition,
        status: "pending",
      })
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

    if (insertError) {
      console.error("[Tasks] Insert error:", insertError)
      return NextResponse.json(
        { error: "Erro ao criar tarefa" },
        { status: 500, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      { task, message: "Tarefa criada com sucesso" },
      { status: 201, headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Tasks] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
