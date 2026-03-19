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
    storeRevenue?: number
    storeOrders?: number
    totalRevenue?: number
    klaviyoAttributedRevenue?: number
    campaignRevenue?: number
    flowRevenue?: number
    smsRevenue?: number
    totalOrders?: number
    klaviyoAttributedOrders?: number
    averageOrderValue?: number
    recoveryRate?: number
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

// ─── Report Generation Types (Epic RG) ─────────────────────────────────────

export type StoreLoadStatus = "queued" | "loading" | "success" | "error"

export interface StoreLoadState {
  status: StoreLoadStatus
  data?: {
    totalRevenue: number
    campaignRevenue: number
    flowRevenue: number
    currency: string
  }
  error?: string
}

export interface FanOutResult {
  stores: Map<string, StoreLoadState>
  completedCount: number
  totalCount: number
  isAllDone: boolean
  hasErrors: boolean
  failedCount: number
}

export interface DateRange {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
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

// ─── Report Job Types (RG-4/RG-5) ──────────────────────────────────────────

export type ReportJobStatus = 'queued' | 'processing' | 'completed' | 'partial' | 'paused' | 'failed' | 'cancelled' | 'expired'

export interface ReportJob {
  id: string
  org_id: string
  user_id: string
  store_ids: string[]
  period: string
  start_date: string | null
  end_date: string | null
  status: ReportJobStatus
  progress: ReportJobProgress
  result: ReportJobResult | null
  viewed_at: string | null
  created_at: string
  updated_at: string
  expires_at: string
}

export interface ReportJobProgress {
  [key: string]: unknown
  invocation_count?: number
  paused_reason?: string
  paused_at?: string
  failure_reason?: string
}

export interface ReportJobStoreProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  completed_at?: string
  error?: string
}

export interface ReportJobResult {
  total_revenue: number
  klaviyo_attributed_revenue: number
  stores_processed: number
  stores_failed: number
  currencies?: string[]
  per_store: {
    [storeId: string]: {
      store_name?: string
      revenue: number
      campaign_revenue: number
      flow_revenue: number
      currency: string
      error?: string
    }
  }
  generated_at: string
}
