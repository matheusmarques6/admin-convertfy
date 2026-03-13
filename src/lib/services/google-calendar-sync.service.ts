/**
 * Google Calendar Sync Service
 *
 * Orchestrates synchronization between local meetings (Supabase) and Google Calendar.
 * - syncMeetingToGoogle: creates or updates a Google Calendar event from a local meeting
 * - updateGoogleEvent: updates an existing Google Calendar event
 * - deleteGoogleEvent: deletes a Google Calendar event
 *
 * Uses google-auth.service for token management (auto-refresh).
 * Uses createAdminClient() for all DB writes (service role bypasses RLS).
 * Errors are caught and stored in google_sync_status/google_sync_error — they do NOT
 * propagate to the caller (except GoogleTokenRevokedError which is re-thrown).
 */

import { GoogleCalendarService } from "@/lib/integrations/google-calendar"
import { GoogleCalendarEvent } from "@/lib/integrations/types"
import {
  getValidAccessToken,
  GoogleTokenRevokedError,
} from "@/lib/services/google-auth.service"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleCalendarSync")

const DEFAULT_TIMEZONE = "America/Sao_Paulo"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  synced: boolean
  reason?: "not_connected" | "error" | "success"
  google_event_id?: string
  meet_link?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MeetingRow {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  notes: string | null
  google_event_id: string | null
  google_calendar_id: string | null
  meeting_url: string | null
  meeting_url_source: string | null
  google_sync_status: string | null
  timezone: string | null
  user_id: string
  participants: Array<{
    id: string
    participant_id: string
    participant_type: string
    is_organizer: boolean
    email: string | null
  }>
}

/**
 * Fetch a meeting with its participants from the DB.
 */
async function fetchMeeting(meetingId: string): Promise<MeetingRow | null> {
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from("meetings")
    .select(
      `
      id, title, scheduled_at, duration_minutes, notes,
      google_event_id, google_calendar_id, meeting_url, meeting_url_source,
      google_sync_status, timezone, user_id,
      participants:meeting_participants(
        id, participant_id, participant_type, is_organizer, email
      )
    `
    )
    .eq("id", meetingId)
    .single()

  if (error || !data) {
    log.error("Meeting not found", { meetingId, error: error?.message })
    return null
  }

  return data as unknown as MeetingRow
}

/**
 * Resolve emails for all participants.
 * - org_member: org_members.user_id -> profiles.email
 * - profile: profiles.email directly
 * - If participant already has email, use it.
 *
 * Returns array of { email, displayName? } for Google attendees.
 * Also backfills email into meeting_participants if it was empty.
 */
