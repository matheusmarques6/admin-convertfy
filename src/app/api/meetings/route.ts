import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { TaskAutomationService } from "@/lib/services/task-automation.service"
import { syncMeetingToGoogle } from "@/lib/services/google-calendar-sync.service"

const log = logger.child("Meetings")

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado", 403)
  }
  return orgMember.org_id
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List meetings with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

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
        client:clients(id, name, company, client_stores(id, store_name)),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url),
        participants:meeting_participants(
          id,
          participant_id,
          participant_type,
          is_organizer,
          response_status
        )
      `)
      .eq("org_id", orgId)
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

    // Pre-filter by participant in SQL to reduce data transfer
    if (participantId) {
      const { data: participantMeetings } = await adminClient
        .from("meeting_participants")
        .select("meeting_id")
        .eq("participant_id", participantId)

      const meetingIdsFromParticipants = participantMeetings?.map((p) => p.meeting_id) || []

      // Also include meetings where user is the organizer (user_id)
      if (meetingIdsFromParticipants.length === 0) {
        query = query.eq("user_id", participantId)
      } else {
        query = query.or(`user_id.eq.${participantId},id.in.(${meetingIdsFromParticipants.join(",")})`)
      }
    }

    const { data: meetings, error } = await query

    if (error) {
      log.error("[Meetings] Error fetching:", error)
      throw new AppError("Erro ao buscar reuniões", 500)
    }

    const filteredMeetings = meetings || []

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
        .select("id, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)")
        .in("id", Array.from(participantOrgMemberIds))
      ;(orgMembersData || []).forEach((om) => {
        const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
        if (prof) profilesMap.set(om.id, prof as Record<string, unknown>)
      })
    }

    // Transform data to handle Supabase array quirk
    const transformedMeetings = filteredMeetings.map(m => {
      const clientData = Array.isArray(m.client) ? m.client[0] : m.client
      return {
        ...m,
        client: clientData ? {
          id: clientData.id,
          name: clientData.name,
          company: clientData.company,
          stores: (Array.isArray(clientData.client_stores) ? clientData.client_stores : [])
            .map((s: { store_name: string }) => s.store_name)
            .filter(Boolean),
        } : null,
        user: Array.isArray(m.user) ? m.user[0] : m.user,
        participants: (m.participants || []).map((p: Record<string, unknown>) => ({
          ...p,
          profile: profilesMap.get(p.participant_id as string) || null,
        })),
      }
    })

    return successResponse(request, { meetings: transformedMeetings })
  } catch (error) {
    return errorResponse(request, error, "Meetings")
  }
}

// POST - Create new meeting
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const body = await request.json()

    if (!body.title || !body.scheduled_at) {
      throw new AppError("Título e data/hora são obrigatórios", 400)
    }

    const timezone = body.timezone || "America/Sao_Paulo"

    const { data: meeting, error: insertError } = await adminClient
      .from("meetings")
      .insert({
        title: body.title,
        client_id: body.client_id || null,
        store_id: body.store_id || null,
        user_id: user.id,
        created_by: user.id,
        org_id: orgId,
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes || 30,
        status: "scheduled",
        meeting_url: body.meeting_url || null,
        notes: body.notes || null,
        timezone,
      })
      .select(`
        *,
        client:clients(id, name, company, client_stores(id, store_name)),
        user:profiles!meetings_user_id_fkey(id, name, email, avatar_url)
      `)
      .single()

    if (insertError) {
      log.error("[Meetings] Insert error:", insertError)
      throw new AppError("Erro ao criar reunião", 500)
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
        client:clients(id, name, company, client_stores(id, store_name)),
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
        const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)").in("id", omIds)
        ;(oms || []).forEach((om) => {
          const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
          if (prof) postProfilesMap.set(om.id, prof as Record<string, unknown>)
        })
      }
    }

    // Transform data (extract stores from client)
    function transformClient(raw: Record<string, unknown> | null) {
      if (!raw) return null
      return {
        id: raw.id,
        name: raw.name,
        company: raw.company,
        stores: (Array.isArray(raw.client_stores) ? raw.client_stores : [])
          .map((s: Record<string, unknown>) => s.store_name)
          .filter(Boolean),
      }
    }

    const transformedMeeting = fullMeeting ? {
      ...fullMeeting,
      client: transformClient(Array.isArray(fullMeeting.client) ? fullMeeting.client[0] : fullMeeting.client),
      user: Array.isArray(fullMeeting.user) ? fullMeeting.user[0] : fullMeeting.user,
      participants: (fullMeeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: postProfilesMap.get(p.participant_id as string) || null,
      })),
    } : {
      ...meeting,
      client: transformClient(Array.isArray(meeting.client) ? meeting.client[0] : meeting.client),
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: [],
    }

    // Google Calendar sync (fire-and-forget with graceful fallback)
    let googleSyncWarning: string | undefined
    try {
      const syncResult = await syncMeetingToGoogle(meeting.id, user.id)
      if (syncResult.synced) {
        // Refresh meeting data to include meet_link and sync status
        const { data: refreshedMeeting } = await adminClient
          .from("meetings")
          .select("meeting_url, meeting_url_source, google_event_id, google_sync_status, google_sync_error, google_synced_at")
          .eq("id", meeting.id)
          .single()
        if (refreshedMeeting) {
          Object.assign(transformedMeeting, refreshedMeeting)
        }
      } else {
        googleSyncWarning = syncResult.error || syncResult.reason || "Google Calendar sync failed"
        // Refresh sync status fields even on failure
        const { data: refreshedMeeting } = await adminClient
          .from("meetings")
          .select("google_sync_status, google_sync_error")
          .eq("id", meeting.id)
          .single()
        if (refreshedMeeting) {
          Object.assign(transformedMeeting, refreshedMeeting)
        }
      }
    } catch (syncError) {
      log.warn("Google Calendar sync failed for new meeting", {
        meetingId: meeting.id,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      })
      googleSyncWarning = syncError instanceof Error ? syncError.message : "Google Calendar sync failed"
    }

    // Auto-create board tasks for participants (non-blocking)
    {
      const orgId = await resolveOrgId(supabase, user.id)
      // Collect org_member participant IDs
      const orgMemberParticipantIds: string[] = []
      const allParticipants = body.participants || []
      for (const p of allParticipants) {
        if (p.type === "org_member" && p.id) {
          orgMemberParticipantIds.push(p.id)
        } else if (p.type === "profile" && p.id) {
          // Resolve profile to org_member
          const { data: om } = await adminClient
            .from("org_members")
            .select("id")
            .eq("profile_id", p.id)
            .eq("org_id", orgId)
            .eq("is_active", true)
            .single()
          if (om) orgMemberParticipantIds.push(om.id)
        }
      }
      // Also include creator's org_member
      const { data: creatorMember } = await adminClient
        .from("org_members")
        .select("id")
        .eq("profile_id", user.id)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .single()
      if (creatorMember && !orgMemberParticipantIds.includes(creatorMember.id)) {
        orgMemberParticipantIds.push(creatorMember.id)
      }

      if (orgMemberParticipantIds.length > 0) {
        TaskAutomationService.onMeetingCreated({
          meetingId: meeting.id,
          title: body.title,
          scheduledAt: body.scheduled_at,
          clientId: body.client_id,
          participantOrgMemberIds: orgMemberParticipantIds,
          orgId,
        }).catch((err) => log.error("Erro ao criar auto-task de reunião", { err }))
      }
    }

    return successResponse(request, {
      meeting: transformedMeeting,
      message: "Reunião agendada com sucesso",
      ...(googleSyncWarning ? { google_sync_warning: googleSyncWarning } : {}),
    }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "Meetings")
  }
}
