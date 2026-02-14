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
    const participantId = searchParams.get("participant_id")

    const adminClient = createAdminClient()

    let query = adminClient
      .from("meetings")
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url),
        participants:meeting_participants(
          id,
          participant_id,
          participant_type,
          is_organizer,
          response_status,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
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

    // If filtering by participant, filter meetings that include this participant
    let filteredMeetings = meetings || []
    if (participantId) {
      filteredMeetings = filteredMeetings.filter(m => {
        const participants = m.participants || []
        return participants.some((p: { participant_id: string }) => p.participant_id === participantId) || m.user_id === participantId
      })
    }

    // Transform data to handle Supabase array quirk
    const transformedMeetings = filteredMeetings.map(m => ({
      ...m,
      client: Array.isArray(m.client) ? m.client[0] : m.client,
      user: Array.isArray(m.user) ? m.user[0] : m.user,
      participants: (m.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
      })),
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
    const adminClient = createAdminClient()
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

    const { data: meeting, error: insertError } = await adminClient
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

    // Add the creator as organizer participant
    await adminClient
      .from("meeting_participants")
      .insert({
        meeting_id: meeting.id,
        participant_id: user.id,
        participant_type: "profile",
        is_organizer: true,
        response_status: "accepted",
      })

    // Add additional participants if provided
    const participants = body.participants || []
    if (participants.length > 0) {
      const participantInserts = participants.map((p: { id: string; type: string }) => ({
        meeting_id: meeting.id,
        participant_id: p.id,
        participant_type: p.type || "profile",
        is_organizer: false,
        response_status: "pending",
      }))

      const { error: participantsError } = await adminClient
        .from("meeting_participants")
        .insert(participantInserts)

      if (participantsError) {
        console.error("[Meetings] Error adding participants:", participantsError)
      }
    }

    // Fetch the meeting with participants
    const { data: fullMeeting } = await adminClient
      .from("meetings")
      .select(`
        *,
        client:clients(id, name, company),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url),
        participants:meeting_participants(
          id,
          participant_id,
          participant_type,
          is_organizer,
          response_status,
          profile:profiles!meeting_participants_participant_id_fkey(id, name, email, avatar_url)
        )
      `)
      .eq("id", meeting.id)
      .single()

    // Transform data
    const transformedMeeting = fullMeeting ? {
      ...fullMeeting,
      client: Array.isArray(fullMeeting.client) ? fullMeeting.client[0] : fullMeeting.client,
      user: Array.isArray(fullMeeting.user) ? fullMeeting.user[0] : fullMeeting.user,
      participants: (fullMeeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
      })),
    } : {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: [],
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
