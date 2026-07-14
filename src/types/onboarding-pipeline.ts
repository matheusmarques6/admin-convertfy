/**
 * Onboarding Pipeline v2 — types do schema PRD.
 *
 * Existe um arquivo onboarding.ts legado pre-existente (onboarding por
 * fases, contratos, etc). Este arquivo isola os tipos da pipeline
 * operacional NOVA sem conflitar com o legado.
 */

export type OperationalPipelineType = "onboarding" | "acompanhamento" | "feedback" | "suporte" | "campaign_design"
export type OnboardingPaymentStatus = "pending" | "paid" | "overdue" | "renewal_due"
export type OnboardingContractStatus = "pending" | "sent" | "signed" | "expiring"
export type OnboardingPipelineStatus = "in_progress" | "completed" | "cancelled"
export type BriefingStatus =
  | "not_started"
  | "form_partially_filled"
  | "generating"
  | "generated_pending_review"
  | "approved"
  | "needs_review"
export type BriefingSource =
  | "anthropic_sonnet"
  | "openrouter_sonnet"
  | "raw_template"
export type DeliverableFieldType =
  | "url"
  | "upload"
  | "select"
  | "numeric"
  | "textarea"
  | "date"
  | "checkbox"
  | "multi_checkbox"
export type FeedbackSeverity = "small" | "medium" | "rework_part" | "rework_all"
export type VersionStatus = "in_progress" | "approved" | "rejected_by_client"

export type ChecklistAutoCompleteEvent =
  | { event: "form_section_completed"; sections: string[] }
  | { event: "briefing_approved" }
  | { event: "email_sent"; template_slug: string }

export interface ChecklistItem {
  id: string
  label: string
  order: number
  /** Role responsavel default (usado pra criar 1 task por item via instantiateTaskForColumn) */
  assignee_role?: string | null
  /** SLA do item em horas (calcula due_date da task) */
  sla_hours?: number
  /** Descricao opcional pra task */
  description?: string
  /** Identificador estavel pra mapear template → task_checklists (sobrevive re-seeds). */
  slug?: string
  /** Quando preenchido, backend marca is_completed=true ao detectar o evento. */
  auto_complete_on?: ChecklistAutoCompleteEvent
  /** Sub-checklist interno (usado na Etapa 05: 1 task por flow, N emails dentro). */
  sub_items?: SubChecklistItem[]
}

/**
 * Sub-item de checklist (emails dentro de um flow na Etapa 05).
 * Armazenado em tasks.metadata.sub_items quando a task e instanciada.
 */
export interface SubChecklistItem {
  slug: string
  label: string
  /**
   * Slug do deliverable da Etapa 03 (piloto) que pre-preenche este item.
   * Quando definido, o pre-fill service marca completed=true e linka o
   * deliverable_id do piloto. UI mostra badge "vindo do piloto".
   */
  from_preview?: string
  /** Pre-marcado como completo (apos pre-fill 03->05). */
  completed?: boolean
  /** ID do task_deliverable da Etapa 03 que originou este sub_item. */
  preview_deliverable_id?: string | null
  /** URL do arquivo herdado do piloto (atalho de UI). */
  preview_file_url?: string | null
  completed_at?: string | null
  completed_by?: string | null
}

export interface DeliverableField {
  slug: string
  label: string
  type: DeliverableFieldType
  required: boolean
  validation?: string
  options?: string[]
  placeholder?: string
  helpText?: string
  /**
   * Quando true, select/multi_checkbox mostra opcao "Outros" que abre
   * input de texto livre. O valor digitado e salvo como string custom
   * (pra select) ou anexado no array (pra multi_checkbox).
   */
  allow_other?: boolean
  /**
   * Valor default derivado do contexto da loja/onboarding, injetado em
   * runtime pelas rotas GET (onboarding/productivity), ex: idioma vindo do
   * formulario do cliente. Nao e persistido no template — so no payload de GET.
   */
  default_value?: string | null
}

export interface AutomationRule {
  trigger:
    | "completed"
    | "created"
    | "overdue"
    | "form_submitted"
    | "briefing_confirmed"
  action:
    | "advance_to_next"
    | "go_back_to"
    | "create_task"
    | "call_webhook"
    | "create_pipeline_item"
    | "send_notification"
    | "generate_briefing"
    | "generate_tutorial_token"
  params: Record<string, unknown>
}

export interface OperationalPipeline {
  id: string
  org_id: string
  type: OperationalPipelineType
  name: string
  slug: string
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  columns?: OperationalPipelineColumn[]
}

