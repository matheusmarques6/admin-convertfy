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
  // Natureza do valor final (épico Taguedor): copy = n8n escreve ·
  // imagem_gerada = agente de imagem cria · asset_fixo = arte da
  // biblioteca intacta. Ausente (snapshots antigos) → derivação por tipo
  // (deriveFieldNature: image → imagem_gerada; resto → copy).
  nature?: FieldNature
  max_len: number
  min_len: number | null
  required: boolean
  example: string
  guidance: string
  // O EXAMPLE é o endereço (20/08): a `tag` saiu do snapshot — o merge
  // ancora pela frase do example (texto) e pelo token de atributo (imagem).
  // Snapshots antigos podem carregar `tag`/"tag_registry" no jsonb; são
  // ignorados na leitura.
  source: "schema" | "llm"
  // ── Só para type="image" (opcionais) — snapshot do output_schema +
  // comentário do slot extraído do HTML da variante. Dirigem a geração de
  // imagem (IMAGE_SLOTS + resize por dimensões declaradas). ──────────────
  image_spec?: string | null
  image_aspect?: string | null
  image_width?: number | null
  image_height?: number | null
  // Comentário HTML (<!-- … -->) do <td>/<tr> que envolve o {{TAG}} de
  // imagem na variante — direção de arte do designer, colada no slot.
  slot_note?: string | null
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
  // Fio narrativo do Estruturador (fase 3, modo 'on') — só existe em
  // store_email_blueprints (migration 20261083). Opcional: rows globais e
  // legadas passam pelo mesmo cast; consumidores caem no `messaging`.
  fio_narrativo?: string | null
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
  // estruturador: decide o esqueleto do email adaptando o vault de
  // conhecimento à loja (fase 1, antes do Curador — ADR
  // adr-estruturador-adaptativo). Fase 2: shadow.
  | "estruturador"
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
  // ── Cadeia de formatação (split do agente HTML, migration 20261039) ──
  // Substituem 'html' (e 'refiner') no runtime — os dois valores legados
  // permanecem no union pra exibir runs/configs históricos.
  // hero_section: monta a hero a partir da variante escolhida pelo Montador
  //   (html + rendered_html como gold reference); output = só o fragmento.
  // text_format: posiciona a copy do n8n no documento inteiro (doc completo).
  // image_format: posiciona as imagens geradas (output = JSON de ops).
  // color_format: cores do email + botões na paleta aprovada (substitui o
  //   Refinador; output = JSON de ops replace; fail-open).
  | "hero_section"
  | "text_format"
  | "image_format"
  | "color_format"
  // copy_fit: encurta a copy que o n8n devolveu acima do max_len do slot
  //   (migration 20261089). Roda no callback, antes da fase 2; a saída é
  //   proposta — quem aceita é o código (`aceitarReescrita`).
  | "copy_fit"
  // component_tagger e merge_verifier morreram em 20/08 (merge por
  // example): saíram do union — runs históricas renderizam pelo
  // AGENT_VISUAL legado, e config órfã no banco não é lida.

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
  // Par texto/fundo abaixo do mínimo AA (luminância WCAG, custo zero).
  // Nasceu do botão que saiu #FFFFFF sobre #FAF5F3 (1,05:1) sem nenhum
  // aviso em lugar nenhum do pipeline.
  | "contraste_baixo"
  // Copy da hero que o guard reprovou e que seguiu assim mesmo (última
  // tentativa). Antes de 01/09 isso matava o email: cinco gerações
  // inteiras foram para o lixo por falso positivo do critério contíguo.
  // Agora o email existe e o problema fica marcado na tela — se um dia
  // for perda REAL, o operador vê em vez de receber "failed" sem email.
  | "hero_copy_perdida"
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
  /** email_blocks.id do bloco apontado (F5 — views por bloco). Aditivo:
   *  issues antigas seguem válidas sem o campo. */
  block_id?: string | null
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
  // Verificador de merge (7b, migration 20261043): 'on_flag' = roda só
  // quando o relatório do copy_merge acusa algo (default); 'always' = toda
  // geração; 'off' = fila mecânica decide (kill-switch sem deploy).
  merge_verifier_mode: "always" | "on_flag" | "off"
  // Estruturador: 'off' = nem roda; 'shadow' = roda e grava o embasamento
  // sem alterar o pipeline; 'on' = a decisão dele passa a mandar na escolha
  // do Curador — e o reuso da arquitetura é desligado (a estrutura é
  // decidida a cada geração).
  estruturador_mode: "off" | "shadow" | "on"
  updated_at: string
  updated_by: string | null
}

