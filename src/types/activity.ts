// Activity Types
export type ActivityType =
  | "client_created"
  | "client_updated"
  | "status_changed"
  | "meeting_scheduled"
  | "meeting_completed"
  | "payment_received"
  | "payment_overdue"
  | "report_uploaded"
  | "note_added"
  | "email_sent"
  | "whatsapp_sent"
  | "deal_created"
  | "deal_updated"
  | "deal_won"
  | "deal_lost"

export interface Activity {
  id: string
  client_id?: string
  deal_id?: string
  user_id: string
  type: ActivityType
  description: string
  metadata?: Record<string, unknown>
  created_at: string
}
