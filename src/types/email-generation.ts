export interface BlueprintBlock {
  type: string
  label: string
  // Descrição/intenção do bloco. MESMA chave que `BlueprintBlockDef.purpose`
  // (email-blueprint.ts) — é o que os dados (consts, migrations e a UI)
  // gravam no JSONB `email_blueprints.blocks`. Antes era lido como `hint`
  // (chave inexistente) e vinha sempre vazio.
  purpose?: string
  // Prompt da imagem deste bloco (JSONB blocks[].image_brief). Lido por
  // buildImagePromptVars → var IMAGE_BRIEF, casando pela posição do bloco.
  image_brief?: string | null
}

export interface EmailBlueprint {
  id: string
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: BlueprintBlock[]
  tone_override: string | null
  updated_at: string
  updated_by: string | null
  // ── Epic AE-Image Niche-Adaptive (story AE-10) ───────────
  // Briefing visual por blueprint (slot E1..E6). Opcional para
  // retrocompat com rows legacy criados antes da migration
  // 20260601_image_agent_niche_adaptive.sql.
  image_brief?: string | null
  image_aspect?: "4:5" | "3:5" | "4:3" | "1:1" | "3:4" | null
  image_mode?: "auto" | "product_ref" | "text2img" | null
  image_overlay_reserve_bottom?: boolean | null
  image_produto_heroi_hint?: string | null
}

// ── Epic AE-Image Niche-Adaptive (story AE-10) ──────────────
// Overrides manuais por loja. Override sempre vence helpers de
// derivação (mood/cenario/neutro/logo_style/produto_heroi).
export interface StoreImageOverrides {
  store_id: string
  cenario_override?: string | null
  produto_heroi_override?: string | null
  produto_heroi_image_url?: string | null
  logo_style_override?: string | null
  neutro_override?: string | null
  mood_override?: string | null
  updated_at?: string
}

export type AgentType =
  | "copy"
  | "image"
  | "html"
  | "qa"
  // ── Epic AE: Component Assembler ────────────────────────
  // blueprint: gera a estrutura detalhada do email a partir do outline.
  // assembler: escolhe variantes de componente e monta o reference HTML.
  | "blueprint"
  | "assembler"
  // ── Central de Campanhas ────────────────────────────────
  // campaign_suggestion: gera sugestões de campanha por ciclo semanal.
  // campaign_trends: captura tendências por país via web search.
  // campaign_architect: arquiteto de estrutura (Single Day) — gera blueprint
  //   de blocos (FIXO/PREENCHER/DINAMICO) que o redator depois preenche.
  | "campaign_suggestion"
  | "campaign_trends"
  | "campaign_architect"

// ── QA Agent (Epic AE) ─────────────────────────────────────
// Espelha o output do qa.chain.ts. Persistido em
// email_flow_emails.qa_issues (JSONB DEFAULT '[]').
export type QaIssueSeverity = "low" | "medium" | "high"

export type QaIssueType =
  | "spam_score_alto"
  | "links_quebrados"
  | "blocos_vazios"
  | "tom_inconsistente"
  | "claim_nao_coberto"
  | "html_invalido"
  | "alt_text_faltando"
  | "compliance"
  // ── Epic AE-15: Image niche-adaptive QA cascade ───────
  // image_nicho_mismatch: Etapa 1 (gratis) — alt_text vs PRODUTO_HEROI
  // image_paleta_off, image_overlay_reserva_ausente, image_cena_inadequada:
  //   Etapa 2 (Claude vision, dispara so se EMAIL_QA_VISION_ENABLED=true).
  | "image_nicho_mismatch"
  | "image_paleta_off"
  | "image_overlay_reserva_ausente"
  | "image_cena_inadequada"

export interface QaIssue {
  type: QaIssueType
  severity: QaIssueSeverity
  message: string
  location?: string
}

// Resultado do QA agent (story AE-5).
// `meta.model = 'noop'` quando degradado seguro (config ausente).
// `meta.model = 'qa-timeout'` quando estourou o timeout do Claude call.
export interface QaResultMeta {
  model: string
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
}

export interface QaResult {
  passed: boolean
  issues: QaIssue[]
  meta: QaResultMeta
}

