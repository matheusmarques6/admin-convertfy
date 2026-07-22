// Orçamento de caracteres de UM campo de copy de um bloco (JSONB
// blocks[].copy_spec). Derivado da geometria do template pelo Blueprint
// agent (fórmula em src/lib/email-workspace/copy-spec.ts) ou do default
// canônico por block_type. Enviado ao n8n no payload de copy para o
// gerador respeitar o layout (headline nunca vira parágrafo).
export interface CopySpecField {
  key: string
  min_chars: number
  max_chars: number
}

// Um campo do contrato v2 do payload de copy (blueprint híbrido, JSONB
// blocks[].fields). Snapshot congelado na geração: origem "schema" =
// output_schema da variante casada; "tag_registry" = derivado das tags
// canônicas; "llm" = convertido do copy_spec do Blueprint LLM. O n8n
// recebe SEMPRE este shape, independente da rota.
export interface BlueprintBlockField {
  key: string
  label: string
  type: "text_short" | "text_long" | "number" | "url" | "image" | "boolean"
  max_len: number
  min_len: number | null
  required: boolean
  example: string
  guidance: string
  tag: string | null
  source: "schema" | "tag_registry" | "llm"
}

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
  // Orçamento min/max de caracteres por campo de copy. Opcional para
  // retrocompat — blueprints gravados antes do copy_spec caem no default
  // canônico por tipo (normalizeCopySpec).
  copy_spec?: CopySpecField[] | null
  // Tags canônicas {{TAG}} do reference que compõem este bloco (docs/
  // email-reference-tags.md), na forma indexada real ({{PRODUCT_1_NAME}}).
  // Preenchidas pelo esqueleto determinístico (applySkeletonToBlueprint);
  // ausentes em blueprints legados/fallback. Enviadas ao n8n para matching
  // 1:1 campo↔template.
  tags?: string[]
  // Proporção de geração da imagem DESTE bloco (AspectKey) — derivada das
  // tags de imagem do template (tag-registry). Prioridade máxima na fase 2.
  image_aspect?: string | null
  // ── Blueprint híbrido (migration 20261022) ──────────────────────────
  // Variante do Curador casada a este bloco + snapshot fields v2 (contrato
  // único do payload n8n). Ausentes em blueprints legados.
  variant_id?: string | null
  variant_name?: string | null
  fields?: BlueprintBlockField[]
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
  // Email "somente texto" (flag GLOBAL, só em email_blueprints — nunca em
  // store_email_blueprints): pula Montador/Blueprint por loja, n8n recebe
  // estrutura geral + text_only, e o email vai copy->ready sem imagem/HTML.
  // Opcional: rows de store_email_blueprints passam pelo mesmo cast.
  text_only?: boolean
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
  // assembler: harmoniza (passo B) — recebe os HTMLs das variantes escolhidas.
  // assembler_chooser: escolhe (passo A) — 1 variant_id por seção, pela descrição.
  | "blueprint"
  | "assembler"
  | "assembler_chooser"
  // ── Central de Campanhas ────────────────────────────────
  // campaign_suggestion: gera sugestões de campanha por ciclo semanal.
  // campaign_trends: captura tendências por país via web search.
  // campaign_architect: arquiteto de estrutura (Single Day) — gera blueprint
  //   de blocos (FIXO/PREENCHER/DINAMICO) que o redator depois preenche.
  | "campaign_suggestion"
  | "campaign_trends"
  | "campaign_architect"
  // campaign_image: arte por loja — gera imagens de campanha adaptadas à marca
  // de cada loja-alvo (etapa de produção). Reusa o agente de imagem do pipeline
  // de email via generateEmailImage (config-driven).
  | "campaign_image"
  // refiner: Refinador Tipográfico — roda entre o HTML agent e o QA na
  // fase 2. Aplica a "voz da marca" na fonte de DISPLAY (nome da marca,
  // headline do herói) via delta JSON aplicado mecanicamente (nunca
  // reescreve HTML). 3 estratégias: serifada (luxo), sans com
  // personalidade (moda) ou mono-fonte com contraste de peso.
  | "refiner"
  // component_test: teste ad-hoc de uma variante da biblioteca (aba
  // Componentes → "Testar com IA"): gera os campos do output_schema a
  // partir de um briefing curto, sem tocar em emails reais.
  | "component_test"
  // subject: mini-LLM barato da rota determinística do blueprint híbrido —
  // gera subject_hint + messaging adaptados à loja (única contribuição
  // criativa de nível-email que sobrou do antigo Blueprint LLM).
  | "subject"

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
  // ── Validação determinística contra o output_schema da variante ─────
  // (blueprint.blocks[].fields, blueprint híbrido): copy estourando o
  // max_len do campo / campo required vazio. Custo zero (sem LLM).
  | "copy_excede_max_len"
  | "campo_obrigatorio_vazio"

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
  // Parâmetros globais do pipeline (migration 20261005).
  // qa_vision_enabled: NULL = respeita env EMAIL_QA_VISION_ENABLED.
  qa_vision_enabled: boolean | null
  refiner_enabled: boolean
  max_blocks_per_email: number
  default_model: string | null
  // Câmbio US$→R$ nos logs (NULL = cotação online com cache).
  usd_brl_rate: number | null
  // Alerta por execução acima deste custo (US$). NULL = sem alerta.
  cost_alert_usd: number | null
  // Rota do blueprint híbrido: 'auto' = determinístico quando skeleton OK +
  // cobertura 100%, senão LLM; 'llm' força o fallback; 'deterministic'
  // força o builder (migration 20261022).
  blueprint_mode: "auto" | "llm" | "deterministic"
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
  | "assembler_chooser"
  // copy_dispatch: telemetria do disparo de copy pro n8n (email-copy-webhook).
  // Já aceito pelo CHECK do banco (migration 20260728) — incluído aqui pra
  // restaurar a paridade union↔CHECK.
  | "copy_dispatch"
  // campaign_image: arte por loja (Central de Campanhas) loga um run por
  // imagem em email_generation_runs pra aparecer na página de logs.
  | "campaign_image"
  // refiner: Refinador Tipográfico (fase 2, entre html e qa).
  | "refiner"
  // component_test: teste ad-hoc de variante da biblioteca (aba Componentes).
  | "component_test"
  // subject: mini-LLM de subject/messaging (rota determinística do blueprint).
  | "subject"

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