async function resolveParticipantEmails(
  participants: MeetingRow["participants"]
): Promise<Array<{ email: string; displayName?: string }>> {
  const adminClient = createAdminClient()
  const attendees: Array<{ email: string; displayName?: string }> = []
  const emailUpdates: Array<{ participantRowId: string; email: string }> = []

  // Collect IDs by type
  const profileIds: string[] = []
  const orgMemberIds: string[] = []

  for (const p of participants) {
    if (p.email) continue // already has email
    if (p.participant_type === "profile") profileIds.push(p.participant_id)
    else if (p.participant_type === "org_member") orgMemberIds.push(p.participant_id)
  }

  // Batch-fetch profile emails
  const profileEmailMap = new Map<string, { email: string; name: string | null }>()

  if (profileIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, name")
      .in("id", profileIds)
    for (const p of profiles || []) {
      if (p.email) profileEmailMap.set(p.id, { email: p.email, name: p.name })
    }
  }

  // Batch-fetch org_member -> profile emails
  const orgMemberEmailMap = new Map<string, { email: string; name: string | null }>()

  if (orgMemberIds.length > 0) {
    const { data: orgMembers } = await adminClient
      .from("org_members")
      .select("id, user_id, profile:profiles!org_members_profile_id_fkey(email, name)")
      .in("id", orgMemberIds)

    for (const om of orgMembers || []) {
      const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
      if (prof?.email) {
        orgMemberEmailMap.set(om.id, {
          email: (prof as { email: string; name: string | null }).email,
          name: (prof as { email: string; name: string | null }).name,
        })
      }
    }
  }

  // Build attendees list
  for (const p of participants) {
    let email = p.email || null
    let displayName: string | null = null

    if (!email) {
      if (p.participant_type === "profile") {
        const resolved = profileEmailMap.get(p.participant_id)
        if (resolved) {
          email = resolved.email
          displayName = resolved.name
        }
      } else if (p.participant_type === "org_member") {
        const resolved = orgMemberEmailMap.get(p.participant_id)
        if (resolved) {
          email = resolved.email
          displayName = resolved.name
        }
      }
    }

    if (!email) {
      log.warn("Participant without email, skipping", {
        participantId: p.participant_id,
        participantType: p.participant_type,
      })
      continue
    }

    attendees.push({ email, ...(displayName ? { displayName } : {}) })

    // Backfill email into meeting_participants if it was empty
    if (!p.email && email) {
      emailUpdates.push({ participantRowId: p.id, email })
    }
  }

  // Backfill emails in DB (non-blocking, best effort)
  if (emailUpdates.length > 0) {
    for (const { participantRowId, email } of emailUpdates) {
      adminClient
        .from("meeting_participants")
        .update({ email })
        .eq("id", participantRowId)
        .then(({ error }) => {
          if (error) {
            log.warn("Failed to backfill participant email", {
              participantRowId,
              error: error.message,
            })
          }
        })
    }
  }

  return attendees
}

/**
 * Build a GoogleCalendarEvent from a meeting row.
 */
function buildGoogleEvent(
  meeting: MeetingRow,
  attendees: Array<{ email: string; displayName?: string }>
): Omit<GoogleCalendarEvent, "conferenceData"> {
  const tz = meeting.timezone || DEFAULT_TIMEZONE
  const startDate = new Date(meeting.scheduled_at)
  const endDate = new Date(startDate.getTime() + meeting.duration_minutes * 60_000)

  return {
    summary: meeting.title,
    description: meeting.notes || undefined,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: tz,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: tz,
    },
    attendees: attendees.map((a) => ({
      email: a.email,
      ...(a.displayName ? { displayName: a.displayName } : {}),
    })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 60 },
        { method: "popup", minutes: 15 },
      ],
    },
  }
}

/**
 * Update sync status in the meetings table.
 */
async function updateSyncStatus(
  meetingId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from("meetings")
    .update(fields)
    .eq("id", meetingId)

  if (error) {
    log.error("Failed to update sync status", { meetingId, error: error.message })
  }
}

// ---------------------------------------------------------------------------
// syncMeetingToGoogle
// ---------------------------------------------------------------------------

/**
 * Create or update a Google Calendar event for a meeting.
 *
 * - If organizer has no Google connection: marks not_connected and returns.
 * - If meeting already has google_event_id: updates the event.
 * - Otherwise: creates a new event with Meet link.
 */
