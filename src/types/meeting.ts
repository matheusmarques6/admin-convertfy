import type { Client } from "./client"
import type { User } from "./user"
import type { OrgMember } from "./organization"

// Meeting Types
export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show"
export type MeetingParticipantType = "profile" | "org_member"
export type MeetingResponseStatus = "pending" | "accepted" | "declined" | "tentative"

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
  notes?: string
  created_at: string
  updated_at: string
  // Joined data
  profile?: User
  org_member?: OrgMember
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
