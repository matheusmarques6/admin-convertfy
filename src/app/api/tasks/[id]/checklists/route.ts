import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TasksChecklists")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get checklists for a task
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

    const { data: checklists, error } = await adminClient
      .from("task_checklists")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true })

    if (error) {
      log.error("[Task Checklists] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar checklists" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ checklists: checklists || [] }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Task Checklists] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// POST - Add checklist item
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

    if (!body.title) {
      return NextResponse.json(
        { error: "Título é obrigatório" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const adminClient = createAdminClient()

    // Get next position
    const { data: lastItem } = await adminClient
      .from("task_checklists")
      .select("position")
      .eq("task_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextPosition = (lastItem?.position || 0) + 1

    const { data: checklist, error: insertError } = await adminClient
      .from("task_checklists")
      .insert({
        task_id: id,
        title: body.title,
        position: nextPosition,
      })
      .select()
      .single()

    if (insertError) {
      log.error("[Task Checklists] Insert error:", insertError)
      return NextResponse.json(
        { error: "Erro ao adicionar item" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json(
      { checklist, message: "Item adicionado" },
      { status: 201, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    log.error("[Task Checklists] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// PUT - Update checklist item (toggle complete, reorder)
export async function PUT(
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
    const adminClient = createAdminClient()

    if (!body.checklist_id) {
      return NextResponse.json(
        { error: "checklist_id é obrigatório" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.position !== undefined) updateData.position = body.position

    if (body.is_completed !== undefined) {
      updateData.is_completed = body.is_completed
      if (body.is_completed) {
        updateData.completed_by = user.id
        updateData.completed_at = new Date().toISOString()
      } else {
        updateData.completed_by = null
        updateData.completed_at = null
      }
    }

    const { data: checklist, error: updateError } = await adminClient
      .from("task_checklists")
      .update(updateData)
      .eq("id", body.checklist_id)
      .eq("task_id", id)
      .select()
      .single()

    if (updateError) {
      log.error("[Task Checklists] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar item" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ checklist, message: "Item atualizado" }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Task Checklists] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// DELETE - Remove checklist item
export async function DELETE(
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

    const searchParams = request.nextUrl.searchParams
    const checklistId = searchParams.get("checklist_id")

    if (!checklistId) {
      return NextResponse.json(
        { error: "checklist_id é obrigatório" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const adminClient = createAdminClient()

    const { error: deleteError } = await adminClient
      .from("task_checklists")
      .delete()
      .eq("id", checklistId)
      .eq("task_id", id)

    if (deleteError) {
      log.error("[Task Checklists] Delete error:", deleteError)
      return NextResponse.json({ error: "Erro ao remover item" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ success: true, message: "Item removido" }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Task Checklists] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