export async function syncMeetingToGoogle(
  meetingId: string,
  organizerUserId: string
): Promise<SyncResult> {
  try {
    // 1. Fetch meeting
    const meeting = await fetchMeeting(meetingId)
    if (!meeting) {
      return { synced: false, reason: "error", error: "Meeting not found" }
    }

    // 2. Get valid access token and user preferences for the organizer
    let accessToken: string | null
    try {
      accessToken = await getValidAccessToken(organizerUserId, "profile")
    } catch (err) {
      if (err instanceof GoogleTokenRevokedError) {
        await updateSyncStatus(meetingId, {
          google_sync_status: "error",
          google_sync_error: err.message,
        })
        throw err // Re-throw revoked token errors
      }
      accessToken = null
    }

    if (!accessToken) {
      await updateSyncStatus(meetingId, {
        google_sync_status: "not_connected",
        google_sync_error: null,
      })
      return { synced: false, reason: "not_connected" }
    }

    // 2b. Read user preferences (selected_calendar_id, auto_meet)
    const adminClient = createAdminClient()
    const { data: tokenRecord } = await adminClient
      .from("user_google_tokens")
      .select("selected_calendar_id, auto_meet")
      .eq("user_type", "profile")
      .eq("user_id", organizerUserId)
      .single()

    const calendarId = tokenRecord?.selected_calendar_id || "primary"
    const autoMeet = tokenRecord?.auto_meet ?? true

    // 3. Create Google Calendar service with user's preferred calendar
    const calendarService = new GoogleCalendarService({ accessToken, calendarId })

    // 4. Resolve participant emails
    const attendees = await resolveParticipantEmails(meeting.participants || [])

    // 5. Build event
    const eventData = buildGoogleEvent(meeting, attendees)

    // 6. Create or update
    if (meeting.google_event_id) {
      // Update existing event
      const updated = await calendarService.updateEvent(
        meeting.google_event_id,
        eventData,
        { sendUpdates: "all" }
      )

      await updateSyncStatus(meetingId, {
        google_sync_status: "synced",
        google_sync_error: null,
        google_synced_at: new Date().toISOString(),
      })

      return {
        synced: true,
        reason: "success",
        google_event_id: updated.id,
      }
    }

    // Create new event — with or without Meet based on user preference
    if (autoMeet) {
      const result = await calendarService.createEventWithMeet(eventData)

      const meetLink =
        result.meetLink ||
        result.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video"
        )?.uri

      await updateSyncStatus(meetingId, {
        google_event_id: result.id,
        google_calendar_id: calendarId,
        meeting_url: meetLink || meeting.meeting_url,
        meeting_url_source: meetLink ? "google_meet" : meeting.meeting_url_source,
        google_sync_status: "synced",
        google_sync_error: null,
        google_synced_at: new Date().toISOString(),
      })

      return {
        synced: true,
        reason: "success",
        google_event_id: result.id,
        meet_link: meetLink || undefined,
      }
    }

    // Create without Meet
    const result = await calendarService.createEvent(eventData, { sendUpdates: "all" })

    await updateSyncStatus(meetingId, {
      google_event_id: result.id,
      google_calendar_id: calendarId,
      google_sync_status: "synced",
      google_sync_error: null,
      google_synced_at: new Date().toISOString(),
    })

    return {
      synced: true,
      reason: "success",
      google_event_id: result.id,
    }
  } catch (err) {
    // Re-throw token revoked errors
    if (err instanceof GoogleTokenRevokedError) throw err

    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error("syncMeetingToGoogle failed", { meetingId, error: errorMessage })

    await updateSyncStatus(meetingId, {
      google_sync_status: "error",
      google_sync_error: errorMessage,
    })

    return { synced: false, reason: "error", error: errorMessage }
  }
}

// ---------------------------------------------------------------------------
// updateGoogleEvent
// ---------------------------------------------------------------------------

/**
 * Update an existing Google Calendar event from updated meeting data.
 *
 * If meeting has no google_event_id, attempts to create (fallback for meetings
 * that failed on initial sync).
 */
