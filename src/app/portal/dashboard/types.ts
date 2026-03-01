export interface StoreOption {
  id: string
  name: string
  platform: string
  isActive: boolean
}

export interface KlaviyoData {
  storeRevenue: number
  storeOrders: number
  recoveryRate: number
  totalLeads: number
  engagedLeads: number
  engagementRate: number
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  smsRevenue: number
  emailsSent: number
  delivered: number
  opened: number
  clicked: number
  openRate: number
  clickRate: number
  clickToOpenRate: number
  conversionRate: number
  unsubscribeRate: number
  bounceRate: number
  bounces: number
  campaignsCount: number
  campaignDelivered: number
  campaignRevenuePercent: number
  flowsCount: number
  activeFlows: number
  flowDelivered: number
  flowRevenuePercent: number
  recentCampaigns: Array<{
    id: string
    name: string
    status: string
    sentAt: string
    recipients: number
    delivered: number
    opened: number
    clicked: number
    revenue: number
    openRate: number
    clickRate: number
  }>
  topFlows: Array<{
    id: string
    name: string
    revenue: number
    delivered: number
    openRate: number
    clickRate: number
  }>
}

export interface CouponData {
  code: string
  orders: number
  revenue: number
  discount: number
}

export interface UtmSourceData {
  source: string
  orders: number
  revenue: number
}

export interface TopCustomerData {
  email: string
  name: string
  ordersCount: number
  totalSpent: number
  averageOrderValue: number
  lastOrderDate: string
}

export interface ShopifyData {
  totalRevenue: number
  totalOrders: number
  paidOrders?: number
  averageOrderValue: number
  totalCustomers: number
  newCustomers: number
  recurringCustomerRate: number
  topProducts: Array<{
    name: string
    quantity: number
    revenue: number
  }>
  topCustomers?: TopCustomerData[]
  coupons?: {
    totalOrdersWithCoupon: number
    couponUsageRate: number
    topCoupons: CouponData[]
    totalDiscount: number
  }
  utmConversions?: {
    totalOrdersWithUtm: number
    utmTrackingRate: number
    bySource: UtmSourceData[]
    byMedium: Array<{ medium: string; orders: number; revenue: number }>
    byCampaign: Array<{ campaign: string; orders: number; revenue: number }>
  }
}

export interface PortalMeeting {
  id: string
  title: string
  scheduledAt: string
  duration: number
  meetingUrl?: string
  status: string
  completionNotes?: string
  completedAt?: string
}

export interface DashboardData {
  client: {
    id: string
    name: string
    company?: string
  }
  stores: StoreOption[]
  selectedStore?: {
    id: string
    name: string
    platform: string
  }
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
  invoices: {
    pending: number
    overdue: number
    totalPending: number
    totalOverdue: number
    totalPaid: number
  }
  meetings?: PortalMeeting[]
  period: string
  dateRange?: {
    start: string
    end: string
  }
  lastUpdated: string
  dataStatus?: "loading" | "stale" | "ready" | "error" | "empty" | "syncing"
  lastFetchedAt?: string | null
  isRefreshing?: boolean
  source?: "cache" | "live" | "stale-cache"
}
