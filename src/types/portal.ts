import type { Client, ClientStore } from "./client"
import type { Campaign } from "./campaign"
import type { Invoice } from "./financial"

// Client Portal Types
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