export type GenerationRunStatus = "running" | "success" | "error" | "skipped"
export type GenerationRunAgent =
  | "estruturador"
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
  // Cadeia de formatação (split do HTML agent, migration 20261039).
  | "hero_section"
  | "text_format"
  | "image_format"
  | "color_format"
  // Merge determinístico de copy (por EXAMPLE desde 20/08): estágio de
  // CÓDIGO, sem LLM; run próprio pra metrificação campo a campo.
  | "copy_merge"
  // copy_fit: encurtador da copy acima do limite (migration 20261089).
  | "copy_fit"

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
  // Proveniência (migration 20261085) — ver shared/prompt-provenance.ts.
  // Opcionais: selects antigos não trazem as colunas.
  prompt_segments?: Record<string, unknown>[] | null
  input_summary?: Record<string, unknown>[] | null
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
// Natureza do campo (épico Taguedor): quem produz o valor final.
// copy = n8n escreve · imagem_gerada = agente de imagem cria · asset_fixo =
// arte da biblioteca fica intacta (só texto sobreposto muda, se for campo).
// Ausente → derivação: type='image' → imagem_gerada; senão copy.
export type FieldNature = "copy" | "imagem_gerada" | "asset_fixo"

export interface ComponentOutputField {
  key: string
  label: string
  type: ComponentFieldType
  nature?: FieldNature
  max_len: number
  required: boolean
  example: string
  guidance: string
  // ── Só para type="image" (opcionais) ────────────────────────────────
  // Especificidade da imagem: o que ela deve transmitir. Junto de aspecto
  // e dimensões, é dobrado no image_brief enviado ao agente de imagem
  // (imageBriefFromSchema). Proporção é texto livre (ex.: "16:9");
  // largura/altura em px.
  image_spec?: string | null
  image_aspect?: string | null
  image_width?: number | null
  image_height?: number | null
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
  /**
   * sha256 do `html` no momento em que `rendered_html` foi salvo (CM-6).
   * Diferente do hash do html atual = exemplo desatualizado, não vai ao
   * agente. NULL = cadastrado antes do controle (validade desconhecida).
   */
  rendered_html_source_sha?: string | null
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
  /**
   * Regras de DESIGN/implementação desta variante, para o agente que a
   * finaliza (hoje só o hero_section). Diferente de `copy_guidance`, que
   * orienta a ESCRITA: aqui vão hierarquia, bandas de fundo intencionais,
   * acabamento de botão, comportamento no mobile, o que nunca sai.
   */
  design_system: string | null
  /**
   * Direção FOTOGRÁFICA desta variante, para o agente de imagem: luz,
   * enquadramento, distância, modelo, cenário, tratamento de cor, o que
   * deixar limpo para a copy. Diferente de `image_brief`, que diz O QUE
   * mostrar — aqui é COMO fotografar.
   */
  photo_direction: string | null
  // Nº de produtos que o bloco comporta (grade 2x2 = 4; 0 = nenhum).
  product_slots: number
  output_schema: ComponentOutputField[]
  tags: string[]
  thumbnail: string | null
  is_active: boolean
  version: number
  created_at: string
  created_by: string | null
  // As colunas do épico Taguedor (html_tagged/tagging_status/tagging_meta)
  // saíram do tipo em 20/08 — o merge por example matou a camada tagueada.
  // A migration APPLY_MANUALLY_drop_tagged_columns.sql derruba as colunas.
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
   * Código de cupom padrão deste email (global). A variação por idioma/loja é
   * feita depois, por loja, no bloco `coupon`. Usado como default do bloco
   * `coupon` quando ainda está vazio. `null` = email sem cupom.
   */
  coupon_code: string | null
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

// Escolha do Curador/Montador por parte do email, persistida em
// store_email_references.slot_map (migration 20261039). Missing →
// variant_id/variant_name null. Fonte primária do agente hero_section.
export interface ReferenceSlotMapEntry {
  block_index: number
  section: string
  label: string
  variant_id: string | null
  variant_name: string | null
  /**
   * A seção entrou de fato no documento montado.
   *
   * `variant_id` não basta como proxy: a montagem também descarta variante
   * com HTML vazio ou fragmento irrecuperável (`empty_html`,
   * `invalid_fragment`), e nesses casos o slot tem variante e mesmo assim
   * a seção não existe no email. Ausente (slot_map anterior a ago/2026) →
   * o consumidor não filtra, para não descartar tudo por falta de dado.
   */
  assembled?: boolean
}

// Reference HTML GERADO por (loja × email). Ocupa o papel do reference_html
// consumido pela cadeia de formatação (build-vars.ts), com fallback ao
// template global.
export interface StoreEmailReference {
  id: string
  store_id: string
  flow_type: string
  email_number: number
  html: string
  variant_ids: string[]
  slot_map: ReferenceSlotMapEntry[] | null
  source: GeneratedSource
  model: string | null
  version: number
  created_at: string
  updated_at: string
}