// Tipo de campo do output_schema de uma variante (slug no banco; rótulo PT
// na UI via FIELD_TYPE_LABELS_PT de component-dimensions.ts).
export type ComponentFieldType =
  | "text_short"
  | "text_long"
  | "number"
  | "url"
  | "image"
  | "boolean"

// Um campo que a IA gera para o bloco. Alimenta o preview da variante e as
// orientações de copy no prompt.
export interface ComponentOutputField {
  key: string
  label: string
  type: ComponentFieldType
  max_len: number
  required: boolean
  example: string
  guidance: string
}

// Biblioteca global de variantes de componente, catalogadas por block_type.
// As dimensões de matching (objectives/tones/density) alimentam o pré-filtro
// determinístico do assembler antes da escolha final pelo LLM.
export interface EmailComponentVariant {
  id: string
  block_type: string
  name: string
  html: string
  // Exemplo real do email renderizado, colado manualmente no editor
  // (aba "HTML renderizado"). Não é usado pelo pipeline.
  rendered_html: string | null
  // Descrição curta (sem HTML) da variante. Usada pelo passo A do Montador
  // (escolha por descrição, barato) para escolher a variante sem mandar o HTML
  // completo de todas. Null quando ainda não preenchida.
  description: string | null
  // Notas de implementação longas (quirks de Outlook, hospedagem de asset...).
  long_description: string | null
  slots: string[]
  // DEPRECADO (jul/2026): substituídas por objectives/tones. As colunas ainda
  // existem no banco até a migration de limpeza; não usar em código novo.
  niche_affinity: string[]
  positioning: string[]
  mood: string[]
  // Novas dimensões de matching (rótulos PT — ver component-dimensions.ts).
  objectives: string[]
  tones: string[]
  density: ComponentDensity | null
  // Contexto para a IA (Curador escolhe melhor; Copy escreve melhor).
  when_use: string | null
  when_not_use: string | null
  copy_guidance: string | null
  // Nº de produtos que o bloco comporta (grade 2x2 = 4; 0 = nenhum).
  product_slots: number
  output_schema: ComponentOutputField[]
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
  /**
   * Códigos de cupom literais por idioma da loja (ex:
   * `{ "pt-BR": "BEMVINDO10", "en": "WELCOME10" }`). O pipeline escolhe pelo
   * idioma efetivo da loja; idioma ausente => sem cupom injetado.
   */
  coupon_codes: Record<string, string>
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
