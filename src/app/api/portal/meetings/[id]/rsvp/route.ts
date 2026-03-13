import { NextRequest, NextResponse } from "next/server"
import { errorResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getPortalUser } from "@/lib/portal/auth"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { getValidAccessToken } from "@/lib/services/google-auth.service"
import { GoogleCalendarService } from "@/lib/integrations/google-calendar"

const log = logger.child("PortalMeetingRSVP")

const VALID_RESPONSES = ["accepted", "declined", "tentative"] as const
type RSVPResponse = (typeof VALID_RESPONSES)[number]

// Map local RSVP -> Google Calendar responseStatus
const RSVP_TO_GOOGLE: Record<RSVPResponse, string> = {
  accepted: "accepted",
  declined: "declined",
  tentative: "tentative",
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Nao autorizado", 401)
    }

    const { id: meetingId } = await params

    // Parse and validate body
    const body = await request.json()
    const { response } = body as { response: string }

    if (!response || !VALID_RESPONSES.includes(response as RSVPResponse)) {
      throw new AppError("Resposta invalida. Use: accepted, declined ou tentative", 400)
    }

    const adminClient = createAdminClient()

    // 1. Validate meeting belongs to this portal user's client
    const { data: meeting, error: meetingError } = await adminClient
      .from("meetings")
      .select("id, client_id, user_id, google_event_id, google_calendar_id")
      .eq("id", meetingId)
      .single()

    if (meetingError || !meeting) {
      throw new AppError("Reuniao nao encontrada", 404)
    }

    if (meeting.client_id !== portalUser.client_id) {
      throw new AppError("Acesso negado", 403)
    }

    // 2. Get portal user email for participant matching
    // We need the auth user to find the specific portal user
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      throw new AppError("Nao autorizado", 401)
    }

    const { data: fullPortalUser } = await adminClient
      .from("client_portal_users")
      .select("id, email")
      .eq("auth_user_id", authUser.id)
      .eq("is_active", true)
      .single()

    if (!fullPortalUser?.email) {
      throw new AppError("Email do usuario portal nao encontrado", 500)
    }

    // 3. Find participant record — match by email first, fallback by portal_user id
    const portalEmail = fullPortalUser.email.toLowerCase()

    // Primary: match by email
    let { data: participant } = await adminClient
      .from("meeting_participants")
      .select("id, email, response_status")
      .eq("meeting_id", meetingId)
      .ilike("email", portalEmail)
      .single()

    // Fallback: match by participant_id + participant_type for portal_user entries
    if (!participant) {
      const { data: fallbackParticipant } = await adminClient
        .from("meeting_participants")
        .select("id, email, response_status")
        .eq("meeting_id", meetingId)
        .eq("participant_id", fullPortalUser.id)
        .eq("participant_type", "portal_user")
        .single()

      participant = fallbackParticipant
    }

    if (!participant) {
      throw new AppError("Voce nao e participante desta reuniao", 403)
    }

    // 4. Update response_status
    const { error: updateError } = await adminClient
      .from("meeting_participants")
      .update({
        response_status: response,
        updated_at: new Date().toISOString(),
      })
      .eq("id", participant.id)

    if (updateError) {
      log.error("Failed to update RSVP", { participantId: participant.id, error: updateError.message })
      throw new AppError("Erro ao atualizar resposta", 500)
    }

    log.info("Portal RSVP updated", {
      meetingId,
      participantId: participant.id,
      portalUserEmail: portalEmail,
      response,
    })

    // 5. Best-effort Google Calendar sync
    if (meeting.google_event_id) {
      propagateRSVPToGoogle(
        meeting.user_id,
        meeting.google_event_id,
        meeting.google_calendar_id,
        portalEmail,
        response as RSVPResponse
      ).catch((err) => {
        log.warn("Google RSVP propagation failed (best-effort)", {
          meetingId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    }

    return NextResponse.json(
      { success: true, response_status: response },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalMeetingRSVP")
  }
}

/**
 * Propagate RSVP to Google Calendar by updating attendee responseStatus
 * on the organizer's calendar event. Best-effort — errors are logged, not thrown.
 */
async function propagateRSVPToGoogle(
  organizerUserId: string,
  googleEventId: string,
  googleCalendarId: string | null,
  attendeeEmail: string,
  rsvpResponse: RSVPResponse
): Promise<void> {
  // Get organizer's access token
  let accessToken: string | null
  try {
    accessToken = await getValidAccessToken(organizerUserId, "profile")
  } catch {
    log.warn("Could not get organizer token for RSVP propagation", { organizerUserId })
    return
  }

  if (!accessToken) {
    log.warn("Organizer not connected to Google Calendar", { organizerUserId })
    return
  }

  const calendarService = new GoogleCalendarService({
    accessToken,
    calendarId: googleCalendarId || "primary",
  })

  // Fetch current event to get attendees list
  const event = await calendarService.getEvent(googleEventId)
  if (!event.attendees?.length) {
    log.warn("Google event has no attendees", { googleEventId })
    return
  }

  // Update the matching attendee's responseStatus
  const updatedAttendees = event.attendees.map((a) => {
    if (a.email?.toLowerCase() === attendeeEmail.toLowerCase()) {
      return { ...a, responseStatus: RSVP_TO_GOOGLE[rsvpResponse] as "accepted" | "declined" | "tentative" }
    }
    return a
  })

  await calendarService.updateEvent(
    googleEventId,
    { attendees: updatedAttendees },
    { sendUpdates: "none" }
  )

  log.info("RSVP propagated to Google Calendar", {
    googleEventId,
    attendeeEmail,
    rsvpResponse,
  })
}
