import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("Meetings")

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

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: meeting, error } = await adminClient
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
      .eq("id", id)
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
      const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles(id, name, email, avatar_url)").in("id", omIds)
      ;(oms || []).forEach((om) => {
        const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
        if (prof) profMap.set(om.id, prof as Record<string, unknown>)
      })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
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
    const adminClient = createAdminClient()
    const user = await requireAuth(supabase)

    const { id } = await params
    const body = await request.json()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.client_id !== undefined) updateData.client_id = body.client_id || null
    if (body.scheduled_at !== undefined) updateData.scheduled_at = body.scheduled_at
    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.status !== undefined) updateData.status = body.status
    if (body.meeting_url !== undefined) updateData.meeting_url = body.meeting_url || null
    if (body.notes !== undefined) updateData.notes = body.notes || null

    const { error: updateError } = await adminClient
      .from("meetings")
      .update(updateData)
      .eq("id", id)

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

    // Fetch updated meeting with participants
    const { data: meeting } = await adminClient
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
      const { data: oms } = await adminClient.from("org_members").select("id, profile:profiles(id, name, email, avatar_url)").in("id", putOmIds)
      ;(oms || []).forEach((om) => {
        const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
        if (prof) putProfMap.set(om.id, prof as Record<string, unknown>)
      })
    }

    // Transform data
    const transformedMeeting = {
      ...meeting,
      client: Array.isArray(meeting.client) ? meeting.client[0] : meeting.client,
      user: Array.isArray(meeting.user) ? meeting.user[0] : meeting.user,
      participants: (meeting.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: putProfMap.get(p.participant_id as string) || null,
      })),
    }

    return NextResponse.json(
      { meeting: transformedMeeting, message: "Reunião atualizada com sucesso" },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
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

    const { id } = await params
    const adminClient = createAdminClient()

    const { error: deleteError } = await adminClient
      .from("meetings")
      .delete()
      .eq("id", id)

    if (deleteError) {
      log.error("[Meeting] Delete error:", deleteError)
      throw new AppError("Erro ao excluir reunião", 500)
    }

    return successResponse(request, { message: "Reunião excluída com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Meetings")
  }
}
