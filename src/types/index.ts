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
  | "wise"

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

// Campaign Types
export type CampaignStatus = "draft" | "scheduled" | "sent" | "cancelled"
export type CampaignChannel = "email" | "sms" | "push" | "whatsapp"
export type CampaignType = "promotional" | "newsletter" | "transactional" | "automation" | "seasonal" | "launch" | "other"

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
  klaviyo_campaign_id?: string
  external_id?: string
  tags: string[]
  color: string
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
  // Joined data
  store?: ClientStore
  client?: Client
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

// ===========================================
// Organization & Agent Types
// ===========================================

export type OrgRole = "owner" | "manager" | "coordinator" | "copywriter" | "designer" | "developer" | "support" | "analyst"
export type OrgType = "internal" | "agency" | "partner"

export interface Organization {
  id: string
  name: string
  slug: string
  type: OrgType
  settings: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  profile_id: string
  role: OrgRole
  job_title?: string
  is_active: boolean
  invited_by?: string
  invited_at: string
  invite_accepted_at?: string
  created_at: string
  updated_at: string
  // Joined data
  organization?: Organization
  profile?: User
  features?: OrgMemberFeature[]
  store_access?: AgentStoreAccess[]
}

export interface OrgMemberFormData {
  org_id: string
  profile_id?: string
  email?: string
  name?: string
  role: OrgRole
  job_title?: string
  features?: string[]
  store_ids?: string[]
}

export interface FeatureCatalog {
  key: string
  name: string
  description?: string
  category: string
  icon?: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface OrgMemberFeature {
  id: string
  org_member_id: string
  feature_key: string
  enabled: boolean
  granted_by?: string
  granted_at: string
  notes?: string
  // Joined data
  feature?: FeatureCatalog
}

export interface AgentStoreAccess {
  id: string
  org_member_id: string
  store_id: string
  can_view: boolean
  can_edit: boolean
  can_manage_onboarding: boolean
  can_manage_campaigns: boolean
  can_manage_reports: boolean
  assigned_by?: string
  assigned_at: string
  notes?: string
  // Joined data
  store?: ClientStore
  org_member?: OrgMember
}

export interface AgentStoreAccessFormData {
  org_member_id: string
  store_id: string
  can_view?: boolean
  can_edit?: boolean
  can_manage_onboarding?: boolean
  can_manage_campaigns?: boolean
  can_manage_reports?: boolean
  notes?: string
}

// ===========================================
// Task Types
// ===========================================

export type TaskType = "onboarding" | "campaign" | "request" | "general" | "meeting" | "deadline"
export type TaskStatus = "pending" | "in_progress" | "blocked" | "review" | "completed" | "cancelled"
export type TaskPriority = "low" | "medium" | "high" | "urgent"

export interface Task {
  id: string
  title: string
  description?: string
  type: TaskType
  status: TaskStatus
  priority: TaskPriority
  assignee_id?: string
  created_by: string
  client_id?: string
  store_id?: string
  campaign_batch_id?: string
  due_date?: string
  started_at?: string
  completed_at?: string
  position: number
  metadata: Record<string, unknown>
  tags: string[]
  created_at: string
  updated_at: string
  // Joined data
  assignee?: OrgMember
  creator?: User
  client?: Client
  store?: ClientStore
  comments_count?: number
  checklists?: TaskChecklist[]
}

export interface TaskFormData {
  title: string
  description?: string
  type: TaskType
  priority: TaskPriority
  assignee_id?: string
  client_id?: string
  store_id?: string
  due_date?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  content: string
  mentions: string[]
  attachments: { url: string; name: string; type: string }[]
  created_at: string
  updated_at: string
  // Joined data
  author?: User
}

export interface TaskHistory {
  id: string
  task_id: string
  actor_id: string
  action: "created" | "updated" | "status_changed" | "assigned" | "commented"
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  created_at: string
  // Joined data
  actor?: User
}

export interface TaskChecklist {
  id: string
  task_id: string
  title: string
  is_completed: boolean
  completed_by?: string
  completed_at?: string
  position: number
  created_at: string
}

// ===========================================
// Client Portal Types
// ===========================================

export interface ClientPortalPermissions {
  view_reports: boolean
  view_invoices: boolean
  view_campaigns: boolean
  edit_profile: boolean
  manage_stores: boolean
}

export interface ClientPortalUser {
  id: string
  client_id: string
  auth_user_id?: string
  email: string
  name: string
  phone?: string
  avatar_url?: string
  is_active: boolean
  is_primary: boolean
  permissions: ClientPortalPermissions
  last_login_at?: string
  login_count: number
  email_verified_at?: string
  invited_by?: string
  invited_at: string
  created_at: string
  updated_at: string
  // Joined data
  client?: Client
}

export interface ClientPortalSession {
  id: string
  portal_user_id: string
  session_token: string
  user_agent?: string
  ip_address?: string
  expires_at: string
  revoked_at?: string
  created_at: string
}

export interface ClientPortalActivity {
  id: string
  portal_user_id: string
  client_id: string
  action: string
  resource_type?: string
  resource_id?: string
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
  created_at: string
}

export interface ClientNotificationPreferences {
  id: string
  portal_user_id: string
  email_report_weekly: boolean
  email_report_monthly: boolean
  email_invoice_reminder: boolean
  email_invoice_paid: boolean
  email_campaign_sent: boolean
  email_performance_alerts: boolean
  whatsapp_enabled: boolean
  whatsapp_number?: string
  created_at: string
  updated_at: string
}

export interface ClientReportToken {
  id: string
  client_id: string
  store_id?: string
  token: string
  expires_at?: string
  max_views?: number
  view_count: number
  report_type: "full" | "summary" | "custom"
  allowed_sections?: string[]
  created_by?: string
  last_viewed_at?: string
  created_at: string
}

// Form data for creating portal users
export interface ClientPortalUserFormData {
  client_id: string
  email: string
  name: string
  phone?: string
  is_primary?: boolean
  permissions?: Partial<ClientPortalPermissions>
  send_invitation?: boolean
}

// Portal dashboard data
export interface PortalDashboardData {
  client: Client
  stores: ClientStore[]
  recentCampaigns: Campaign[]
  upcomingInvoices: Invoice[]
  pendingInvoices: Invoice[]
  totalRevenue: number
  totalOrders: number
  totalLeads: number
  engagedLeads: number
  lastUpdated: string
}

// Portal store report
export interface PortalStoreReport {
  store: ClientStore
  klaviyo?: {
    totalLeads: number
    engagedLeads: number
    engagementRate: number
    totalRevenue: number
    campaignRevenue: number
    flowRevenue: number
    emailsSent: number
    openRate: number
    clickRate: number
    lists: Array<{ name: string; count: number }>
    recentCampaigns: Array<{
      name: string
      status: string
      revenue: number
      openRate: number
      clickRate: number
    }>
  }
  shopify?: {
    totalOrders: number
    totalRevenue: number
    averageOrderValue: number
    recurringCustomerRate: number
    topProducts: Array<{
      name: string
      quantity: number
      revenue: number
    }>
  }
  lastSyncedAt?: string
}

