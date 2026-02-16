// Report Types
export type ReportType = 'manual' | 'klaviyo' | 'shopify' | 'combined'
export type ReportStatus = 'draft' | 'published' | 'sent' | 'archived'

export interface Report {
  id: string
  client_id: string
  store_id?: string
  store_name?: string
  user_id?: string
  report_type: ReportType
  period: string // '7d', '30d', '90d', 'YYYY-MM', 'custom'
  date_range?: {
    start: string
    end: string
  }
  document_url?: string
  report_data: ReportData
  notes?: string
  status?: ReportStatus
  created_at: string
  updated_at?: string
}

// Full report data structure (from Klaviyo/Shopify API)
export interface ReportData {
  // Revenue metrics
  revenue?: {
    totalRevenue?: number
    klaviyoAttributedRevenue?: number
    campaignRevenue?: number
    flowRevenue?: number
    smsRevenue?: number
    totalOrders?: number
    averageOrderValue?: number
  }
  // Overview metrics
  overview?: {
    totalSubscribers?: number
    totalLists?: number
    totalSegments?: number
    totalFlows?: number
    totalCampaigns?: number
    engagedSegmentSize?: number
  }
  // Email performance
  emailPerformance?: {
    delivered?: number
    deliveryRate?: number
    opened?: number
    openRate?: number
    clicked?: number
    clickRate?: number
    bounced?: number
    bounceRate?: number
    unsubscribed?: number
    unsubscribeRate?: number
  }
  // Campaign and flow details
  campaigns?: Array<{
    id?: string
    name?: string
    status?: string
    sentAt?: string
    recipients?: number
    revenue?: number
    openRate?: number
    clickRate?: number
  }>
  flows?: Array<{
    id?: string
    name?: string
    status?: string
    revenue?: number
    recipients?: number
  }>
  // Account info
  account?: {
    currency?: string
    locale?: string
    timezone?: string
  }
  // Legacy manual report metrics (backwards compatibility)
  revenue_manual?: number
  orders?: number
  conversion_rate?: number
  ad_spend?: number
  roas?: number
  email_revenue?: number
  custom_metrics?: Record<string, number>
  // Allow additional fields
  [key: string]: unknown
}

// Legacy interface for backwards compatibility
export interface ReportMetrics {
  revenue?: number
  orders?: number
  conversion_rate?: number
  ad_spend?: number
  roas?: number
  email_revenue?: number
  custom_metrics?: Record<string, number>
}
