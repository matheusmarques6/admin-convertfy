import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("Meetings")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List meetings with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
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
          response_status
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
      log.error("[Meetings] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar reuniões" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // If filtering by participant, filter meetings that include this participant
    let filteredMeetings = meetings || []
    if (participantId) {
      filteredMeetings = filteredMeetings.filter(m => {
        const participants = m.participants || []
        return participants.some((p: { participant_id: string }) => p.participant_id === participantId) || m.user_id === participantId
      })
    }

    // Fetch profiles for participants separately (polymorphic participant_id has no FK)
    const participantProfileIds = new Set<string>()
    const participantOrgMemberIds = new Set<string>()
    filteredMeetings.forEach((m: Record<string, unknown>) => {
      const parts = (m.participants || []) as Array<{ participant_type: string; participant_id: string }>
      parts.forEach((p) => {
        if (p.participant_type === "profile" && p.participant_id) {
          participantProfileIds.add(p.participant_id)
        } else if (p.participant_type === "org_member" && p.participant_id) {
          participantOrgMemberIds.add(p.participant_id)
        }
      })
    })

    const profilesMap = new Map<string, Record<string, unknown>>()

    if (participantProfileIds.size > 0) {
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, name, email, avatar_url")
        .in("id", Array.from(participantProfileIds))
      ;(profiles || []).forEach((p) => profilesMap.set(p.id, p))
    }

    if (participantOrgMemberIds.size > 0) {
      const { data: orgMembersData } = await adminClient
        .from("org_members")
        .select("id, profile:profiles(id, name, email, avatar_url)")
        .in("id", Array.from(participantOrgMemberIds))
      ;(orgMembersData || []).forEach((om) => {
        const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
        if (prof) profilesMap.set(om.id, prof as Record<string, unknown>)
      })
    }

    // Transform data to handle Supabase array quirk
    const transformedMeetings = filteredMeetings.map(m => ({
      ...m,
      client: Array.isArray(m.client) ? m.client[0] : m.client,
      user: Array.isArray(m.user) ? m.user[0] : m.user,
      participants: (m.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: profilesMap.get(p.participant_id as string) || null,
      })),
    }))

    return NextResponse.json({ meetings: transformedMeetings }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Meetings] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// POST - Create new meeting
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body = await request.json()

    if (!body.title || !body.scheduled_at) {
      return NextResponse.json(
        { error: "Título e data/hora são obrigatórios" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const { data: meeting, error: insertError } = await adminClient
      .from("meetings")
      .insert({
        title: body.title,
        client_id: body.client_id || null,
        user_id: user.id,
        created_by: user.id,
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
      log.error("[Meetings] Insert error:", insertError)
      return NextResponse.json(
        { error: "Erro ao criar reunião" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
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
        log.error("[Meetings] Error adding participants:", participantsError)
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
          response_status
        )
      `)
      .eq("id", meeting.id)
      .single()

    // Fetch profiles for participants
    const postProfilesMap = new Map<string, Record<string, unknown>>()
    if (fullMeeting?.participants) {
      const profIds: string[] = []
      const omIds: string[] = []
      ;(fullMeeting.participants as Array<{ participant_type: string; participant_id: string }>).forEach((p) => {
        if (p.participant_type === "profile") profIds.push(p.participant_id)
        else if (p.participant_type === "org_member") omIds.push(p.participant_id)
      })
      if (profIds.length > 0) {
        const { data: profs } = await adminClient.from("profiles").select("id, name, email, avatar_url").in("id", profIds)
        ;(profs || []).forEach((p) => postProfilesMap.set(p.id, p))
      }
      if (omIds.length > 0) {
        const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles(id, name, email, avatar_url)").in("id", omIds)
        ;(oms || []).forEach((om) => {
          const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
          if (prof) postProfilesMap.set(om.id, prof as Record<string, unknown>)
        })
      }
    }

    // Transform data
    const transformedMeeting = fullMeeting ? {
      ...fullMeeting,
      client: Array.isArray(fullMeeting.client) ? fullMeeting.client[0] : fullMeeting.client,
      user: Array.isArray(fullMeeting.user) ? fullMeeting.user[0] : fullMeeting.user,
      participants: (fullMeeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: postProfilesMap.get(p.participant_id as string) || null,
      })),
    } : {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: [],
    }

    return NextResponse.json(
      { meeting: transformedMeeting, message: "Reunião agendada com sucesso" },
      { status: 201, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    log.error("[Meetings] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