export async function updateGoogleEvent(meetingId: string): Promise<SyncResult> {
  try {
    const meeting = await fetchMeeting(meetingId)
    if (!meeting) {
      return { synced: false, reason: "error", error: "Meeting not found" }
    }

    // If no google_event_id, try to create via syncMeetingToGoogle
    if (!meeting.google_event_id) {
      return syncMeetingToGoogle(meetingId, meeting.user_id)
    }

    // Get valid token for organizer
    let accessToken: string | null
    try {
      accessToken = await getValidAccessToken(meeting.user_id, "profile")
    } catch (err) {
      if (err instanceof GoogleTokenRevokedError) {
        await updateSyncStatus(meetingId, {
          google_sync_status: "error",
          google_sync_error: err.message,
        })
        throw err
      }
      accessToken = null
    }

    if (!accessToken) {
      await updateSyncStatus(meetingId, {
        google_sync_status: "not_connected",
        google_sync_error: null,
      })
      return { synced: false, reason: "not_connected" }
    }

    // Read user preferences (selected_calendar_id) — same pattern as syncMeetingToGoogle
    const adminClient = createAdminClient()
    const { data: tokenRecord } = await adminClient
      .from("user_google_tokens")
      .select("selected_calendar_id")
      .eq("user_type", "profile")
      .eq("user_id", meeting.user_id)
      .single()

    const calendarId = tokenRecord?.selected_calendar_id || meeting.google_calendar_id || "primary"

    const calendarService = new GoogleCalendarService({ accessToken, calendarId })
    const attendees = await resolveParticipantEmails(meeting.participants || [])
    const eventData = buildGoogleEvent(meeting, attendees)

    const updated = await calendarService.updateEvent(
      meeting.google_event_id,
      eventData,
      { sendUpdates: "all" }
    )

    await updateSyncStatus(meetingId, {
      google_sync_status: "synced",
      google_sync_error: null,
      google_synced_at: new Date().toISOString(),
    })

    return {
      synced: true,
      reason: "success",
      google_event_id: updated.id,
    }
  } catch (err) {
    if (err instanceof GoogleTokenRevokedError) throw err

    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error("updateGoogleEvent failed", { meetingId, error: errorMessage })

    await updateSyncStatus(meetingId, {
      google_sync_status: "error",
      google_sync_error: errorMessage,
    })

    return { synced: false, reason: "error", error: errorMessage }
  }
}

// ---------------------------------------------------------------------------
// deleteGoogleEvent
// ---------------------------------------------------------------------------

/**
 * Delete a Google Calendar event associated with a meeting.
 *
 * If meeting has no google_event_id, this is a noop.
 * Uses sendUpdates: "all" to notify participants.
 */
export async function deleteGoogleEvent(meetingId: string): Promise<SyncResult> {
  try {
    const meeting = await fetchMeeting(meetingId)
    if (!meeting) {
      return { synced: false, reason: "error", error: "Meeting not found" }
    }

    // No google event to delete
    if (!meeting.google_event_id) {
      return { synced: true, reason: "success" }
    }

    // Get valid token for organizer
    let accessToken: string | null
    try {
      accessToken = await getValidAccessToken(meeting.user_id, "profile")
    } catch (err) {
      if (err instanceof GoogleTokenRevokedError) {
        await updateSyncStatus(meetingId, {
          google_sync_status: "error",
          google_sync_error: err.message,
        })
        throw err
      }
      accessToken = null
    }

    if (!accessToken) {
      // Cannot delete from Google, but clean up local state
      await updateSyncStatus(meetingId, {
        google_event_id: null,
        google_calendar_id: null,
        google_sync_status: "not_connected",
        google_sync_error: null,
      })
      return { synced: false, reason: "not_connected" }
    }

    const calendarService = new GoogleCalendarService({ accessToken })

    await calendarService.deleteEvent(meeting.google_event_id, {
      sendUpdates: "all",
    })

    await updateSyncStatus(meetingId, {
      google_event_id: null,
      google_calendar_id: null,
      google_sync_status: "not_connected",
      google_sync_error: null,
    })

    return { synced: true, reason: "success" }
  } catch (err) {
    if (err instanceof GoogleTokenRevokedError) throw err

    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error("deleteGoogleEvent failed", { meetingId, error: errorMessage })

    await updateSyncStatus(meetingId, {
      google_sync_status: "error",
      google_sync_error: errorMessage,
    })

    return { synced: false, reason: "error", error: errorMessage }
  }
}

