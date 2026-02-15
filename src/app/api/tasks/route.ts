import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { TaskFormData } from "@/types"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List tasks with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
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
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
        client:clients(id, name, company),
        store:client_stores(id, store_name, platform),
        task_comments(count)
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
      return NextResponse.json({ error: "Erro ao buscar tarefas" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Extract comments_count from the joined count
    const tasksWithCounts = (tasks || []).map((task) => {
      const commentData = task.task_comments as unknown as Array<{ count: number }> | undefined
      const commentsCount = commentData?.[0]?.count ?? 0
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { task_comments: _taskComments, ...rest } = task
      return {
        ...rest,
        comments_count: commentsCount,
      }
    })

    return NextResponse.json({ tasks: tasksWithCounts }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    console.error("[Tasks] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// POST - Create new task
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body: TaskFormData = await request.json()

    if (!body.title) {
      return NextResponse.json(
        { error: "Título é obrigatório" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const adminClient = createAdminClient()

    // Get next position for the status (maybeSingle to handle 0 rows)
    const { data: lastTask } = await adminClient
      .from("tasks")
      .select("position")
      .eq("status", "pending")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextPosition = (lastTask?.position || 0) + 1

    // Sanitize UUID fields: empty strings → null to avoid FK violations
    const sanitizeUuid = (val: unknown): string | null => {
      if (typeof val === "string" && val.trim().length > 0) return val.trim()
      return null
    }

    const insertData = {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      type: body.type || "general",
      priority: body.priority || "medium",
      assignee_id: sanitizeUuid(body.assignee_id),
      created_by: user.id,
      client_id: sanitizeUuid(body.client_id),
      store_id: sanitizeUuid(body.store_id),
      due_date: body.due_date || null,
      tags: body.tags || [],
      metadata: body.metadata || {},
      position: nextPosition,
      status: "pending" as const,
    }

    console.log("[Tasks] Inserting task:", JSON.stringify(insertData, null, 2))

    const { data: task, error: insertError } = await adminClient
      .from("tasks")
      .insert(insertData)
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
        client:clients(id, name, company),
        store:client_stores(id, store_name, platform)
      `)
      .single()

    if (insertError) {
      console.error("[Tasks] Insert error:", insertError.message, insertError.details, insertError.hint, insertError.code)
      return NextResponse.json(
        { error: `Erro ao criar tarefa: ${insertError.message}` },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json(
      { task, message: "Tarefa criada com sucesso" },
      { status: 201, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    console.error("[Tasks] Error:", error)
    const message = error instanceof Error ? error.message : "Erro interno"
    return NextResponse.json({ error: `Erro interno: ${message}` }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
