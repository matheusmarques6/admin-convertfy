import type { ClientStore, Client } from "./client"
import type { User } from "./user"

// Campaign Types
export type CampaignStatus = "draft" | "pending_review" | "approved" | "rejected" | "scheduled" | "sent" | "cancelled"
export type CampaignChannel = "email" | "sms" | "push" | "whatsapp"
export type CampaignType = "promotional" | "newsletter" | "transactional" | "automation" | "seasonal" | "launch" | "other"
export type CampaignSource = "manual" | "klaviyo" | "batch"

export interface Campaign {
  id: string
  store_id: string
  client_id: string
  name: string
  description?: string
  scheduled_date: string // YYYY-MM-DD
  scheduled_time?: string // HH:MM
  send_datetime?: string
  channel: CampaignChannel
  campaign_type: CampaignType
  status: CampaignStatus
  subject_line?: string
  preview_text?: string
  template_id?: string
  segment_id?: string
  segment_name?: string
  estimated_recipients?: number
  recipients?: number
  delivered?: number
  opened?: number
  clicked?: number
  converted?: number
  revenue?: number
  currency?: string
  klaviyo_campaign_id?: string
  external_id?: string
  tags: string[]
  color: string
  notes?: string
  created_by?: string
  source?: CampaignSource
  store_names?: string[]
  // Approval workflow fields
  submitted_by?: string
  submitted_at?: string
  reviewed_by?: string
  reviewed_at?: string
  rejection_reason?: string
  approval_notes?: string
  // Timestamps
  created_at: string
  updated_at: string
  // Joined data
  store?: ClientStore
  client?: Client
  submitter?: User
  reviewer?: User
}

export interface CampaignHistory {
  id: string
  campaign_id: string
  from_status?: CampaignStatus
  to_status: CampaignStatus
  changed_by?: string
  reason?: string
  notes?: string
  metadata?: Record<string, unknown>
  created_at: string
  // Joined
  changer?: User
}

export interface CampaignFormData {
  store_id: string
  client_id: string
  name: string
  description?: string
  scheduled_date: string
  scheduled_time?: string
  channel: CampaignChannel
  campaign_type: CampaignType
  status: CampaignStatus
  subject_line?: string
  preview_text?: string
  segment_name?: string
  estimated_recipients?: number
  tags?: string[]
  color?: string
  notes?: string
}

export interface CalendarCampaign {
  id: string
  name: string
  scheduled_date: string
  scheduled_time?: string
  channel: CampaignChannel
  campaign_type: CampaignType
  status: CampaignStatus
  color: string
  store_id: string
  store_name: string
  client_name: string
}
