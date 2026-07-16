import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { syncMeetingToGoogle, updateGoogleEvent, deleteGoogleEvent } from "@/lib/services/google-calendar-sync.service"

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

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get single meeting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: meeting, error } = await adminClient
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
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (error || !meeting) {
      throw new AppError("Reunião não encontrada", 404)
    }

    // Fetch profiles for participants separately
    const profMap = new Map<string, Record<string, unknown>>()
    const profIds: string[] = []
    const omIds: string[] = []
    ;(meeting.participants as Array<{ participant_type: string; participant_id: string }> || []).forEach((p) => {
      if (p.participant_type === "profile") profIds.push(p.participant_id)
      else if (p.participant_type === "org_member") omIds.push(p.participant_id)
    })
    if (profIds.length > 0) {
      const { data: profs } = await adminClient.from("profiles").select("id, name, email, avatar_url").in("id", profIds)
      ;(profs || []).forEach((p) => profMap.set(p.id, p))
    }
    if (omIds.length > 0) {
      const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)").in("id", omIds)
      ;(oms || []).forEach((om) => {
        const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
        if (prof) profMap.set(om.id, prof as Record<string, unknown>)
      })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: transformClient(Array.isArray(meeting.client) ? meeting.client[0] : meeting.client),
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: (meeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: profMap.get(p.participant_id as string) || null,
      })),
    }

    return successResponse(request, { meeting: transformedMeeting })
  } catch (error) {
    return errorResponse(request, error, "Meetings")
  }
}

