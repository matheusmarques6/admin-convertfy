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
  | "abandoned_cart"
  | "browse_abandonment"
  | "post_purchase"
  | "win_back"
  | "custom"

export type FlowStatus =
  | "blocked"
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "live"

export type EmailStatus = "draft" | "in_progress" | "ready" | "approved" | "live"

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
  | Record<string, never>

export interface HeroBlockContent {
  eyebrow?: string
  headline?: string
  body?: string
  image_url?: string
  image_alt?: string
  cta_text?: string
  cta_url?: string
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
}

export interface CtaBlockContent {
  text: string
  url: string
  style?: "primary" | "secondary" | "ghost"
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
