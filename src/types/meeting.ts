import type { Client } from "./client"
import type { User } from "./user"
import type { OrgMember } from "./organization"

// Meeting Types
export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show"
export type MeetingParticipantType = "profile" | "org_member"
export type MeetingResponseStatus = "pending" | "accepted" | "declined" | "tentative"
export type MeetingUrlSource = "manual" | "google_meet" | "external"
export type GoogleSyncStatus = "synced" | "pending" | "error" | "not_connected"
export type GoogleTokenUserType = "profile" | "portal_user"

export interface Meeting {
  id: string
  client_id: string
  user_id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  status: MeetingStatus
  meeting_url?: string
  notes?: string
  google_event_id?: string
  google_calendar_id?: string
  meeting_url_source?: MeetingUrlSource
  google_sync_status?: GoogleSyncStatus
  google_sync_error?: string
  timezone?: string
  created_at: string
  completion_notes?: string
  completed_at?: string
  completed_by?: string
  // Joined data
  participants?: MeetingParticipant[]
  client?: Client
  user?: User
}

export interface MeetingParticipant {
  id: string
  meeting_id: string
  participant_id: string
  participant_type: MeetingParticipantType
  is_organizer: boolean
  response_status: MeetingResponseStatus
  email?: string
  google_rsvp_status?: string
  notes?: string
  created_at: string
  updated_at: string
  // Joined data
  profile?: User
  org_member?: OrgMember
}

export interface UserGoogleToken {
  id: string
  user_type: GoogleTokenUserType
  user_id: string
  google_email: string
  google_account_id?: string
  access_token: string
  refresh_token: string
  token_type: string
  expires_at: string
  scopes: string[]
  is_active: boolean
  last_synced_at?: string
  sync_error?: string
  org_id: string
  selected_calendar_id?: string
  auto_meet?: boolean
  created_at: string
  updated_at: string
}

// Calendar Types
export type CalendarViewMode = "month" | "week" | "day"

export interface CalendarEvent {
  id: string
  title: string
  date: Date
  type: "task" | "meeting"
  status: string
  priority?: string
  assignee?: string
  client?: string
  meetingUrl?: string
  duration?: number
  original: Record<string, unknown>
}
