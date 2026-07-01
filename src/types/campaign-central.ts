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

export interface EmailDraftProductItem {
  name?: string
  price?: string
  image_caption?: string
}

/** Bloco do construtor de email (mesma semântica dos blocos do mockup). */
export interface EmailDraftBlock {
  id: string
  type: "image" | "heading" | "text" | "offer" | "button" | "divider" | "footer" | "products"
  /** Rótulo de seção (HERO/REVIEW/FOOTER…), quando a copy é fatiada por seção
   *  na normalização do callback. Vazio em blocos legados/não-seccionados.
   *  É `section` (não `label`) porque `label` já é texto de botão no n8n. */
  section?: string
  headline?: string
  sub?: string
  value?: string
  caption?: string
  // products
  columns?: 2 | 3
  items?: EmailDraftProductItem[]
}

export interface EmailDraft {
  subject: string
  preheader: string
  strategy: string
  blocks: EmailDraftBlock[]
}

export interface CopyResultEntry {
  subject: string
  /** Mantido pra compat — em entries novas reflete preheader. */
  preview: string
  preheader?: string
  strategy?: string
  /** Email completo adaptado por loja (idioma/tom/grid com top products reais). */
  blocks?: EmailDraftBlock[]
  quality?: "good" | null
  generated_at: string
  generated_via?:
    | "ai_master_adapt"
    | "subject_only_legacy"
    | "n8n"
    | "inline_fallback"
  /** Estado do dispatch assíncrono (n8n). UI usa pra mostrar spinner. */
  status?: "pending" | "success" | "error"
  /** Quando o dispatch foi enfileirado. Watchdog usa pra detectar timeout. */
  dispatched_at?: string
  /** Mensagem de erro do callback quando status='error'. */
  error_message?: string
}

/**
 * Briefing de estrutura & tom da copy, controlado pelo COO (campo `brief`
 * em campaign_suggestions). Injetado como seção ADITIVA no prompt de geração
 * (copy-master + campaign-copy). Todos os campos são opcionais — a UI
 * principal usa `structure` como texto único (estrutura/tom/regras juntos).
 */
