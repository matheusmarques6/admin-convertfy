/**
 * CRM Convertfy — tipos compartilhados.
 *
 * Espelha as tabelas do Postgres apos migration 20260507_crm_phase1_*.sql
 * (estende `pipelines`, `deals`, `pipeline_stages` existentes + tabelas
 * `crm_*` novas).
 */

// ─── Enums ───────────────────────────────────────────────────────

export type PipelineScope = "sales" | "cs" | "internal"

export type PipelineLayout = "kanban" | "state"

export type StageType = "open" | "won" | "lost" | "archived"

export type DealStatus = "open" | "won" | "lost" | "archived"

export type LeadStatus =
  | "new"
  | "qualified"
  | "unqualified"
  | "converted"
  | "lost"

export type PartnerType = "agency" | "freelancer" | "influencer" | "other"

export type PartnerState =
  | "prospect"
  | "active"
  | "inactive"
  | "top_performer"
  | "closed"

export type CrmActivityType =
  | "note"
  | "call"
  | "email"
  | "wa_message"
  | "ig_message"
  | "meeting"
  | "task"
  | "system"
  | "stage_change"
  | "file_attached"

// Motivos comuns de perda (livre, mas com sugestoes)
export type CommonLostReason =
  | "sem_fit"
  | "preco"
  | "timing"
  | "concorrente"
  | "no_show"
  | "sem_resposta"
  | "outro"

// ─── Pipeline ────────────────────────────────────────────────────

export interface Pipeline {
  id: string
  name: string
  description: string | null
  scope: PipelineScope
  color: string
  layout: PipelineLayout
  is_default: boolean
  is_archived: boolean
  is_favorite: boolean
  category: string | null
  default_assignee_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Computado em queries
  stages?: PipelineStage[]
  deal_count?: number
  total_value_cents?: number
}

/**
 * Agrupamento de pipelines por categoria, usado pela sidebar V2.
 * `category` vem de `pipelines.category`; pipelines sem categoria
 * caem em "Sem categoria" no final.
 */
export interface PipelineGroup {
  label: string
  pipelines: Pipeline[]
  count: number
}

export interface PipelineStage {
  id: string
  pipeline_id: string
  name: string
  color: string
  order: number
  stage_type: StageType
  sla_hours: number | null
  description: string | null
  exit_criteria: string | null
  automation_on_enter: Record<string, unknown> | null
  created_at: string
}

// ─── Deal ────────────────────────────────────────────────────────

export interface Deal {
  id: string
  pipeline_id: string
  stage_id: string
  client_id: string | null
  store_id: string | null
  lead_id: string | null
  title: string
  value: number // BRL no formato decimal (ja existe — ndo cents)
  currency: string
  probability: number
  expected_close_date: string | null
  status: DealStatus
  source: string | null
  utm: Record<string, unknown>
  tags: string[]
  lost_reason: string | null
  won_reason: string | null
  won_at: string | null
  lost_at: string | null
  owner_id: string
  referrer_partner_id: string | null
  position: number
  last_stage_changed_at: string
  custom_fields: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
  // Joins comuns
  pipeline?: Pipeline
  stage?: PipelineStage
  client?: { id: string; name: string; company: string | null }
  store?: { id: string; store_name: string }
  lead?: Lead
  owner?: { id: string; name: string; avatar_url: string | null }
}

// ─── Lead ────────────────────────────────────────────────────────

export interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  role: string | null
  source: string | null
  utm: Record<string, unknown>
  status: LeadStatus
  converted_to_client_id: string | null
  converted_to_deal_id: string | null
  enrichment: Record<string, unknown>
  ai_qualification_score: number | null
  ai_qualification_reason: string | null
  notes: string | null
  assigned_to: string | null
  tags: string[]
  last_contacted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Contact ─────────────────────────────────────────────────────

export interface Contact {
  id: string
  client_id: string
  store_id: string | null
  name: string
  email: string | null
  phone: string | null
  role: string | null
  is_primary: boolean
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Partner ─────────────────────────────────────────────────────

export interface Partner {
  id: string
  name: string
  email: string | null
  phone: string | null
  partner_type: PartnerType
  state: PartnerState
  commission_pct: number
  commission_terms: string | null
  total_deals_won: number
  total_revenue_cents: number
  total_commission_paid_cents: number
  total_commission_due_cents: number
  last_referral_at: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Activity (timeline) ─────────────────────────────────────────

export interface DealActivity {
  id: string
  deal_id: string | null
  lead_id: string | null
  type: CrmActivityType
  content: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  due_at: string | null
  completed_at: string | null
  is_internal: boolean
  created_at: string
  // Joins
  creator?: { id: string; name: string; avatar_url: string | null }
}

export interface DealHistory {
  id: string
  deal_id: string
  changed_by: string | null
  field: string
  old_value: unknown
  new_value: unknown
  automation_id: string | null
  changed_at: string
  // Join
  changer?: { id: string; name: string; avatar_url: string | null }
}

// ─── Deal files (anexos) ─────────────────────────────────────────

export interface DealFile {
  id: string
  deal_id: string
  name: string
  mime_type: string | null
  size_bytes: number | null
  storage_path: string
  storage_bucket: string
  uploaded_by: string | null
  category: string | null
  created_at: string
  // Join
  uploader?: { id: string; name: string; avatar_url: string | null }
  // Computado pela API (signed URL temporaria)
  signed_url?: string
}

// ─── Health ──────────────────────────────────────────────────────

export interface HealthSnapshot {
  id: string
  store_id: string
  health_score: number
  components: {
    asaas?: number
    revenue?: number
    integrations?: number
    nps?: number
  }
  computed_at: string
}

// ─── Filtros e Listagem ──────────────────────────────────────────

export interface DealFilters {
  pipeline_id?: string
  stage_id?: string
  status?: DealStatus | DealStatus[]
  owner_id?: string
  tags?: string[]
  source?: string
  search?: string
  client_id?: string
  store_id?: string
  has_lead?: boolean
  expected_close_from?: string
  expected_close_to?: string
}

export interface LeadFilters {
  status?: LeadStatus | LeadStatus[]
  assigned_to?: string
  source?: string
  tags?: string[]
  search?: string
  has_phone?: boolean
  has_email?: boolean
}

// ─── Inputs (creates / updates) ──────────────────────────────────

export interface DealInput {
  pipeline_id: string
  stage_id: string
  title: string
  value?: number
  currency?: string
  probability?: number
  expected_close_date?: string | null
  client_id?: string | null
  store_id?: string | null
  lead_id?: string | null
  source?: string | null
  utm?: Record<string, unknown>
  tags?: string[]
  owner_id: string
  referrer_partner_id?: string | null
  notes?: string | null
}

export interface LeadInput {
  name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  role?: string | null
  source?: string | null
  utm?: Record<string, unknown>
  notes?: string | null
  assigned_to?: string | null
  tags?: string[]
}

export interface ContactInput {
  client_id: string
  store_id?: string | null
  name: string
  email?: string | null
  phone?: string | null
  role?: string | null
  is_primary?: boolean
  notes?: string | null
}

export interface PartnerInput {
  name: string
  email?: string | null
  phone?: string | null
  partner_type: PartnerType
  commission_pct?: number
  commission_terms?: string | null
  notes?: string | null
}