export interface EmailAgentConfig {
  id: string
  agent_type: AgentType
  model: string
  system_prompt: string
  user_template: string
  temperature: number
  max_tokens: number
  output_schema: Record<string, unknown> | null
  version: number
  is_active: boolean
  created_at: string
  created_by: string | null
}

export interface EmailGenerationSettings {
  id: string
  org_id: string
  auto_trigger: boolean
  max_parallel: number
  generate_images: boolean
  notify_on_error: boolean
  notify_on_success: boolean
  notify_emails: string[]
  updated_at: string
  updated_by: string | null
}

export type GenerationRunStatus = "running" | "success" | "error" | "skipped"
export type GenerationRunAgent =
  | "seed"
  | "copy"
  | "image"
  | "html"
  | "qa"
  | "blueprint"
  | "assembler"

export interface EmailGenerationRun {
  id: string
  store_id: string
  flow_id: string | null
  email_id: string | null
  triggered_by: string | null
  batch_id: string | null
  agent: GenerationRunAgent
  agent_config_id: string | null
  status: GenerationRunStatus
  input_vars: Record<string, unknown> | null
  rendered_prompt: string | null
  raw_output: string | null
  parsed_output: Record<string, unknown> | null
  model: string | null
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
  error_message: string | null
  error_stack: string | null
  retry_count: number
  created_at: string
  // Joined fields
  store_name?: string
  flow_type?: string
  email_name?: string
}

export type ImageMapType = "logo" | "product" | "hero" | "icon" | "decorative" | "custom"

export interface ImageMapEntry {
  src: string
  alt: string
  width: number | null
  height: number | null
  type: ImageMapType
  product_index?: number
  instruction?: string | null
  image_prompt?: string | null
}

export interface EmailReferenceTemplate {
  id: string
  flow_type: string | null
  email_number: number | null
  name: string
  html: string | null
  copy: string | null
  image_map: ImageMapEntry[] | null
  thumbnail: string | null
  tags: string[]
  is_active: boolean
  created_at: string
  created_by: string | null
}

// ── Epic AE: Component Assembler (blueprint + reference por loja × email) ──
export type ComponentDensity = "minimal" | "balanced" | "rich"
export type GeneratedSource = "ai" | "manual"

// Biblioteca global de variantes de componente, catalogadas por block_type.
// As dimensões de matching (niche_affinity/positioning/mood/density) alimentam
// o pré-filtro determinístico do assembler antes da escolha final pelo LLM.
export interface EmailComponentVariant {
  id: string
  block_type: string
  name: string
  html: string
  slots: string[]
  niche_affinity: string[]
  positioning: string[]
  mood: string[]
  density: ComponentDensity | null
  tags: string[]
  thumbnail: string | null
  is_active: boolean
  version: number
  created_at: string
  created_by: string | null
}

// Estrutura geral (INPUT) por email do flow — global, curável. Consumida
// somente pelo agente gerador, que a expande no blueprint detalhado.
export interface EmailOutlineTemplate {
  id: string
  flow_type: string
  email_number: number
  objective: string
  guidance: string | null
  suggested_blocks: string[]
  tone_hint: string | null
  is_active: boolean
  version: number
  created_at: string
  created_by: string | null
}

// Blueprint detalhado GERADO por (loja × email). Mesmo shape lógico de
// EmailBlueprint, porém escopado à loja e com proveniência (source).
export interface StoreEmailBlueprint {
  id: string
  store_id: string
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: BlueprintBlock[]
  image_brief: string | null
  image_mode: "auto" | "product_ref" | "text2img" | null
  image_aspect: "4:5" | "3:5" | "4:3" | "1:1" | "3:4" | null
  source: GeneratedSource
  model: string | null
  version: number
  created_at: string
  updated_at: string
}

// Reference HTML GERADO por (loja × email). Ocupa o papel do reference_html
// consumido pelo HTML agent (build-vars.ts), com fallback ao template global.
export interface StoreEmailReference {
  id: string
  store_id: string
  flow_type: string
  email_number: number
  html: string
  variant_ids: string[]
  source: GeneratedSource
  model: string | null
  version: number
  created_at: string
  updated_at: string
}
