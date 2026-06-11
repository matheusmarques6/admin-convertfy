/**
 * Tipos da Central de Campanhas.
 *
 * Espelham as tabelas de supabase/migrations/20260716_campaign_central.sql.
 */

export type CampaignCycleStatus = "generating" | "ready" | "partial" | "failed"
export type CampaignSuggestionStatus = "suggested" | "approved" | "dismissed"
export type CampaignSuggestionType = "data" | "tema" | "email" | "performance" | "avulsa"
export type CampaignSuggestionSource = "ai" | "manual"
export type CommemorativeImpact = "high" | "med" | "low"
export type CommemorativeCategory = "seasonal" | "commercial" | "awareness" | "cultural"

export interface CampaignCycle {
  id: string
  org_id: string
  number: number
  range_start: string
  range_end: string
  status: CampaignCycleStatus
  triggered_by: "cron" | "manual"
  generated_at: string | null
  next_run_at: string | null
  context: CycleContextSnapshot
  error: string | null
  created_at: string
  updated_at: string
}

export interface CycleContextSnapshot {
  stores_scanned?: number
  countries?: string[]
  dates_in_window?: number
  attention_count?: number
  benchmark_count?: number
  trends_count?: number
  clusters?: Array<{ key: string; store_ids: string[] }>
  [key: string]: unknown
}

export interface CommemorativeDate {
  id: string
  country: string
  month_day: string
  year: number | null
  name: string
  impact: CommemorativeImpact
  category: CommemorativeCategory | null
  note: string | null
  tips: string[]
  best_campaign_types: string[]
  is_active: boolean
}

export type TrendCategory = "consumo" | "cultural" | "esportivo" | "social" | "viral" | "outros"
export type TrendUrgency = "week" | "month" | "quarter"
export type TrendRiskFlag = "low" | "med" | "high"
export type TrendFetchedVia = "trendtrack" | "web_search" | "manual"

export interface CampaignTrend {
  id: string
  org_id: string
  cycle_id: string
  title: string
  source: string | null
  delta_label: string | null
  tag: string | null
  niche: string | null
  country: string | null
  category: TrendCategory | null
  commercial_potential: number | null
  urgency: TrendUrgency | null
  risk_flag: TrendRiskFlag
  risk_reason: string | null
  campaign_angle: string | null
  fetched_via: TrendFetchedVia
  evidence: Array<{ url?: string; title?: string; quote?: string }>
  created_at: string
}

export interface SuggestionTrigger {
  label: string
  detail: string
  source: string
}

export interface SuggestionTarget {
  store_id: string
  store_name: string
  country: string
}

/** Bloco do construtor de email (mesma semântica dos blocos do mockup). */
export interface EmailDraftBlock {
  id: string
  type: "image" | "heading" | "text" | "offer" | "button" | "divider" | "footer"
  headline?: string
  sub?: string
  value?: string
  caption?: string
}

export interface EmailDraft {
  subject: string
  preheader: string
  strategy: string
  blocks: EmailDraftBlock[]
}

export interface CopyResultEntry {
  subject: string
  preview: string
  generated_at: string
  quality?: "good"
}

export interface CampaignSuggestion {
  id: string
  org_id: string
  cycle_id: string | null
  source: CampaignSuggestionSource
  status: CampaignSuggestionStatus
  type: CampaignSuggestionType
  title: string
  confidence: number | null
  trigger: SuggestionTrigger
  trend_id: string | null
  commemorative_date_id: string | null
  angle: string | null
  subject: string | null
  channel: string
  targets: SuggestionTarget[]
  target_summary: string | null
  est_revenue: string | null
  low_perf: boolean
  send_date: string | null
  email_draft: EmailDraft | null
  copy_results: {
    test?: Record<string, CopyResultEntry>
    production?: Record<string, CopyResultEntry>
  }
  pipeline_item_id: string | null
  decided_by: string | null
  decided_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Loja em atenção (derivada — não é tabela). */
export interface AttentionStore {
  store_id: string
  store_name: string
  country: string
  vertical: string | null
  metric: string
  sub: string
  tone: "warn" | "neg" | "purple"
  ideas: number
}

/** Email campeão do benchmark interno (derivado de omnisend_campaign_metrics). */
export interface BenchmarkEmail {
  subject: string
  metric: string
  label: string
  lift: string
  vertical: string | null
  store_name?: string
  open_rate: number
  recipients: number
}