export interface CampaignBrief {
  /** Estrutura bloco-a-bloco + tom geral (texto principal usado na UI). */
  structure?: string
  /** Tom de voz desejado (opcional — quando separado de `structure`). */
  tone?: string
  /** Restrições/regras ("sem emoji no assunto", "frases curtas"). */
  constraints?: string
  /** O que a copy DEVE incluir (cupom em destaque, prova social…). */
  must_include?: string
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
  /** Briefing de estrutura & tom da copy (COO). Guia a geração de copy. */
  brief: CampaignBrief | null
  copy_results: {
    test?: Record<string, CopyResultEntry>
    production?: Record<string, CopyResultEntry>
  }
  pipeline_item_id: string | null
  /** Público-alvo livre escolhido pelo COO (ex: "BR + Global", "Só BR moda"). */
  audience_label: string | null
  /** Lojas escolhidas como piloto (gate piloto→rollout). */
  pilot_store_ids: string[]
  /** Task criada pros designers quando a campanha foi aprovada. */
  design_task_id: string | null
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

// ── Painel "Copy da Campanha (Handoff)" (etapa de design) ────────────

/** Status derivado de uma copy de PRODUÇÃO por loja no painel de handoff. */
export type CampaignHandoffStatus = "pending" | "ready" | "error" | "missing"

/** Uma loja no painel "Copy da campanha (Handoff)" do designer. */
export interface CampaignHandoffStore {
  store_id: string
  store_name: string
  country: string
  language: string | null
  status: CampaignHandoffStatus
  /** Copy de PRODUÇÃO da loja (null enquanto não gerada). */
  copy: CopyResultEntry | null
}

// ── Geração de Imagens por Loja (etapa de PRODUÇÃO) ──────────────────

/** Formato/aspecto-alvo de um lote de imagens. Mapeia pra AspectKey no service. */
export type CampaignImageFormat = "hero" | "square" | "story"

/** Status ao vivo de uma imagem por loja (espelha o CHECK da tabela). */
export type CampaignImageResultStatus =
  | "queued"
  | "generating"
  | "ready"
  | "adjustment"
  | "failed"

/**
 * Flags de adaptação por loja de um lote. Cada flag liga uma faceta da
 * marca da loja na direção de arte injetada no prompt.
 */
export interface CampaignImageAdaptFlags {
  idioma?: boolean
  cores?: boolean
  logo?: boolean
  catalogo?: boolean
  /**
   * @deprecated Removido da UI e do prompt (duplicava o `text_context.tom`).
   * Mantido só pra TOLERAR lotes já salvos com a flag (o Zod `.strict()` rejeitaria
   * o re-save sem este campo). É inerte — não tem efeito no prompt.
   */
  tom?: boolean
}

/**
 * Um campo textual OPT-IN do agente de imagem. `include` liga a injeção do
 * campo no prompt; `value` (opcional) sobrescreve o dado real da loja. Quando
 * ligado sem `value`, usa o dado da loja; quando desligado, o campo não entra.
 */
export interface CampaignImageTextField {
  include: boolean
  value?: string
}

/**
 * Contexto textual opt-in de um lote. Os 5 campos textuais (nicho, persona/
 * público, tom de voz, moeda/locale, headline) são liga/desliga por lote;
 * por padrão ficam desligados (prompt enxuto). A identidade VISUAL continua
 * sempre no prompt — não faz parte deste contexto.
 */
export interface CampaignImageTextContext {
  nicho?: CampaignImageTextField
  publico?: CampaignImageTextField
  tom?: CampaignImageTextField
  moeda?: CampaignImageTextField
  headline?: CampaignImageTextField
}

/** Um lote de instrução (= um tipo de imagem). */
export interface CampaignImageBatch {
  id: string
  suggestion_id: string
  task_id: string | null
  name: string
  format: CampaignImageFormat
  instruction: string
  reference_image_url: string | null
  adapt_flags: CampaignImageAdaptFlags
  /** Contexto textual opt-in por lote (default {} = todos desligados). */
  text_context: CampaignImageTextContext
  created_at: string
  updated_at: string
}

/** Resultado de geração de um lote para UMA loja. */
export interface CampaignImageResult {
  id: string
  batch_id: string
  store_id: string
  store_name: string
  country: string
  language: string | null
  status: CampaignImageResultStatus
  image_url: string | null
  adjustment_notes: string | null
  error_message: string | null
  generated_at: string | null
  /** Última atualização da linha (ISO). Usado no frontend pra detectar card
   *  preso em 'generating' (recuperação manual). */
  updated_at: string
}

/** Lote + seus resultados por loja (item da lista no painel). */
export interface CampaignImageBatchWithResults extends CampaignImageBatch {
  results: CampaignImageResult[]
}

/** Loja-alvo do painel (com brand resumida pros chips). */
export interface CampaignImageTargetStore {
  store_id: string
  store_name: string
  country: string
  language: string | null
  logo_url: string | null
  primary_color: string | null
}

/** Payload de GET /api/tasks/[id]/campaign-images — alimenta o painel. */
export interface CampaignImagePayload {
  suggestion_id: string
  title: string
  send_date: string | null
  /** Lojas-alvo da campanha (todas as targets). */
  stores: CampaignImageTargetStore[]
  /** Lotes existentes com resultados por loja. */
  batches: CampaignImageBatchWithResults[]
}

/** Payload de GET /api/tasks/[id]/campaign-copies — alimenta o painel. */
export interface CampaignHandoffPayload {
  suggestion_id: string
  title: string
  channel: string
  send_date: string | null
  /** Assunto base (master) da campanha. */
  subject: string | null
  /** Loja escolhida pelo designer como base (★). */
  pilot_store_id: string | null
  /** Link do Figma entregue na etapa estrutura (versão atual), se houver. */
  figma_link: string | null
  figma_filled_at: string | null
  stores: CampaignHandoffStore[]
}
