// User Types
export type UserRole = "admin" | "manager" | "sdr" | "closer" | "cs" | "financial"

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  role: UserRole
  created_at: string
  updated_at: string
}

// Client Types
export type ClientStatus = "active" | "inactive" | "churned" | "prospect" | "onboarding"

export interface Client {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  website?: string
  cpf_cnpj?: string
  asaas_customer_id?: string
  address?: {
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    postal_code?: string
    city?: string
    state?: string
  }
  status: ClientStatus
  health_score: number
  tags: string[]
  custom_fields: Record<string, unknown>
  owner_id?: string
  created_at: string
  updated_at: string
}

export interface ClientStore {
  id: string
  client_id: string
  platform: "shopify" | "nuvemshop" | "woocommerce" | "other"
  store_name: string
  store_url: string
  api_key?: string
  api_secret?: string
  access_token?: string
  is_active: boolean
  created_at: string
}

// Contract Types
export type ContractStatus = "active" | "expired" | "cancelled" | "pending"

export interface Contract {
  id: string
  client_id: string
  plan_name: string
  monthly_value: number
  start_date: string
  end_date?: string
  status: ContractStatus
  notes?: string
  document_url?: string
  created_at: string
  updated_at: string
}

// Financial Types
export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled" | "refunded"

export interface Invoice {
  id: string
  client_id: string
  asaas_id?: string
  amount: number
  due_date: string
  payment_date?: string
  status: PaymentStatus
  description?: string
  created_at: string
}

// Meeting Types
export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show"

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
}

// Report Types
export interface Report {
  id: string
  client_id: string
  user_id: string
  month: string // Format: YYYY-MM
  document_url?: string
  metrics: ReportMetrics
  notes?: string
  created_at: string
}

export interface ReportMetrics {
  revenue?: number
  orders?: number
  conversion_rate?: number
  ad_spend?: number
  roas?: number
  email_revenue?: number
  custom_metrics?: Record<string, number>
}

// Pipeline Types
export interface Pipeline {
  id: string
  name: string
  description?: string
  is_default: boolean
  stages: PipelineStage[]
  created_at: string
  updated_at: string
}

export interface PipelineStage {
  id: string
  pipeline_id: string
  name: string
  color: string
  order: number
  created_at: string
}

export interface Deal {
  id: string
  pipeline_id: string
  stage_id: string
  client_id?: string
  title: string
  value: number
  probability: number
  expected_close_date?: string
  owner_id: string
  custom_fields: Record<string, unknown>
  notes?: string
  created_at: string
  updated_at: string
}

// Automation Types
export type AutomationTriggerType =
  | "new_client"
  | "client_status_changed"
  | "payment_confirmed"
  | "payment_overdue"
  | "meeting_overdue"
  | "meeting_upcoming"
  | "report_overdue"
  | "contract_expiring"
  | "revenue_dropped"
  | "deal_moved"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "scheduled_date"

export type AutomationActionType =
  | "send_email"
  | "send_whatsapp"
  | "send_sms"
  | "create_task"
  | "send_notification"
  | "update_field"
  | "update_status"
  | "add_tag"
  | "remove_tag"
  | "create_invoice"
  | "schedule_meeting"
  | "webhook"

export interface Automation {
  id: string
  name: string
  description?: string
  is_active: boolean
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface AutomationTrigger {
  type: AutomationTriggerType
  config: Record<string, unknown>
}

export interface AutomationCondition {
  field: string
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_set" | "is_not_set"
  value: unknown
  logic?: "and" | "or"
}

export interface AutomationAction {
  id: string
  type: AutomationActionType
  config: Record<string, unknown>
  delay_minutes?: number
  order: number
}

export interface AutomationLog {
  id: string
  automation_id: string
  trigger_data: Record<string, unknown>
  actions_executed: string[]
  status: "success" | "partial" | "failed"
  error_message?: string
  executed_at: string
}

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

// Integration Types
export type IntegrationType =
  | "asaas"
  | "meta_ads"
  | "google_ads"
  | "klaviyo"
  | "shopify"
  | "instagram"
  | "whatsapp"
  | "google_calendar"

export interface Integration {
  id: string
  type: IntegrationType
  name: string
  is_active: boolean
  credentials: Record<string, string>
  last_sync?: string
  created_at: string
  updated_at: string
}

// Custom Field Types
export type CustomFieldType = "text" | "number" | "date" | "select" | "multiselect" | "boolean" | "url" | "email"

export interface CustomField {
  id: string
  name: string
  key: string
  type: CustomFieldType
  entity_type: "client" | "deal" | "contract"
  options?: string[] // For select/multiselect
  is_required: boolean
  order: number
  created_at: string
}

// Tag Types
export interface Tag {
  id: string
  name: string
  color: string
  entity_type: "client" | "deal"
  created_at: string
}

// Email Template Types
export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  variables: string[]
  created_by: string
  created_at: string
  updated_at: string
}

// Settings Types
export interface Settings {
  id: string
  key: string
  value: unknown
  updated_at: string
}

// Dashboard Types
export interface DashboardMetrics {
  revenue: {
    current: number
    previous: number
    change: number
  }
  mrr: {
    current: number
    previous: number
    change: number
  }
  activeClients: number
  churnedClients: number
  pendingPayments: number
  overduePayments: number
  upcomingMeetings: Meeting[]
  pendingReports: number
  alerts: DashboardAlert[]
}

export interface DashboardAlert {
  id: string
  type: "meeting_overdue" | "payment_overdue" | "contract_expiring" | "report_pending"
  title: string
  description: string
  client_id?: string
  severity: "low" | "medium" | "high"
  created_at: string
}

// API Response Types
export interface ApiResponse<T> {
  data?: T
  error?: string
  status: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}