// PUT - Update meeting
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)
    const adminClient = createAdminClient()

    const { id } = await params
    const body = await request.json()

    // Verify meeting belongs to user's org (include fields needed for sync decision)
    const { data: existingMeeting, error: fetchErr } = await adminClient
      .from("meetings")
      .select("id, google_event_id, user_id, scheduled_at, status")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (fetchErr || !existingMeeting) {
      throw new AppError("Reunião não encontrada", 404)
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.client_id !== undefined) updateData.client_id = body.client_id || null
    if (body.store_id !== undefined) updateData.store_id = body.store_id || null
    if (body.scheduled_at !== undefined) updateData.scheduled_at = body.scheduled_at
    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.status !== undefined) updateData.status = body.status
    if (body.meeting_url !== undefined) updateData.meeting_url = body.meeting_url || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.guest_emails !== undefined) updateData.guest_emails = Array.isArray(body.guest_emails) ? body.guest_emails : []
    if (body.completion_notes !== undefined) updateData.completion_notes = body.completion_notes
    if (body.timezone !== undefined) updateData.timezone = body.timezone

    // Auto-fill completion metadata when marking as completed
    if (body.status === "completed") {
      updateData.completed_at = new Date().toISOString()
      updateData.completed_by = user.id
    }

    // Handle participant response (accept/decline invite)
    if (body.participant_response) {
      const { participant_id, status: responseStatus } = body.participant_response
      if (participant_id && responseStatus) {
        const { error: responseError } = await adminClient
          .from("meeting_participants")
          .update({ response_status: responseStatus })
          .eq("meeting_id", id)
          .eq("participant_id", participant_id)

        if (responseError) {
          log.error("[Meeting] Error updating participant response:", responseError)
        }
      }
    }

    const { error: updateError } = await adminClient
      .from("meetings")
      .update(updateData)
      .eq("id", id)
      .eq("org_id", orgId)

    if (updateError) {
      log.error("[Meeting] Update error:", updateError)
      throw new AppError("Erro ao atualizar reunião", 500)
    }

    // Update participants if provided
    if (body.participants !== undefined) {
      // Get existing participants
      const { data: existingParticipants } = await adminClient
        .from("meeting_participants")
        .select("*")
        .eq("meeting_id", id)

      const existing = existingParticipants || []
      const newParticipants: Array<{ id: string; type: string }> = body.participants || []

      // Find organizer (keep them)
      const organizer = existing.find(p => p.is_organizer)

      // Remove non-organizer participants that are not in the new list
      const toRemove = existing.filter(p =>
        !p.is_organizer &&
        !newParticipants.some(np => np.id === p.participant_id && (np.type || "profile") === p.participant_type)
      )

      if (toRemove.length > 0) {
        await adminClient
          .from("meeting_participants")
          .delete()
          .in("id", toRemove.map(p => p.id))
      }

      // Add new participants that don't exist yet
      const toAdd = newParticipants.filter(np =>
        np.id !== organizer?.participant_id && // Don't add if it's the organizer
        !existing.some(ep => ep.participant_id === np.id && ep.participant_type === (np.type || "profile"))
      )

      if (toAdd.length > 0) {
        const participantInserts = toAdd.map((p) => ({
          meeting_id: id,
          participant_id: p.id,
          participant_type: p.type || "profile",
          is_organizer: false,
          response_status: "pending",
        }))

        const { error: addError } = await adminClient
          .from("meeting_participants")
          .insert(participantInserts)

        if (addError) {
          log.error("[Meeting] Error adding participants:", addError)
        }
      }
    }

    // Reschedule: reset response_status to 'pending' if scheduled_at changed
    const isRescheduled = body.scheduled_at !== undefined &&
      body.scheduled_at !== existingMeeting.scheduled_at
    if (isRescheduled) {
      const { error: resetError } = await adminClient
        .from("meeting_participants")
        .update({ response_status: "pending" })
        .eq("meeting_id", id)
      if (resetError) {
        log.error("[Meeting] Error resetting participant responses on reschedule:", resetError)
      }
    }

    // Status change to cancelled: delete Google Calendar event
    const isCancelling = body.status === "cancelled" && existingMeeting.status !== "cancelled"

    // Google Calendar sync (fire-and-forget with graceful fallback)
    try {
      if (isCancelling && existingMeeting.google_event_id) {
        // Cancel on Google Calendar
        await deleteGoogleEvent(id)
      } else if (!isCancelling) {
        // Update or create Google Calendar event
        if (existingMeeting.google_event_id) {
          await updateGoogleEvent(id)
        } else {
          await syncMeetingToGoogle(id, existingMeeting.user_id)
        }
      }
    } catch (syncError) {
      log.warn("Google Calendar sync failed for meeting update", {
        meetingId: id,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      })
      // Non-blocking: update sync status to error but don't fail the request
      await adminClient
        .from("meetings")
        .update({
          google_sync_status: "error",
          google_sync_error: syncError instanceof Error ? syncError.message : "Google Calendar sync failed",
        })
        .eq("id", id)
    }

    // Fetch updated meeting with participants
    const { data: meeting } = await adminClient
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
      .eq("id", id)
      .single()

    if (!meeting) {
      throw new AppError("Reunião não encontrada", 404)
    }

    // Fetch profiles for participants
    const putProfMap = new Map<string, Record<string, unknown>>()
    const putProfIds: string[] = []
    const putOmIds: string[] = []
    ;(meeting.participants as Array<{ participant_type: string; participant_id: string }> || []).forEach((p) => {
      if (p.participant_type === "profile") putProfIds.push(p.participant_id)
      else if (p.participant_type === "org_member") putOmIds.push(p.participant_id)
    })
    if (putProfIds.length > 0) {
      const { data: profs } = await adminClient.from("profiles").select("id, name, email, avatar_url").in("id", putProfIds)
      ;(profs || []).forEach((p) => putProfMap.set(p.id, p))
    }
    if (putOmIds.length > 0) {
      const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)").in("id", putOmIds)
      ;(oms || []).forEach((om) => {
        const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
        if (prof) putProfMap.set(om.id, prof as Record<string, unknown>)
      })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: transformClient(Array.isArray(meeting.client) ? meeting.client[0] : meeting.client),
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: (meeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: putProfMap.get(p.participant_id as string) || null,
      })),
    }

    return successResponse(request, { meeting: transformedMeeting, message: "Reunião atualizada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Meetings")
  }
}

// DELETE - Delete meeting
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const { id } = await params
    const adminClient = createAdminClient()

    // Verify meeting belongs to user's org before deleting (include google_event_id for sync)
    const { data: meetingToDelete, error: fetchDeleteErr } = await adminClient
      .from("meetings")
      .select("id, google_event_id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (fetchDeleteErr || !meetingToDelete) {
      throw new AppError("Reunião não encontrada", 404)
    }

    // Delete from Google Calendar first (fire-and-forget)
    if (meetingToDelete.google_event_id) {
      try {
        await deleteGoogleEvent(id)
      } catch (syncError) {
        log.warn("Failed to delete Google Calendar event, proceeding with local delete", {
          meetingId: id,
          error: syncError instanceof Error ? syncError.message : String(syncError),
        })
      }
    }

    const { error: deleteError } = await adminClient
      .from("meetings")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)

    if (deleteError) {
      log.error("[Meeting] Delete error:", deleteError)
      throw new AppError("Erro ao excluir reunião", 500)
    }

    return successResponse(request, { message: "Reunião excluída com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Meetings")
  }
}
