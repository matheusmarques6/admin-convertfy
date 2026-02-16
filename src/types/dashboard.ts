import type { Meeting } from "./meeting"

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