// ---------------------------------------------------------------------------
// syncParticipantStatus
// ---------------------------------------------------------------------------

/**
 * Sync RSVP status from Google Calendar attendees to local meeting_participants.
 *
 * Maps Google responseStatus -> meeting_participants.google_rsvp_status.
 */
export async function syncParticipantStatus(meetingId: string): Promise<void> {
  try {
    const meeting = await fetchMeeting(meetingId)
    if (!meeting?.google_event_id) return

    let accessToken: string | null
    try {
      accessToken = await getValidAccessToken(meeting.user_id, "profile")
    } catch {
      return // Silently skip if token issues
    }

    if (!accessToken) return

    const calendarService = new GoogleCalendarService({ accessToken })
    const googleEvent = await calendarService.getEvent(meeting.google_event_id)

    if (!googleEvent.attendees?.length) return

    const adminClient = createAdminClient()

    // Build email -> responseStatus map from Google
    const rsvpMap = new Map<string, string>()
    for (const attendee of googleEvent.attendees) {
      if (attendee.email && attendee.responseStatus) {
        rsvpMap.set(attendee.email.toLowerCase(), attendee.responseStatus)
      }
    }

    // Update each participant's google_rsvp_status
    for (const p of meeting.participants || []) {
      const email = p.email?.toLowerCase()
      if (!email) continue

      const rsvpStatus = rsvpMap.get(email)
      if (!rsvpStatus) continue

      const { error } = await adminClient
        .from("meeting_participants")
        .update({ google_rsvp_status: rsvpStatus })
        .eq("id", p.id)

      if (error) {
        log.warn("Failed to update RSVP status", {
          participantId: p.id,
          error: error.message,
        })
      }
    }
  } catch (err) {
    log.error("syncParticipantStatus failed", {
      meetingId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ---------------------------------------------------------------------------
// syncRsvpFromGoogle — Bulk RSVP sync for all meetings of an organizer
// ---------------------------------------------------------------------------

/**
 * Google RSVP responseStatus -> local google_rsvp_status mapping.
 *
 * AC 42.11.4
 */
function mapGoogleRsvp(
  responseStatus: string | undefined
): string {
  switch (responseStatus) {
    case "accepted":
      return "accepted"
    case "declined":
      return "declined"
    case "tentative":
      return "tentative"
    case "needsAction":
      return "pending"
    default:
      return "pending"
  }
}

export interface RsvpSyncDetail {
  meeting_id: string
  meeting_title: string
  status: "synced" | "error" | "skipped"
  updated_count: number
  error?: string
}

export interface RsvpSyncReport {
  synced_count: number
  errors_count: number
  details: RsvpSyncDetail[]
}

/**
 * Sync RSVP status from Google Calendar for all active meetings
 * where the given user is the organizer.
 *
 * AC 42.11.1: Fetches scheduled meetings with google_event_id, queries Google,
 *             extracts attendees[].responseStatus.
 * AC 42.11.3: Updates meeting_participants.google_rsvp_status, case-insensitive
 *             email match, only writes if value changed.
 * AC 42.11.5: Updates user_google_tokens.last_synced_at on success.
 * AC 42.11.6: Errors per-meeting are isolated; token revocation stops sync.
 * AC 42.11.7: 404 from Google marks google_sync_status = 'error'.
 */
export async function syncRsvpFromGoogle(
  organizerUserId: string
): Promise<RsvpSyncReport> {
  const report: RsvpSyncReport = {
    synced_count: 0,
    errors_count: 0,
    details: [],
  }

  // 1. Get valid access token
  let accessToken: string | null
  try {
    accessToken = await getValidAccessToken(organizerUserId, "profile")
  } catch (err) {
    if (err instanceof GoogleTokenRevokedError) {
      // AC 42.11.6: token expired and refresh failed — mark inactive (already done
      // inside getValidAccessToken) and stop sync
      log.warn("syncRsvpFromGoogle: token revoked, stopping", {
        userId: organizerUserId,
      })
      return report
    }
    accessToken = null
  }

  if (!accessToken) {
    log.info("syncRsvpFromGoogle: no valid token, skipping", {
      userId: organizerUserId,
    })
    return report
  }

  const adminClient = createAdminClient()

  // 2. Fetch active meetings with google_event_id for this organizer
  // AC 42.11.1: status = 'scheduled', scheduled_at > now, google_event_id NOT NULL
  const { data: meetings, error: meetingsError } = await adminClient
    .from("meetings")
    .select("id, title, google_event_id, google_calendar_id")
    .eq("user_id", organizerUserId)
    .eq("status", "scheduled")
    .gt("scheduled_at", new Date().toISOString())
    .not("google_event_id", "is", null)

  if (meetingsError) {
    log.error("syncRsvpFromGoogle: failed to fetch meetings", {
      userId: organizerUserId,
      error: meetingsError.message,
    })
    return report
  }

  if (!meetings || meetings.length === 0) {
    log.info("syncRsvpFromGoogle: no meetings to sync", {
      userId: organizerUserId,
    })
    return report
  }

  // 3. Iterate meetings and sync RSVP
  for (const meeting of meetings) {
    const detail: RsvpSyncDetail = {
      meeting_id: meeting.id,
      meeting_title: meeting.title,
      status: "skipped",
      updated_count: 0,
    }

    try {
      // Use the meeting's calendar ID if available, otherwise primary
      const calendarId = meeting.google_calendar_id || "primary"
      const calendarService = new GoogleCalendarService({
        accessToken,
        calendarId,
      })

      let googleEvent: Awaited<ReturnType<typeof calendarService.getEvent>>
      try {
        googleEvent = await calendarService.getEvent(meeting.google_event_id!)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)

        // AC 42.11.7: event deleted on Google (404)
        if (errMsg.includes("404")) {
          await updateSyncStatus(meeting.id, {
            google_sync_status: "error",
            google_sync_error: "Evento deletado no Google Calendar",
          })
          detail.status = "error"
          detail.error = "Evento deletado no Google Calendar"
          report.errors_count++
          report.details.push(detail)
          continue
        }

        // Other getEvent error — log and continue
        detail.status = "error"
        detail.error = errMsg
        report.errors_count++
        report.details.push(detail)
        log.warn("syncRsvpFromGoogle: getEvent failed", {
          meetingId: meeting.id,
          error: errMsg,
        })
        continue
      }

      const googleAttendees = googleEvent.attendees || []
      if (googleAttendees.length === 0) {
        detail.status = "synced"
        report.synced_count++
        report.details.push(detail)
        continue
      }

      // Build email -> responseStatus map from Google
      const rsvpMap = new Map<string, string>()
      for (const attendee of googleAttendees) {
        if (attendee.email && attendee.responseStatus) {
          rsvpMap.set(attendee.email.toLowerCase(), attendee.responseStatus)
        }
      }

      // Fetch local participants for this meeting
      const { data: participants } = await adminClient
        .from("meeting_participants")
        .select("id, email, participant_id, participant_type, google_rsvp_status")
        .eq("meeting_id", meeting.id)

      // Resolve emails for participants that don't have one
      // (fallback: lookup profile email by participant_id)
      const participantsWithEmail = await resolveParticipantEmailsForRsvp(
        adminClient,
        participants || []
      )

      // AC 42.11.3: Update each participant's google_rsvp_status
      for (const p of participantsWithEmail) {
        if (!p.resolvedEmail) continue

        const googleStatus = rsvpMap.get(p.resolvedEmail.toLowerCase())
        if (!googleStatus) continue

        const mappedStatus = mapGoogleRsvp(googleStatus)

        // Only update if value changed (avoid unnecessary writes)
        if (p.google_rsvp_status === mappedStatus) continue

        const { error: updateError } = await adminClient
          .from("meeting_participants")
          .update({ google_rsvp_status: mappedStatus })
          .eq("id", p.id)

        if (updateError) {
          log.warn("syncRsvpFromGoogle: failed to update participant RSVP", {
            participantId: p.id,
            error: updateError.message,
          })
        } else {
          detail.updated_count++
        }
      }

      detail.status = "synced"
      report.synced_count++
      report.details.push(detail)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      detail.status = "error"
      detail.error = errMsg
      report.errors_count++
      report.details.push(detail)
      log.error("syncRsvpFromGoogle: unexpected error for meeting", {
        meetingId: meeting.id,
        error: errMsg,
      })
    }
  }

  // 4. AC 42.11.5: Update last_synced_at on user_google_tokens
  const { error: tokenUpdateError } = await adminClient
    .from("user_google_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_type", "profile")
    .eq("user_id", organizerUserId)

  if (tokenUpdateError) {
    log.warn("syncRsvpFromGoogle: failed to update last_synced_at", {
      userId: organizerUserId,
      error: tokenUpdateError.message,
    })
  }

  log.info("syncRsvpFromGoogle complete", {
    userId: organizerUserId,
    synced: report.synced_count,
    errors: report.errors_count,
    totalMeetings: meetings.length,
  })

  return report
}

// ---------------------------------------------------------------------------
// Internal helper: resolve emails for RSVP matching
// ---------------------------------------------------------------------------

interface ParticipantForRsvp {
  id: string
  email: string | null
  participant_id: string
  participant_type: string
  google_rsvp_status: string | null
  resolvedEmail: string | null
}

/**
 * For each participant, resolve the email (from participant row or from profile).
 * Used by syncRsvpFromGoogle to match Google attendees by email.
 */
async function resolveParticipantEmailsForRsvp(
  adminClient: ReturnType<typeof createAdminClient>,
  participants: Array<{
    id: string
    email: string | null
    participant_id: string
    participant_type: string
    google_rsvp_status: string | null
  }>
): Promise<ParticipantForRsvp[]> {
  const result: ParticipantForRsvp[] = []

  // Collect participant IDs that need email resolution
  const profileIdsToResolve: string[] = []
  const orgMemberIdsToResolve: string[] = []

  for (const p of participants) {
    if (p.email) {
      result.push({ ...p, resolvedEmail: p.email })
    } else {
      result.push({ ...p, resolvedEmail: null })
      if (p.participant_type === "profile") profileIdsToResolve.push(p.participant_id)
      else if (p.participant_type === "org_member") orgMemberIdsToResolve.push(p.participant_id)
    }
  }

  // Batch-fetch profile emails
  const emailMap = new Map<string, string>()

  if (profileIdsToResolve.length > 0) {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email")
      .in("id", profileIdsToResolve)
    for (const prof of profiles || []) {
      if (prof.email) emailMap.set(`profile:${prof.id}`, prof.email)
    }
  }

  if (orgMemberIdsToResolve.length > 0) {
    const { data: orgMembers } = await adminClient
      .from("org_members")
      .select("id, profile:profiles!org_members_profile_id_fkey(email)")
      .in("id", orgMemberIdsToResolve)
    for (const om of orgMembers || []) {
      const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
      if (prof?.email) {
        emailMap.set(`org_member:${om.id}`, (prof as { email: string }).email)
      }
    }
  }

  // Fill resolved emails
  for (const p of result) {
    if (!p.resolvedEmail) {
      const key = `${p.participant_type}:${p.participant_id}`
      p.resolvedEmail = emailMap.get(key) || null
      if (!p.resolvedEmail) {
        log.warn("syncRsvpFromGoogle: participant without email, skipping RSVP match", {
          participantId: p.participant_id,
          participantType: p.participant_type,
        })
      }
    }
  }

  return result
}
