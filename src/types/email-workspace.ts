/**
 * Workspace de Produção de Emails (Onboarding)
 *
 * Espelha o schema da migration 20260607_email_production_workspace.sql.
 * Usado na tela /admin/stores/[id]/producao (e variações).
 */

// ── Brand Identity ──────────────────────────────────────────

export interface StoreBrandIdentity {
  id: string
  store_id: string
  version: number
  logo_main_svg: string | null
  logo_main_png: string | null
  logo_alt_svg: string | null
  logo_alt_png: string | null
  logo_monogram_svg: string | null
  logo_monogram_png: string | null
  logo_reverse_svg: string | null
  logo_reverse_png: string | null
  colors_primary: BrandColor[]
  colors_secondary: BrandColor[]
  font_heading: string | null
  font_heading_weight: string | null
  font_body: string | null
  font_body_weight: string | null
  voice: string[]
  trust_icons: TrustIcon[]
  top_products: TopProduct[]
  source: "ai_capture" | "manual" | "edited"
  created_at: string
  created_by: string | null
  // AE-18: gate 2 (designer confirma a identidade visual antes do
  // dispatcher disparar fase 2). NULL = pendente; cada nova versao
  // (PATCH) nasce com NULL.
  confirmed_at: string | null
  confirmed_by: string | null
}

export interface BrandColor {
  hex: string
  name: string
  role: "Principal" | "Fundo" | "Destaque" | string
}

export interface TrustIcon {
  image_url: string
}

export interface TopProduct {
  id?: string
  name: string
  price: number | string
  image_url: string
  url?: string
}

// ── Briefing ────────────────────────────────────────────────

export interface StoreBriefing {
  id: string
  store_id: string
  version: number
  raw_input: Record<string, unknown> | null
  marca: BriefingMarca
  briefing: BriefingDetail
  source: "ai_treatment" | "manual" | "edited"
  created_at: string
  created_by: string | null
  // Estendido pela migration 20260530_agent_email_generation.sql (Epic AE).
  // Opcional para retrocompat com rows legacy.
  status?: "current" | "confirmed" | "archived"
  confirmed_at?: string | null
  confirmed_by?: string | null
}

export interface BriefingMarca {
  nicho?: string
  slogan?: string | null
  diferencial?: string
  persona?: string
  tom_voz?: "formal" | "casual" | "afetivo" | "divertido" | string
  posicionamento?: "popular" | "medio" | "premium" | string
  hashtags?: string[]
}

export interface BriefingDetail {
  nivel_liberdade?: "Alto" | "Médio" | "Baixo" | string
  aprova_antes?: string
  sensibilidade?: string
  conceito?: string
  politicas?: Array<{ tipo: string; valor: string }>
  diferenciais?: string[]
  restricoes?: string[]
  competidores?: string[]
}

// ── Email Flows ─────────────────────────────────────────────

export type FlowType =
  | "welcome"
  | "site_abandoned"
  | "abandoned_cart"
  | "browse_abandonment"
  | "upsell"
  | "win_back"
  | "shipping_stages"
  | "post_purchase"
  | "custom"

export type FlowStatus =
  | "blocked"
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "live"

/**
 * Status canonico de email_flow_emails.
 *
 * Valores Epic AE (Agent Email Generation):
 *   draft -> pending -> copy_generating [-> copy_generating_recovery]
 *     -> copy_ready -> rendering -> qa_running -> ready | failed
 *
 * Valores LEGACY (Epic 8/9, push Klaviyo): in_progress, approved, live.
 * Mantidos por retrocompat — NAO usar em codigo novo.
 *
 * Espelha o CHECK constraint da migration 20260530_agent_email_generation.sql.
 */
export type EmailStatus =
  | "draft"
  | "in_progress"
  | "pending"
  | "copy_generating"
  | "copy_generating_recovery"
  | "copy_ready"
  | "rendering"
  | "qa_running"
  | "ready"
  | "failed"
  | "approved"
  | "live"

import type { QaIssue } from "./email-generation"

export interface EmailFlow {
  id: string
  store_id: string
  flow_type: FlowType
  name: string
  description: string | null
  status: FlowStatus
  position: number
  assigned_to: string | null
  progress_percent: number
  created_at: string
  updated_at: string
  // Joins (opcional, em queries com select)
  emails?: EmailFlowEmail[]
  assignee?: { id: string; name: string; avatar_url: string | null } | null
  /**
   * Marcado pelo client (filterFlowsByMode) quando, em modo preview, o flow
   * não tem nenhum email-piloto liberado. UI renderiza como bloqueado visual
   * sem oferecer "Desbloquear" (não é bloqueio real do contrato).
   */
  preview_locked?: boolean
}

