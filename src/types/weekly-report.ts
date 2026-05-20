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
  /** Pedidos pagos no periodo. Auto-populado de tracking_orders se
   *  disponivel; caso contrario inicia em count=0/value=0 e o CM
   *  preenche manualmente. */
  paid_orders?: {
    count: number
    value: number
    previous_count: number
    previous_value: number
    /** "tracking" = vem de tracking_orders, "manual" = override do CM,
     *  "estimated" = inferido de campaigns (fallback). */
    source: "tracking" | "manual" | "estimated" | "none"
  }
  health_score?: number
}

/** Caminho de campo dentro do metrics. Usado em metrics_overrides. */
export type MetricOverrideKey =
  | "revenue.current"
  | "revenue.previous"
  | "campaigns_sent"
  | "opens.current"
  | "opens.rate"
  | "clicks.current"
  | "clicks.rate"
  | "paid_orders.count"
  | "paid_orders.value"

export interface WeeklyReport {
  id: string
  org_id: string
  store_id: string
  week_start: string // ISO date
  week_end: string
  metrics: WeeklyReportMetrics
  /** Overrides manuais. Estrutura espelha parcialmente metrics. */
  metrics_overrides?: Partial<{
    revenue: Partial<WeeklyReportMetrics["revenue"]>
    campaigns_sent: number
    opens: Partial<WeeklyReportMetrics["opens"]>
    clicks: Partial<WeeklyReportMetrics["clicks"]>
    paid_orders: Partial<NonNullable<WeeklyReportMetrics["paid_orders"]>>
  }>
  highlights: string[]
  concerns: string[]
  suggestions: string[]
  ai_summary: string | null
  is_reviewed: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  edited_by?: string | null
  edited_at?: string | null
  created_at: string
}
