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

/**
 * Row shape returned by the `get_portal_campaigns_with_metrics` RPC.
 * Field names and types match the RETURNS TABLE definition in
 * `supabase/migrations/20260315_fix_campaign_rpc_null_rates.sql`.
 */
export interface PortalCampaignRpcRow {
  id: string
  store_id: string | null
  store_name: string | null
  name: string
  klaviyo_campaign_id: string | null
  description: string | null
  status: string
  /** The RPC returns both `channel` and `campaign_type` as separate columns. */
  channel: string | null
  campaign_type: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  send_datetime: string | null
  subject_line: string | null
  segment_name: string | null
  estimated_recipients: number | null
  color: string | null
  recipients: number | null
  delivered: number | null
  opened: number | null
  clicked: number | null
  converted: number | null
  revenue: number | null
  open_rate: number | null
  click_rate: number | null
  bounce_rate: number | null
  conversion_rate: number | null
  delivery_rate: number | null
  click_to_open_rate: number | null
  revenue_per_recipient: number | null
  average_order_value: number | null
  bounced: number | null
  unsubscribed: number | null
  unsubscribe_rate: number | null
  has_klaviyo_metrics: boolean | null
  metrics_fetched_at: string | null
}

/**
 * Raw campaign shape returned by the portal campaigns API (snake_case).
 * Used by the portal calendar hook and page to type the SWR response
 * before transforming into the camelCase `PortalCampaign` display type.
 */
export interface PortalCampaignApiResponse {
  id: string
  name: string
  description?: string | null
  campaign_type: string
  /**
   * Mapped from the RPC `channel` column (the API transforms
   * `campaign_type` from the RPC into this `channel` field for display).
   */
  channel?: string
  scheduled_at?: string
  scheduled_date?: string
  scheduled_time?: string
  status: string
  subject_line?: string | null
  segment_name?: string | null
  estimated_recipients?: number | null
  recipients?: number | null
  delivered?: number | null
  opened?: number | null
  clicked?: number | null
  converted?: number | null
  revenue?: number | null
  open_rate?: number | null
  click_rate?: number | null
  bounce_rate?: number | null
  conversion_rate?: number | null
  revenue_per_recipient?: number | null
  average_order_value?: number | null
  has_klaviyo_metrics?: boolean | null
  metrics_fetched_at?: string | null
  currency?: string | null
  color?: string | null
  created_at?: string | null
  store_ids?: string[]
  store_names?: string[]
  stores_count?: number
  source?: string
}