export interface EmailFlowEmail {
  id: string
  flow_id: string
  number: number
  name: string
  from_name: string | null
  from_email: string | null
  subject: string | null
  preheader: string | null
  html: string | null
  delay_hours: number | null
  status: EmailStatus
  progress_percent: number
  klaviyo_message_id: string | null
  created_at: string
  updated_at: string
  /**
   * Marcado em runtime (modo preview) quando o email nao esta na lista de
   * pilotos. UI renderiza com cadeado e desabilita selecao. Nunca persistido.
   */
  preview_locked?: boolean
  // ── Telemetria Epic AE (migration 20260530_agent_email_generation.sql) ──
  // Todas opcionais porque rows legacy nao tem esses valores.
  generation_batch_id?: string | null
  copy_started_at?: string | null
  copy_ready_at?: string | null
  rendering_started_at?: string | null
  qa_started_at?: string | null
  ready_at?: string | null
  failed_at?: string | null
  failure_reason?: string | null
  qa_issues?: QaIssue[]
  total_cost_cents?: number
  attempts?: number
  last_attempt_at?: string | null
  // Joins
  blocks?: EmailBlock[]
  qa_items?: EmailQAItem[]
}

// ── Blocks ──────────────────────────────────────────────────

export type BlockType =
  | "hero"
  | "text"
  | "coupon"
  | "products"
  | "footer"
  | "image"
  | "cta"
  | "divider"
  | "spacer"
  | "social"
  // ── Expansão welcome universal 2026-06 (20260627_block_types_expansion) ──
  | "header"
  | "headline"
  | "features"
  | "social_proof"
  | "testimonials"
  | "urgency"
  | "comparison"
  | "story"
  | "letter"

export interface EmailBlock {
  id: string
  email_id: string
  block_type: BlockType
  position: number
  label: string
  content: BlockContent
  applied: boolean
  applied_at: string | null
  applied_by: string | null
  created_at: string
}

// Conteúdo por tipo (uniões discriminadas)
export type BlockContent =
  | HeroBlockContent
  | TextBlockContent
  | CouponBlockContent
  | ProductsBlockContent
  | FooterBlockContent
  | ImageBlockContent
  | CtaBlockContent
  // ── Expansão welcome universal 2026-06 ──
  | HeaderBlockContent
  | HeadlineBlockContent
  | FeaturesBlockContent
  | SocialProofBlockContent
  | TestimonialsBlockContent
  | UrgencyBlockContent
  | ComparisonBlockContent
  | StoryBlockContent
  | LetterBlockContent
  | Record<string, never>

export interface HeroBlockContent {
  eyebrow?: string
  headline?: string
  body?: string
  image_url?: string
  image_alt?: string
  cta_text?: string
  cta_url?: string
  // ── AE-16: per-block image instruction + last-gen telemetry ─────
  // `image_instruction` é apendado ao prompt mestre (não substitui).
  // `image_last_generated_at` é o timestamp ISO da última regeração
  // por bloco (usado como rate-limit de 30s sem tabela nova).
  // `image_last_prompt` é snapshot truncado (2KB) do prompt final
  // resolvido — pra debug colaborativo dev+designer.
  image_instruction?: string
  image_last_generated_at?: string
  image_last_prompt?: string
}

export interface TextBlockContent {
  headline?: string
  body?: string
}

export interface CouponBlockContent {
  code?: string
  hint?: string
  cta_text?: string
  cta_url?: string
  expires_at?: string
}

export interface ProductsBlockContent {
  title?: string
  products?: Array<{
    id?: string
    name: string
    price: number | string
    image_url: string
    url?: string
    cta_text?: string
  }>
}

export interface FooterBlockContent {
  columns?: Array<{
    title?: string
    links?: Array<{ label: string; url: string }>
  }>
  social?: Array<{ platform: string; url: string }>
  copyright?: string
  unsubscribe_url?: string
}

export interface ImageBlockContent {
  image_url: string
  image_alt?: string
  link_url?: string
  // ── AE-16: per-block image instruction + last-gen telemetry ─────
  // Mesma semantica do HeroBlockContent — ver comentario la em cima.
  image_instruction?: string
  image_last_generated_at?: string
  image_last_prompt?: string
}

export interface CtaBlockContent {
  text: string
  url: string
  style?: "primary" | "secondary" | "ghost"
}

// ── Block contents (expansão welcome universal 2026-06) ───────────────
// Schemas mínimos práticos — apenas campos que `renderEmailHtml` lê
// no preview interno. A Fase 2 (LLM html.chain) é prompt-based e
// aceita qualquer estrutura via JSONB.

export interface HeaderBlockContent {
  logo_url?: string
  tagline?: string
}

export interface HeadlineBlockContent {
  eyebrow?: string
  headline?: string
}

export interface FeaturesBlockContent {
  items?: Array<{ icon?: string; label: string }>
}

export interface SocialProofBlockContent {
  number?: string
  label?: string
  rating?: number
  body?: string
}

export interface TestimonialsBlockContent {
  headline?: string
  items?: Array<{ author: string; quote: string; rating?: number }>
}

export interface UrgencyBlockContent {
  headline?: string
  body?: string
}

export interface ComparisonBlockContent {
  headline?: string
  us_label?: string
  them_label?: string
  rows?: Array<{ label: string; us: string; them: string }>
}

export interface StoryBlockContent {
  headline?: string
  body?: string
  cta_text?: string
  cta_url?: string
  image_url?: string
}

export interface LetterBlockContent {
  greeting?: string
  body?: string
  signoff?: string
  author?: string
}

// ── QA Checklist ────────────────────────────────────────────

export interface EmailQAItem {
  id: string
  email_id: string
  position: number
  label: string
  category: "content" | "design" | "tech" | "compliance" | null
  done: boolean
  done_at: string | null
  done_by: string | null
  notes: string | null
  created_at: string
}
