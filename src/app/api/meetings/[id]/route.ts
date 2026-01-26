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

// GET - Get single meeting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id } = await params

    const { data: meeting, error } = await supabase
      .from("meetings")
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url)
      `)
      .eq("id", id)
      .single()

    if (error || !meeting) {
      return NextResponse.json({ error: "Reunião não encontrada" }, { status: 404, headers: corsHeaders() })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
    }

    return NextResponse.json({ meeting: transformedMeeting }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Meeting] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// PUT - Update meeting
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id } = await params
    const body = await request.json()

    const adminClient = createAdminClient()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.client_id !== undefined) updateData.client_id = body.client_id || null
    if (body.scheduled_at !== undefined) updateData.scheduled_at = body.scheduled_at
    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.status !== undefined) updateData.status = body.status
    if (body.meeting_url !== undefined) updateData.meeting_url = body.meeting_url || null
    if (body.notes !== undefined) updateData.notes = body.notes || null

    const { data: meeting, error: updateError } = await adminClient
      .from("meetings")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url)
      `)
      .single()

    if (updateError) {
      console.error("[Meeting] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar reunião" }, { status: 500, headers: corsHeaders() })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
    }

    return NextResponse.json(
      { meeting: transformedMeeting, message: "Reunião atualizada com sucesso" },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Meeting] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// DELETE - Delete meeting
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id } = await params

    const adminClient = createAdminClient()

    const { error: deleteError } = await adminClient
      .from("meetings")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[Meeting] Delete error:", deleteError)
      return NextResponse.json({ error: "Erro ao excluir reunião" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ message: "Reunião excluída com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Meeting] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
