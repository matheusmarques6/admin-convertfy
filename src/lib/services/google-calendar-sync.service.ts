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
  type GoogleUserType,
} from "@/lib/services/google-auth.service"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { randomUUID } from "crypto"

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
  org_id: string | null
  client_id: string | null
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
      google_sync_status, timezone, user_id, org_id, client_id,
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
    // Tag de origem: permite ao import bidirecional reconhecer eventos que
    // NOS criamos (atualiza a meeting existente em vez de duplicar).
    extendedProperties: {
      private: { convertfyMeetingId: meeting.id },
    },
  }
}

/**
 * Decide em qual conta Google o evento da reuniao deve viver.
 *
 * - Reuniao de CLIENTE (tem client_id) -> conta central da org ("convertfy"),
 *   se estiver conectada. Assim a agenda central concentra todas as reunioes
 *   de clientes e cada convocado (attendee) a ve na propria agenda pessoal.
 * - Se a conta central nao estiver conectada/ativa -> cai na agenda pessoal
 *   do organizador (fallback suave).
 * - Reuniao sem client_id (pessoal/importada) -> agenda pessoal.
 */
async function resolveSyncAccount(
  meeting: MeetingRow,
  fallbackUserId: string
): Promise<{ userId: string; userType: GoogleUserType }> {
  if (meeting.client_id && meeting.org_id) {
    try {
      const orgToken = await getValidAccessToken(meeting.org_id, "org")
      if (orgToken) {
        return { userId: meeting.org_id, userType: "org" }
      }
    } catch (err) {
      // Conta central revogada -> fallback pra pessoal (nao derruba o sync)
      if (!(err instanceof GoogleTokenRevokedError)) throw err
      log.warn("Org calendar revoked, falling back to personal", {
        meetingId: meeting.id,
        orgId: meeting.org_id,
      })
    }
  }
  return { userId: fallbackUserId, userType: "profile" }
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

    // 2. Reunião de cliente vai pra conta central (convertfy); senão, pessoal
    const account = await resolveSyncAccount(meeting, organizerUserId)

    // Get valid access token for the resolved account
    let accessToken: string | null
    try {
      accessToken = await getValidAccessToken(account.userId, account.userType)
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

    // 2b. Read account preferences (selected_calendar_id, auto_meet)
    const adminClient = createAdminClient()
    const { data: tokenRecord } = await adminClient
      .from("user_google_tokens")
      .select("selected_calendar_id, auto_meet")
      .eq("user_type", account.userType)
      .eq("user_id", account.userId)
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
      try {
        // Update existing event
        const updated = await calendarService.updateEvent(
          meeting.google_event_id,
          eventData,
          { sendUpdates: "all" }
        )

        await updateSyncStatus(meetingId, {
          google_calendar_id: calendarId,
          google_sync_status: "synced",
          google_sync_error: null,
          google_synced_at: new Date().toISOString(),
        })

        return {
          synced: true,
          reason: "success",
          google_event_id: updated.id,
        }
      } catch (updateErr) {
        // Se o evento nao existe na conta resolvida (ex: reuniao antiga estava
        // na agenda pessoal e agora roteia pra central), recria; erros de outro
        // tipo sobem para o catch externo (nao duplica).
        const msg = updateErr instanceof Error ? updateErr.message : String(updateErr)
        const notFound = /404|not\s*found|notFound/i.test(msg)
        if (!notFound) throw updateErr
        log.warn("Event missing on resolved account, recreating", { meetingId, error: msg })
        // continua para o fluxo de criacao abaixo
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
 * Delega a syncMeetingToGoogle, que ja resolve a conta correta (central da
 * org p/ reuniao de cliente, ou pessoal), cria quando nao ha evento e
 * recria quando o evento sumiu da conta resolvida.
 */
export async function updateGoogleEvent(meetingId: string): Promise<SyncResult> {
  const meeting = await fetchMeeting(meetingId)
  if (!meeting) {
    return { synced: false, reason: "error", error: "Meeting not found" }
  }
  return syncMeetingToGoogle(meetingId, meeting.user_id)
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

    // Deleta na mesma conta que hospeda o evento (central p/ reuniao de cliente)
    const account = await resolveSyncAccount(meeting, meeting.user_id)

    let accessToken: string | null
    try {
      accessToken = await getValidAccessToken(account.userId, account.userType)
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

    const calendarId = meeting.google_calendar_id || "primary"
    const calendarService = new GoogleCalendarService({ accessToken, calendarId })

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

// ---------------------------------------------------------------------------
// Import bidirecional: Google (agenda central "convertfy") -> admin
// ---------------------------------------------------------------------------

type GoogleSyncEvent = GoogleCalendarEvent & {
  id: string
  organizer?: { email?: string }
  hangoutLink?: string
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted"
  }>
}

interface ImportContext {
  orgId: string
  calendarId: string
  emailToProfileId: Map<string, string>
  fallbackOrganizerId: string | null
}

/** Campos da meeting derivados de um evento do Google. */
function eventToMeetingPatch(ev: GoogleSyncEvent): Record<string, unknown> {
  const startIso = ev.start?.dateTime
  const patch: Record<string, unknown> = {}
  if (ev.summary) patch.title = ev.summary
  if (startIso) {
    patch.scheduled_at = new Date(startIso).toISOString()
    if (ev.end?.dateTime) {
      const mins = Math.round(
        (new Date(ev.end.dateTime).getTime() - new Date(startIso).getTime()) / 60000
      )
      if (mins > 0) patch.duration_minutes = mins
    }
    if (ev.start?.timeZone) patch.timezone = ev.start.timeZone
  }
  return patch
}

function localResponseStatus(
  s?: "needsAction" | "declined" | "tentative" | "accepted"
): "pending" | "accepted" | "declined" | "tentative" {
  if (s === "accepted" || s === "declined" || s === "tentative") return s
  return "pending"
}

/**
 * Aplica um evento do Google na base local.
 * - Evento com tag convertfyMeetingId -> atualiza a meeting existente (reverse).
 * - Evento ja importado (match por google_event_id) -> atualiza.
 * - Evento novo criado no Google -> cria meeting sem cliente (source=google).
 */
async function applyGoogleEvent(
  ctx: ImportContext,
  ev: GoogleSyncEvent
): Promise<"imported" | "updated" | "skipped"> {
  const adminClient = createAdminClient()
  const isCancelled = ev.status === "cancelled"
  const convId = ev.extendedProperties?.private?.convertfyMeetingId

  // 1) Evento que NOS criamos (tem a tag): reverse update / cancelamento
  if (convId) {
    const { data: m } = await adminClient
      .from("meetings")
      .select("id, google_synced_at")
      .eq("id", convId)
      .maybeSingle()
    if (!m) return "skipped"

    if (isCancelled) {
      await adminClient.from("meetings").update({ status: "cancelled" }).eq("id", convId)
      return "updated"
    }

    // So aplica se o Google for mais novo que nosso ultimo push (anti-eco)
    const gUpdated = ev.updated ? new Date(ev.updated).getTime() : 0
    const synced = m.google_synced_at ? new Date(m.google_synced_at as string).getTime() : 0
    if (gUpdated <= synced + 2000) return "skipped"

    await adminClient
      .from("meetings")
      .update({ ...eventToMeetingPatch(ev), google_synced_at: new Date().toISOString() })
      .eq("id", convId)
    return "updated"
  }

  // 2) Evento criado no Google e ja importado antes (match por google_event_id)
  const { data: existing } = await adminClient
    .from("meetings")
    .select("id")
    .eq("google_event_id", ev.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (existing) {
    if (isCancelled) {
      await adminClient.from("meetings").update({ status: "cancelled" }).eq("id", existing.id)
      return "updated"
    }
    await adminClient
      .from("meetings")
      .update({ ...eventToMeetingPatch(ev), google_synced_at: new Date().toISOString() })
      .eq("id", existing.id)
    return "updated"
  }

  // 3) Evento novo criado direto no Google -> importa como reuniao sem cliente
  if (isCancelled) return "skipped"
  if (!ev.start?.dateTime) return "skipped" // ignora all-day / sem horario

  // user_id (organizador local) e NOT NULL: casa email do organizer/attendee
  // com um profile da org; senao usa um admin/owner de fallback.
  const candidateEmails = [
    ev.organizer?.email,
    ...(ev.attendees?.map((a) => a.email) || []),
  ].filter(Boolean) as string[]
  let organizerId: string | null = null
  for (const email of candidateEmails) {
    const pid = ctx.emailToProfileId.get(email.toLowerCase())
    if (pid) { organizerId = pid; break }
  }
  organizerId = organizerId || ctx.fallbackOrganizerId
  if (!organizerId) return "skipped" // sem ninguem da org p/ ancorar

  const patch = eventToMeetingPatch(ev)
  const meetLink = ev.hangoutLink || undefined

  const { data: inserted, error: insErr } = await adminClient
    .from("meetings")
    .insert({
      org_id: ctx.orgId,
      client_id: null,
      user_id: organizerId,
      title: (patch.title as string) || "(sem titulo)",
      scheduled_at: patch.scheduled_at,
      duration_minutes: (patch.duration_minutes as number) || 30,
      timezone: (patch.timezone as string) || DEFAULT_TIMEZONE,
      status: "scheduled",
      source: "google",
      google_event_id: ev.id,
      google_calendar_id: ctx.calendarId,
      google_sync_status: "synced",
      google_synced_at: new Date().toISOString(),
      meeting_url: meetLink || null,
      meeting_url_source: meetLink ? "google_meet" : "manual",
    })
    .select("id")
    .single()

  if (insErr || !inserted) {
    log.error("Failed to import Google event", { eventId: ev.id, error: insErr?.message })
    return "skipped"
  }

  // Vincula attendees que sao membros da org como participantes (aparecem
  // no workspace "Geral" de cada um). Organizador entra como is_organizer.
  const participantRows: Array<Record<string, unknown>> = [
    {
      meeting_id: inserted.id,
      participant_id: organizerId,
      participant_type: "profile",
      is_organizer: true,
      response_status: "accepted",
    },
  ]
  for (const att of ev.attendees || []) {
    const pid = ctx.emailToProfileId.get(att.email.toLowerCase())
    if (!pid || pid === organizerId) continue
    participantRows.push({
      meeting_id: inserted.id,
      participant_id: pid,
      participant_type: "profile",
      is_organizer: false,
      email: att.email,
      response_status: localResponseStatus(att.responseStatus),
    })
  }
  if (participantRows.length > 0) {
    await adminClient
      .from("meeting_participants")
      .upsert(participantRows, { onConflict: "meeting_id,participant_id,participant_type" })
  }

  return "imported"
}

/**
 * Importa/atualiza reunioes da agenda central da convertfy (conta org) para o
 * admin. Usa syncToken incremental (armazenado em user_google_tokens) e
 * refaz full sync se o token vencer (410).
 */
export async function importMeetingsFromGoogle(
  orgId: string
): Promise<{ imported: number; updated: number }> {
  const adminClient = createAdminClient()

  let accessToken: string | null
  try {
    accessToken = await getValidAccessToken(orgId, "org")
  } catch (err) {
    if (err instanceof GoogleTokenRevokedError) return { imported: 0, updated: 0 }
    throw err
  }
  if (!accessToken) return { imported: 0, updated: 0 }

  const { data: tokenRow } = await adminClient
    .from("user_google_tokens")
    .select("calendar_sync_token, selected_calendar_id")
    .eq("user_type", "org")
    .eq("user_id", orgId)
    .single()

  const calendarId = tokenRow?.selected_calendar_id || "primary"
  const service = new GoogleCalendarService({ accessToken, calendarId })

  // Mapa email -> profile_id dos membros da org (p/ ancorar organizador e
  // vincular participantes de eventos importados)
  const emailToProfileId = new Map<string, string>()
  let fallbackOrganizerId: string | null = null
  const { data: members } = await adminClient
    .from("org_members")
    .select("role, profile:profiles!org_members_profile_id_fkey(id, email)")
    .eq("org_id", orgId)
  for (const m of members || []) {
    const prof = Array.isArray(m.profile) ? m.profile[0] : m.profile
    if (prof?.email) emailToProfileId.set(prof.email.toLowerCase(), prof.id)
    if (!fallbackOrganizerId && ["admin", "owner", "coo"].includes(m.role) && prof?.id) {
      fallbackOrganizerId = prof.id
    }
  }
  if (!fallbackOrganizerId) {
    const first = (members || [])[0]
    const prof = first ? (Array.isArray(first.profile) ? first.profile[0] : first.profile) : null
    fallbackOrganizerId = prof?.id || null
  }

  const ctx: ImportContext = { orgId, calendarId, emailToProfileId, fallbackOrganizerId }

  let syncToken: string | undefined = tokenRow?.calendar_sync_token || undefined
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  let imported = 0
  let updated = 0

  // Loop de paginas (limitado p/ nao rodar infinito)
  for (let i = 0; i < 25; i++) {
    const res = await service.listEventsForSync({
      syncToken,
      pageToken,
      maxResults: 250,
      timeMin: syncToken ? undefined : new Date(Date.now() - 7 * 86_400_000).toISOString(),
      timeMax: syncToken ? undefined : new Date(Date.now() + 90 * 86_400_000).toISOString(),
    })

    if (res.expired) {
      // syncToken vencido -> recomeca full sync
      syncToken = undefined
      pageToken = undefined
      continue
    }

    for (const ev of res.items as GoogleSyncEvent[]) {
      try {
        const r = await applyGoogleEvent(ctx, ev)
        if (r === "imported") imported++
        else if (r === "updated") updated++
      } catch (err) {
        log.error("applyGoogleEvent failed", {
          eventId: ev.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (res.nextPageToken) {
      pageToken = res.nextPageToken
      continue
    }
    nextSyncToken = res.nextSyncToken
    break
  }

  if (nextSyncToken) {
    await adminClient
      .from("user_google_tokens")
      .update({ calendar_sync_token: nextSyncToken, last_synced_at: new Date().toISOString() })
      .eq("user_type", "org")
      .eq("user_id", orgId)
  }

  return { imported, updated }
}

// ---------------------------------------------------------------------------
// Push notifications (watch) — import Google -> admin em tempo real
// ---------------------------------------------------------------------------

const WATCH_TTL_SECONDS = 7 * 24 * 3600 // 7 dias

/**
 * Registra (ou re-registra) um canal de push na agenda central da org, para
 * que o Google avise nosso webhook a cada mudanca. Retorna true se registrou.
 *
 * Requer NEXT_PUBLIC_APP_URL publico com HTTPS e dominio verificado no Google
 * (senao o Google recusa o webhook). Em caso de falha, o cron horario segue
 * como rede de seguranca.
 */
export async function startCalendarWatch(orgId: string): Promise<boolean> {
  const adminClient = createAdminClient()

  let accessToken: string | null
  try {
    accessToken = await getValidAccessToken(orgId, "org")
  } catch {
    return false
  }
  if (!accessToken) return false

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    log.warn("NEXT_PUBLIC_APP_URL ausente — nao da pra registrar watch")
    return false
  }

  const { data: tokenRow } = await adminClient
    .from("user_google_tokens")
    .select("selected_calendar_id, calendar_channel_id, calendar_resource_id")
    .eq("user_type", "org")
    .eq("user_id", orgId)
    .single()

  const calendarId = tokenRow?.selected_calendar_id || "primary"
  const service = new GoogleCalendarService({ accessToken, calendarId })

  // Encerra canal anterior (best effort) para nao acumular
  if (tokenRow?.calendar_channel_id && tokenRow?.calendar_resource_id) {
    try {
      await service.stopChannel(tokenRow.calendar_channel_id, tokenRow.calendar_resource_id)
    } catch {
      /* ignora */
    }
  }

  const channelId = randomUUID()
  const token = randomUUID()
  const address = `${appUrl.replace(/\/$/, "")}/api/webhooks/google-calendar`

  try {
    const res = await service.watchEvents({
      channelId,
      address,
      token,
      ttlSeconds: WATCH_TTL_SECONDS,
    })
    await adminClient
      .from("user_google_tokens")
      .update({
        calendar_channel_id: channelId,
        calendar_resource_id: res.resourceId,
        calendar_channel_token: token,
        calendar_channel_expiration: res.expiration
          ? new Date(Number(res.expiration)).toISOString()
          : null,
      })
      .eq("user_type", "org")
      .eq("user_id", orgId)
    log.info("Calendar watch registered", { orgId, channelId })
    return true
  } catch (err) {
    log.error("Failed to register calendar watch", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/** Encerra o watch da org (ao desconectar a conta central). */
export async function stopCalendarWatch(orgId: string): Promise<void> {
  const adminClient = createAdminClient()
  let accessToken: string | null
  try {
    accessToken = await getValidAccessToken(orgId, "org")
  } catch {
    return
  }
  if (!accessToken) return

  const { data: tokenRow } = await adminClient
    .from("user_google_tokens")
    .select("calendar_channel_id, calendar_resource_id")
    .eq("user_type", "org")
    .eq("user_id", orgId)
    .single()

  if (tokenRow?.calendar_channel_id && tokenRow?.calendar_resource_id) {
    const service = new GoogleCalendarService({ accessToken })
    try {
      await service.stopChannel(tokenRow.calendar_channel_id, tokenRow.calendar_resource_id)
    } catch {
      /* ignora */
    }
  }
  await adminClient
    .from("user_google_tokens")
    .update({
      calendar_channel_id: null,
      calendar_resource_id: null,
      calendar_channel_token: null,
      calendar_channel_expiration: null,
    })
    .eq("user_type", "org")
    .eq("user_id", orgId)
}

/**
 * Renova watches que estao sem canal ou perto de expirar (< 24h). Chamado
 * pelo cron. Retorna quantos foram (re)registrados.
 */
export async function renewExpiringWatches(): Promise<number> {
  const adminClient = createAdminClient()
  const cutoff = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

  const { data: rows } = await adminClient
    .from("user_google_tokens")
    .select("user_id, calendar_channel_expiration, calendar_channel_id")
    .eq("user_type", "org")
    .eq("is_active", true)

  let renewed = 0
  for (const row of rows || []) {
    const expired =
      !row.calendar_channel_id ||
      !row.calendar_channel_expiration ||
      row.calendar_channel_expiration < cutoff
    if (!expired) continue
    const ok = await startCalendarWatch(row.user_id)
    if (ok) renewed++
  }
  return renewed
}
