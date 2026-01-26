import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

// GET - List meetings with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const clientId = searchParams.get("client_id")
    const upcoming = searchParams.get("upcoming") === "true"

    let query = supabase
      .from("meetings")
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url)
      `)
      .order("scheduled_at", { ascending: true })

    if (status) {
      query = query.eq("status", status)
    }

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (upcoming) {
      query = query.gte("scheduled_at", new Date().toISOString())
    }

    const { data: meetings, error } = await query

    if (error) {
      console.error("[Meetings] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar reuniões" }, { status: 500, headers: corsHeaders() })
    }

    // Transform data to handle Supabase array quirk
    const transformedMeetings = (meetings || []).map(m => ({
      ...m,
      client: Array.isArray(m.client) ? m.client[0] : m.client,
      user: Array.isArray(m.user) ? m.user[0] : m.user,
    }))

    return NextResponse.json({ meetings: transformedMeetings }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Meetings] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// POST - Create new meeting
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const body = await request.json()

    if (!body.title || !body.scheduled_at) {
      return NextResponse.json(
        { error: "Título e data/hora são obrigatórios" },
        { status: 400, headers: corsHeaders() }
      )
    }

    const { data: meeting, error: insertError } = await supabase
      .from("meetings")
      .insert({
        title: body.title,
        client_id: body.client_id || null,
        user_id: user.id,
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes || 30,
        status: "scheduled",
        meeting_url: body.meeting_url || null,
        notes: body.notes || null,
      })
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url)
      `)
      .single()

    if (insertError) {
      console.error("[Meetings] Insert error:", insertError)
      return NextResponse.json(
        { error: "Erro ao criar reunião" },
        { status: 500, headers: corsHeaders() }
      )
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
    }

    return NextResponse.json(
      { meeting: transformedMeeting, message: "Reunião agendada com sucesso" },
      { status: 201, headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Meetings] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