export interface OperationalPipelineColumn {
  id: string
  pipeline_id: string
  name: string
  slug: string
  position: number
  color: string
  is_initial: boolean
  is_final: boolean
  checklist_template: ChecklistItem[]
  deliverables_template: DeliverableField[]
  whatsapp_template: string | null
  default_assignee_role: string | null
  sla_hours: number
  automation_rules: AutomationRule[]
}

export interface BriefingContent {
  about_brand: string
  audience: string
  language_tone: string
  visual_identity: {
    palette: string
    fonts: string
    references: string
  }
  offers_and_differentials: string
  client_additions?: string
  generated_at?: string
  confirmed_at?: string
}

export interface OnboardingPipelineItem {
  id: string
  org_id: string
  pipeline_id: string
  current_column_id: string | null
  client_id: string
  store_id: string
  source_deal_id: string | null
  status: OnboardingPipelineStatus
  current_version: number
  payment_status: OnboardingPaymentStatus
  contract_status: OnboardingContractStatus
  form_token: string
  form_token_expires_at?: string | null
  form_responses: Record<string, unknown> | null
  form_submitted_at: string | null
  briefing_status: BriefingStatus
  briefing: BriefingContent | null
  briefing_ai_original?: BriefingContent | null
  briefing_generated_at: string | null
  briefing_generated_by?: BriefingSource | null
  briefing_confirmed_at: string | null
  briefing_confirmed_by_client: boolean
  /** Slugs das secoes do wizard publico ja completadas pelo cliente (set-union). */
  form_sections_completed?: string[]
  tutorial_token: string | null
  entered_at: string
  last_column_change_at: string
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string

  // Campos comerciais (sprint final)
  plan?: string | null
  mrr_value?: number | string | null
  client_whatsapp?: string | null
  language?: string | null
  vertical?: string | null
  source?: "manual" | "deal_won" | "referral" | "migration" | null

  // Tracking de origem (Bruno - dashboard comercial)
  subscription_id?: string | null
  source_channel?: string | null
  referred_by_client_id?: string | null
  referred_by_name?: string | null
  source_pipeline_id?: string | null
  source_notes?: string | null

  /** Status efetivo computado em runtime via unified_invoices.
   *  Tem prioridade sobre payment_status armazenado (que vira fallback). */
  effective_payment_status?: OnboardingPaymentStatus
  /** Status efetivo de contrato via contracts table. */
  effective_contract_status?: OnboardingContractStatus
  /** Origem do effective_payment_status: 'asaas' (webhook), 'local' (manual via Cliente>Financeiro) ou 'fallback' (sem cobrança). */
  effective_payment_source?: "asaas" | "local" | "fallback"

  client?: { id: string; name: string; company: string | null }
  store?: {
    id: string
    store_name: string
    store_url: string | null
    platform: string | null
  }
  current_column?: OperationalPipelineColumn
  versions?: OnboardingVersion[]
  tasks?: OnboardingTaskLite[]
}

export interface OnboardingTaskLite {
  id: string
  title: string
  status: string
  priority: string
  assignee_role: string | null
  operational_column_id: string | null
  due_date: string | null
  /** Version do onboarding em que a task foi criada (sobe a cada go-back). */
  version?: number | null
}

export interface TaskDeliverable {
  id: string
  task_id: string
  field_slug: string
  field_label: string
  field_type: DeliverableFieldType
  required: boolean
  value: string | null
  file_url: string | null
  file_name: string | null
  file_size_bytes: number | null
  metadata: Record<string, unknown>
  filled_at: string | null
  filled_by: string | null
}

export interface OnboardingVersion {
  id: string
  onboarding_id: string
  column_id: string | null
  version_number: number
  status: VersionStatus
  client_feedback: string | null
  feedback_severity: FeedbackSeverity | null
  deliverables_snapshot: TaskDeliverable[]
  created_by: string | null
  created_at: string
  completed_at: string | null
}

export interface TaskOverride {
  id: string
  task_id: string | null
  onboarding_id: string | null
  column_id: string | null
  user_id: string
  justification: string
  items_skipped: Array<
    | { type: "checklist"; id: string; label: string }
    | { type: "deliverable"; slug: string; label: string }
  >
  created_at: string
}

// ─── Tutorial CMS ───
export type TutorialPageStatus = "draft" | "published"
export type TutorialBlockType =
  | "text"
  | "video"
  | "image"
  | "step"
  | "code"
  | "faq"
  | "cta_whatsapp"

export interface TutorialPage {
  id: string
  org_id: string
  slug: string
  name: string
  description: string | null
  status: TutorialPageStatus
  current_version: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  blocks?: TutorialBlock[]
}

export interface TutorialBlock {
  id: string
  page_id: string
  type: TutorialBlockType
  position: number
  content: Record<string, unknown>
  version: number
}
