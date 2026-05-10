/**
 * Weekly Report — relatorio semanal por loja, gerado pelo cron de
 * segunda-feira. Usado pelo CS pra preparar a call de acompanhamento.
 */

export interface WeeklyReportMetrics {
  revenue: {
    current: number
    previous: number
    change_pct: number
  }
  campaigns_sent: number
  opens: {
    current: number
    previous: number
    rate: number
    rate_previous: number
  }
  clicks: {
    current: number
    previous: number
    rate: number
    rate_previous: number
  }
  flows: {
    revenue_total: number
    top_flows: Array<{
      flow_id: string
      flow_name: string
      revenue: number
      conversions: number
    }>
  }
  health_score?: number
}

export interface WeeklyReport {
  id: string
  org_id: string
  store_id: string
  week_start: string // ISO date
  week_end: string
  metrics: WeeklyReportMetrics
  highlights: string[]
  concerns: string[]
  suggestions: string[]
  ai_summary: string | null
  is_reviewed: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}
