"use client"

/**
 * PromptEditor — editor da versão ativa.
 *
 * Salvar cria SEMPRE nova versão (is_active=false). Para ativar, usar a
 * lista de histórico (botão "Ativar" → confirm modal).
 *
 * Painel lateral mostra os placeholders disponíveis por agent_type
 * (lista estática hardcoded). Botão "Validar template" extrai `{{var}}`
 * e cruza com a lista — avisa quando há vars não suportadas.
 */
import { useState, useMemo, useEffect } from "react"
import { Loader2, Save, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import type { AgentType } from "@/types/email-generation"
import type { PromptRow } from "@/lib/services/prompt-management.service"
import {
  HTML_PROMPT_VAR_KEYS,
  HTML_PROMPT_VAR_DESCRIPTIONS,
} from "@/lib/agents/html/contract"

// ── Placeholders suportados por agent_type ────────────────
// Lista mantida em sincronia com `email-generation.service.ts::buildAllVars`.
// Edits aqui são lightweight (somente sidebar informativa + validador).
const PLACEHOLDERS_BY_AGENT: Record<AgentType, Array<{ key: string; desc: string }>> = {
  estruturador: [
    { key: "intencao_flow", desc: "Intenção do flow (vault, system)" },
    { key: "progressao", desc: "Progressão observada (vault, system)" },
    { key: "referencias", desc: "Estruturas validadas embrulhadas por slug (system)" },
    { key: "aprendizados", desc: "Aprendizados embrulhados por slug (system)" },
    { key: "brand_name", desc: "Nome da loja" },
    { key: "nicho", desc: "Nicho (ou marcador de ausência)" },
    { key: "posicionamento", desc: "Posicionamento" },
    { key: "tom_voz", desc: "Tom de voz" },
    { key: "persona", desc: "Persona (texto)" },
    { key: "produtos_count", desc: "Quantos produtos a loja tem" },
    { key: "top_products", desc: "Top produtos (nomes)" },
    { key: "pesquisa", desc: "Pesquisa & Diagnóstico serializada" },
    { key: "flow_type", desc: "Flow do email" },
    { key: "email_number", desc: "Número do email no flow" },
    { key: "intencao_email", desc: "Intenção deste email (vault)" },
    { key: "capacidade_biblioteca", desc: "Categorias construíveis + produtos" },
    {
      key: "estruturas_dos_outros_emails",
      desc: "Estruturas vigentes dos outros emails do flow (variedade)",
    },
  ],
  copy: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho do negócio" },
    { key: "persona", desc: "Persona-alvo" },
    { key: "diferencial", desc: "Diferencial competitivo" },
    { key: "slogan", desc: "Slogan da marca" },
    { key: "tom_voz", desc: "Tom de voz" },
    { key: "posicionamento", desc: "Posicionamento" },
    { key: "top_products", desc: "Lista de produtos top" },
    { key: "flow_type", desc: "Tipo do flow (welcome, abandoned_cart, ...)" },
    { key: "email_number", desc: "Número do email no flow (1, 2, 3)" },
    { key: "objective", desc: "Objetivo do email (do blueprint)" },
    { key: "messaging", desc: "Mensagem central (do blueprint)" },
    { key: "blocks_spec", desc: "Spec dos blocos (JSON do blueprint)" },
    { key: "reference_copy", desc: "Cópia de referência" },
  ],
  image: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho" },
    { key: "primary_colors", desc: "Cores primárias da marca" },
    { key: "secondary_colors", desc: "Cores secundárias" },
    { key: "color_names", desc: "Nomes das cores em PT" },
    { key: "font_heading", desc: "Fonte de heading" },
    { key: "logo_url", desc: "URL do logo" },
    { key: "top_products", desc: "Produtos destacados" },
    { key: "product_1_name", desc: "Nome do produto 1" },
    { key: "product_2_name", desc: "Nome do produto 2" },
    { key: "block_purpose", desc: "Propósito do bloco (hero, etc)" },
  ],
  // Fonte unica: `HTML_PROMPT_VAR_KEYS` + descricoes em
  // `src/lib/agents/html/contract.ts`. Mudou a lista la, mudou aqui.
  html: HTML_PROMPT_VAR_KEYS.map((key) => ({
    key,
    desc: HTML_PROMPT_VAR_DESCRIPTIONS[key],
  })),
  qa: [
    { key: "brand_name", desc: "Nome da loja" },
    { key: "html", desc: "HTML completo a validar" },
    { key: "copy", desc: "Texto/copy parseado" },
    { key: "flow_type", desc: "Tipo do flow" },
    { key: "email_number", desc: "Número do email" },
    { key: "claims", desc: "Lista de claims/promessas extraídas" },
  ],
  // ── Epic AE: Component Assembler ────────────────────────
  blueprint: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho do negócio" },
    { key: "posicionamento", desc: "Posicionamento de preço" },
    { key: "persona", desc: "Persona-alvo (ICP)" },
    { key: "tom_voz", desc: "Tom de voz" },
    { key: "flow_type", desc: "Tipo do flow" },
    { key: "email_number", desc: "Número do email no flow" },
    { key: "outline_objective", desc: "Objetivo geral do email (outline)" },
    { key: "outline_guidance", desc: "Diretriz da estrutura (outline)" },
    { key: "allowed_block_types", desc: "Tipos de bloco permitidos" },
    { key: "reference_html", desc: "HTML montado pelo Montador (extrair daqui)" },
    { key: "pesquisa_diagnostico", desc: "Pesquisa & Diagnóstico (marca/ICP/tom/ads)" },
  ],
  // Passo A — Curador: escolhe variant_id por seção SÓ pela descrição (sem html).
  assembler_chooser: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho do negócio" },
    { key: "posicionamento", desc: "Posicionamento de preço" },
    { key: "persona", desc: "Persona-alvo (ICP)" },
    { key: "tom_voz", desc: "Tom de voz" },
    { key: "outline_objective", desc: "Objetivo geral do email (outline)" },
    { key: "outline_guidance", desc: "Diretriz da estrutura (outline)" },
    { key: "outline_tone_hint", desc: "Tom sugerido (outline)" },
    { key: "blocks_json", desc: "Seções do outline (ordenadas)" },
    { key: "candidates_json", desc: "Candidatos por seção (id, nome, descrição, quando usar/NÃO usar, objectives, tones, density, product_slots — SEM html)" },
  ],
  // Passo B — Montador: recebe o HTML das variantes ESCOLHIDAS e monta.
  assembler: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho do negócio" },
    { key: "posicionamento", desc: "Posicionamento de preço" },
    { key: "persona", desc: "Persona-alvo (ICP)" },
    { key: "tom_voz", desc: "Tom de voz" },
    { key: "mood", desc: "Mood derivado do tom de voz" },
    { key: "briefing_json", desc: "Briefing da marca (JSON)" },
    { key: "pesquisa_diagnostico", desc: "Pesquisa & Diagnóstico (marca/ICP/tom/ads)" },
    { key: "outline_objective", desc: "Objetivo geral do email (outline)" },
    { key: "outline_guidance", desc: "Diretriz da estrutura (outline)" },
    { key: "outline_tone_hint", desc: "Tom sugerido (outline)" },
    { key: "reference_template_html", desc: "Referência curada do flow (guia, não copiar)" },
    { key: "chosen_html_json", desc: "HTML completo das variantes escolhidas (passo A)" },
    { key: "missing_blocks_json", desc: "Blocos sem variante na biblioteca (section+label) — puxar do reference padrão" },
  ],
  // Central de Campanhas — vars renderizadas por suggestion-engine.service
  campaign_suggestion: [
    { key: "cycle_range", desc: "Período do ciclo (início a fim)" },
    { key: "today", desc: "Data de hoje (YYYY-MM-DD)" },
    { key: "stores_json", desc: "Lojas do cluster (JSON)" },
    { key: "dates_json", desc: "Datas comemorativas na janela de 25d (JSON)" },
    { key: "attention_json", desc: "Lojas em atenção do cluster (JSON)" },
    { key: "benchmark_json", desc: "Emails campeões da rede Omnisend (JSON)" },
    { key: "trends_json", desc: "Temas em alta do ciclo (JSON)" },
  ],
  // Trends — vars renderizadas por trends.service:captureFromWebSearch
  campaign_trends: [
    { key: "country", desc: "Código do país do cluster (BR, US, DE…)" },
    { key: "search_language", desc: "Idioma em que pesquisar (Portuguese, German…)" },
    { key: "hints", desc: "Queries-template em idioma local" },
    { key: "niches", desc: "Nichos das lojas do cluster" },
    { key: "today", desc: "Data de hoje (YYYY-MM-DD)" },
    { key: "excluded_dates", desc: "Datas comerciais já no calendário (não repetir)" },
  ],
  // Arquiteto Single Day — gera blueprint de blocos (FIXO/PREENCHER/DINAMICO)
  // Vars renderizadas por campaign-architect.service:buildArchitectVars
  campaign_architect: [
    { key: "briefing", desc: "Perfil da marca (o que ela PODE entregar: frete, garantia, prova social)" },
    { key: "ideia_campanha", desc: "A oferta da campanha (ex.: '24h, X% OFF + VIP acaba hoje')" },
    { key: "produtos", desc: "Dados disponíveis pro grid (nome, preço de/por, prova social)" },
    { key: "blocos_disponiveis", desc: "Enum de blocos permitidos (PREHEADER, HERO, GRID_PRODUTOS, ...)" },
  ],
  // Imagens de campanha — arte por loja. Vars de buildImagePromptVars
  // (image/prompt-vars-builder) renderizadas por
  // campaign-image-generation.service por loja-alvo.
  campaign_image: [
    { key: "MARCA", desc: "Nome da loja/marca" },
    { key: "NICHO", desc: "Nicho do negócio" },
    { key: "PALETA_1", desc: "Cor primária da marca (hex)" },
    { key: "PALETA_2", desc: "Cor secundária da marca (hex)" },
    { key: "NEUTRO", desc: "Cor neutra derivada" },
    { key: "LOGO_STYLE", desc: "Estilo do logo derivado da fonte" },
    { key: "MOOD", desc: "Mood derivado do tom de voz" },
    { key: "PUBLICO", desc: "Persona-alvo (ICP)" },
    { key: "CENARIO", desc: "Cenário sugerido (nicho + posicionamento)" },
    { key: "PRODUTO_HEROI", desc: "Produto-herói (top product / override)" },
    { key: "IDIOMA", desc: "Idioma/contexto cultural da loja" },
    { key: "MOEDA", desc: "Moeda da loja" },
    { key: "INSTRUCAO_ADICIONAL", desc: "Instrução do lote + flags de adaptação + headline + notas de ajuste" },
  ],
  refiner: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "niche", desc: "Nicho do negócio" },
    { key: "locale", desc: "Idioma da loja" },
    { key: "current_font_heading", desc: "Fonte de heading da identidade visual" },
    { key: "current_font_body", desc: "Fonte de corpo da identidade visual" },
    { key: "email_name", desc: "Nome do email" },
    { key: "subject", desc: "Subject do email" },
    { key: "pesquisa_full_text", desc: "Pesquisa & Diagnóstico (5 pilares serializados)" },
    { key: "font_occurrences_json", desc: "Inventário numerado das ocorrências de font-family do HTML" },
    { key: "radius_occurrences_json", desc: "Inventário numerado de border-radius (CTAs/cards; <img> nunca entra)" },
    { key: "spacing_occurrences_json", desc: "Inventário numerado de espaçamentos verticais inline (padding/margin/height ≥ 8px)" },
    { key: "section_junctions_json", desc: "Junções numeradas entre as seções do wrapper 600px (pontos de inserção de spacer)" },
    { key: "font_whitelist", desc: "Whitelist de fontes por tom (injetada pelo código — fonte única em font-whitelist.ts)" },
  ],
  // Assunto — mini-LLM da rota determinística do blueprint (subject+messaging)
  subject: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "nicho", desc: "Nicho do negócio" },
    { key: "tom_voz", desc: "Tom de voz" },
    { key: "persona", desc: "Persona-alvo (ICP)" },
    { key: "flow_type", desc: "Tipo do flow" },
    { key: "email_number", desc: "Número do email no flow" },
    { key: "outline_objective", desc: "Objetivo do email (outline)" },
    { key: "outline_guidance", desc: "Diretriz do email (outline)" },
    { key: "tones", desc: "Tom sugerido (outline tone_hint)" },
    { key: "copy_guidance_resumo", desc: "Resumo das orientações de copy das variantes casadas" },
    { key: "top_products", desc: "Lista de produtos top" },
  ],
  // Teste de bloco — vars renderizadas por /api/admin/components/[id]/test
  component_test: [
    { key: "variant_name", desc: "Nome da variante testada" },
    { key: "section", desc: "Seção da biblioteca (rótulo humano)" },
    { key: "when_use", desc: "Quando usar (contexto da variante)" },
    { key: "copy_guidance", desc: "Orientações de copy da variante" },
    { key: "output_schema_json", desc: "Schema de campos da variante (JSON)" },
    { key: "store_context", desc: "Contexto da loja opcional (marca/nicho/tom)" },
    { key: "briefing", desc: "Briefing curto digitado no teste" },
  ],
  // ── Cadeia de formatação (split do HTML agent) ──────────
  // Vars renderizadas por build-vars.ts (buildHeroVars etc.).
  hero_section: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "locale", desc: "Idioma da loja" },
    { key: "montador_html", desc: "Documento completo do Montador (SÓ no modo full_doc; vazio no fragment)" },
    { key: "hero_region_html", desc: "Região da hero localizada no documento (o que editar)" },
    { key: "hero_variant_html", desc: "HTML da variante de hero escolhida (biblioteca)" },
    { key: "hero_variant_rendered_html", desc: "HTML RENDERIZADO da variante (gold reference)" },
    { key: "hero_variant_schema_json", desc: "output_schema da variante (semântica dos campos)" },
    { key: "hero_content_json", desc: "Copy da hero (n8n)" },
    { key: "hero_image_url", desc: "URL da imagem gerada da hero" },
    { key: "color_bg", desc: "Cor de fundo" },
    { key: "color_text", desc: "Cor do texto" },
    { key: "color_heading", desc: "Cor dos headings" },
    { key: "color_button_bg", desc: "Cor de fundo dos botões" },
    { key: "color_button_text", desc: "Cor do texto dos botões" },
    { key: "color_accent", desc: "Cor de destaque" },
    { key: "font_heading", desc: "Fonte de heading" },
    { key: "font_heading_weight", desc: "Peso da fonte de heading" },
    { key: "font_body", desc: "Fonte de corpo" },
    { key: "font_body_weight", desc: "Peso da fonte de corpo" },
    { key: "logo_light", desc: "Logo pra fundo claro (main→alt→monogram)" },
    { key: "logo_dark", desc: "Logo pra fundo escuro (reverse; vazio se não houver)" },
  ],
  text_format: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "locale", desc: "Idioma da loja" },
    { key: "html", desc: "Documento de output do agente Hero Section" },
    { key: "subject", desc: "Subject do email" },
    { key: "preheader", desc: "Preheader do email" },
    { key: "objective", desc: "Objetivo do email (blueprint)" },
    { key: "messaging", desc: "Mensagem central (blueprint)" },
    { key: "blocks_with_content_json", desc: "Copy por bloco (sem a hero)" },
    { key: "fields_json", desc: "Schema/fields por bloco (blueprint)" },
    { key: "color_bg", desc: "Cor de fundo" },
    { key: "color_text", desc: "Cor do texto" },
    { key: "color_heading", desc: "Cor dos headings" },
    { key: "color_button_bg", desc: "Cor de fundo dos botões" },
    { key: "color_button_text", desc: "Cor do texto dos botões" },
    { key: "color_accent", desc: "Cor de destaque" },
    { key: "font_heading", desc: "Fonte de heading" },
    { key: "font_heading_weight", desc: "Peso da fonte de heading" },
    { key: "font_body", desc: "Fonte de corpo" },
    { key: "font_body_weight", desc: "Peso da fonte de corpo" },
    { key: "top_products_json", desc: "Produtos top (nome/preço/url)" },
  ],
  image_format: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "image_slots_json", desc: "Views dos slots de imagem ({block_id, tag, row_html}) — o agente não vê o documento" },
    { key: "image_map_json", desc: "Imagens geradas por slot (sem a hero)" },
    { key: "logo_candidates_json", desc: "Linhas candidatas a logo de texto (rows verbatim do doc)" },
    { key: "logo_light", desc: "Logo pra fundo claro" },
    { key: "logo_dark", desc: "Logo pra fundo escuro (vazio se não houver)" },
    { key: "top_products_json", desc: "Produtos top (urls de imagem/crop)" },
  ],
  color_format: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "niche", desc: "Nicho do negócio" },
    { key: "locale", desc: "Idioma da loja" },
    { key: "tones", desc: "Tons derivados do tom de voz" },
    { key: "color_inventory_json", desc: "Inventário de cores do doc ({valor, ocorrencias, contextos}) — o agente não vê o documento" },
    { key: "brand_colors", desc: "Paleta aprovada com papéis (Principal/Fundo/Destaque)" },
    { key: "font_heading", desc: "Fonte de heading da identidade" },
    { key: "font_body", desc: "Fonte de corpo da identidade" },
    { key: "pesquisa_full_text", desc: "Pesquisa & Diagnóstico (5 pilares)" },
    { key: "email_name", desc: "Nome do email" },
    { key: "subject", desc: "Subject do email" },
  ],
  catalogador: [
    { key: "brand_name", desc: "Nome da loja" },
    { key: "idioma", desc: "Idioma da loja (as objeções saem nele)" },
    { key: "pesquisa", desc: "Pesquisa & Diagnóstico serializada (dossiê inteiro)" },
    { key: "top_products", desc: "Top 5 produtos (nome — preço — link)" },
    { key: "objecoes_anteriores", desc: "Objeções já cadastradas (material, não gabarito)" },
    { key: "vocabulario_da_cliente", desc: "Quotes literais da cliente (icp_vocabulary)" },
    { key: "correcoes", desc: "Erros do validador na tentativa anterior (retry)" },
  ],
  seletor: [
    { key: "brand_name", desc: "Nome da loja" },
    { key: "flow_type", desc: "Flow do email" },
    { key: "email_number", desc: "Número do email no flow" },
    { key: "catalogo_da_loja", desc: "Catálogo de argumento (objeções elegíveis no flow, veículos, medos, incentivo)" },
    { key: "contrato_do_toque", desc: "Contrato tipado da intenção (modo, riscos elegíveis, profundidade mínima, proibições…)" },
    { key: "intencao_do_toque", desc: "Intenção deste email (vault, prosa)" },
    { key: "ja_atacadas", desc: "O que os emails anteriores do flow já atacaram" },
    { key: "oferta_e_produtos", desc: "Top 5 produtos + incentivo" },
    { key: "correcoes", desc: "Erros do validador na tentativa anterior (retry)" },
  ],
  typography: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "font_heading", desc: "Fonte principal da identidade" },
    { key: "classe_principal", desc: "Classe da principal (serif/sans/mono/display) — decide o par que sobrevive ao substituto" },
    { key: "font_heading_weight", desc: "Peso de título da marca (só vale no maior título)" },
    { key: "font_body", desc: "Fonte de corpo da identidade" },
    { key: "font_body_weight", desc: "Peso de corpo da identidade" },
    { key: "tom_de_voz", desc: "Tom de voz — com a fonte principal, é o que decide a segunda fonte" },
    { key: "posicionamento", desc: "Faixa de preço da loja" },
    { key: "niche", desc: "Nicho do negócio" },
    { key: "locale", desc: "Idioma da loja" },
    { key: "hero_com_texto", desc: "A hero tem texto embutido na imagem? (um grau a menos de ruptura)" },
    { key: "font_whitelist", desc: "Fontes de display curadas por tom (font-whitelist.ts)" },
    { key: "inventario", desc: "Inventário das declarações de fonte, numerado — o agente não vê o documento" },
    { key: "inventario_total", desc: "Quantas declarações de fonte o documento tem" },
    { key: "email_name", desc: "Nome do email" },
    { key: "subject", desc: "Subject do email" },
  ],
  copy_fit: [
    { key: "brand_name", desc: "Nome da loja/marca" },
    { key: "tom_voz", desc: "Tom de voz da loja" },
    { key: "contrato_json", desc: "Contrato dos campos que estouraram (label, max/min, orientação)" },
    { key: "copy_atual_json", desc: "A copy acima do limite, com o tamanho de agora" },
  ],
}

const MODEL_OPTIONS_TEXT = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-opus-4-7",
  "claude-haiku-3-5",
  "gpt-5-1",
  "gpt-5-4",
  "gemini-3-5-flash",
]
const MODEL_OPTIONS_IMAGE = ["gpt-image-2", "gpt-image-1"]

interface Props {
  agentType: AgentType
  activePrompt: PromptRow | null
  onSaved: () => void
}

export function PromptEditor({ agentType, activePrompt, onSaved }: Props) {
  const defaultModel = agentType === "image" ? "gpt-image-2" : "claude-sonnet-4-6"
  const [model, setModel] = useState(activePrompt?.model ?? defaultModel)
  const [systemPrompt, setSystemPrompt] = useState(activePrompt?.system_prompt ?? "")
  const [userTemplate, setUserTemplate] = useState(activePrompt?.user_template ?? "")
  const [temperature, setTemperature] = useState(activePrompt?.temperature ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(activePrompt?.max_tokens ?? 2048)
  const [outputSchemaText, setOutputSchemaText] = useState(
    activePrompt?.output_schema ? JSON.stringify(activePrompt.output_schema, null, 2) : "",
  )
  const [submitting, setSubmitting] = useState(false)
  const [validationMsg, setValidationMsg] = useState<{
    kind: "ok" | "error"
    msg: string
  } | null>(null)

  const placeholders = useMemo(
    () => PLACEHOLDERS_BY_AGENT[agentType] ?? [],
    [agentType],
  )
  const knownKeys = useMemo(
    () => new Set(placeholders.map((p) => p.key)),
    [placeholders],
  )

  // Extrai vars do template (system + user) cobrindo as 2 formas que
  // o template-renderer trata como variavel:
  //   1) Substituicao simples: `{{var_name}}`
  //   2) Helpers que tomam VAR como argumento: `{{#if VAR}}`, `{{#case VAR}}`
  // Nao captura `{{#when LABEL}}` (LABEL e' literal, nao var; ler
  // src/lib/agents/image/template-renderer.ts:78-86 pra o contrato).
  const templateAnalysis = useMemo(() => {
    const SIMPLE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    const HELPER_RE = /\{\{\s*#(?:if|case)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    const found = new Set<string>()
    const haystack = `${systemPrompt}\n${userTemplate}`
    for (const m of haystack.matchAll(SIMPLE_RE)) found.add(m[1])
    for (const m of haystack.matchAll(HELPER_RE)) found.add(m[1])
    const used = [...found]
    const unknown = used.filter((k) => !knownKeys.has(k))
    const knownUsed = used.filter((k) => knownKeys.has(k))
    return {
      totalUsed: used.length,
      knownUsed: knownUsed.length,
      unknown,
      totalAvailable: knownKeys.size,
    }
  }, [systemPrompt, userTemplate, knownKeys])

  // Auto-validacao: corre a cada mudanca (memoizada). Mensagem em
  // tempo real ajuda o autor a evitar typo de var. Botao manual abaixo
  // forca refresh do estado mesmo se o conteudo nao mudou.
  useEffect(() => {
    if (templateAnalysis.totalUsed === 0) {
      setValidationMsg(null)
      return
    }
    if (templateAnalysis.unknown.length === 0) {
      setValidationMsg({
        kind: "ok",
        msg: `Template OK. ${templateAnalysis.knownUsed}/${templateAnalysis.totalAvailable} vars do contrato em uso.`,
      })
    } else {
      setValidationMsg({
        kind: "error",
        msg: `Variáveis não documentadas: ${templateAnalysis.unknown.map((u) => `{{${u}}}`).join(", ")}. Em runtime, viram string vazia.`,
      })
    }
  }, [templateAnalysis])

  const validateTemplate = () => {
    if (templateAnalysis.totalUsed === 0) {
      setValidationMsg({
        kind: "error",
        msg: "Template sem variáveis. Use {{var_name}} no system ou user template.",
      })
      return
    }
    if (templateAnalysis.unknown.length === 0) {
      setValidationMsg({
        kind: "ok",
        msg: `Template OK. ${templateAnalysis.knownUsed}/${templateAnalysis.totalAvailable} vars do contrato em uso.`,
      })
    } else {
      setValidationMsg({
        kind: "error",
        msg: `Variáveis não documentadas: ${templateAnalysis.unknown.map((u) => `{{${u}}}`).join(", ")}. Em runtime, viram string vazia.`,
      })
    }
  }

  const save = async () => {
    if (!systemPrompt.trim() || !userTemplate.trim()) {
      toast({ variant: "destructive", title: "system_prompt e user_template obrigatórios" })
      return
    }
    if (templateAnalysis.unknown.length > 0) {
      const confirmed = window.confirm(
        `${templateAnalysis.unknown.length} variável(is) não documentada(s): ` +
          `${templateAnalysis.unknown.map((u) => `{{${u}}}`).join(", ")}.\n\n` +
          "Em runtime essas vars viram string vazia. Salvar mesmo assim?",
      )
      if (!confirmed) return
    }
    let outputSchema: unknown = null
    if (outputSchemaText.trim()) {
      try {
        outputSchema = JSON.parse(outputSchemaText)
      } catch {
        toast({ variant: "destructive", title: "output_schema não é JSON válido" })
        return
      }
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/agents/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_type: agentType,
          model,
          system_prompt: systemPrompt,
          user_template: userTemplate,
          temperature,
          max_tokens: maxTokens,
          output_schema: outputSchema,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar")
      toast({
        title: `Versão criada (v${data?.prompt?.version ?? "?"})`,
        description: "A nova versão não está ativa. Use 'Ativar' no histórico.",
      })
      onSaved()
    } catch (err) {
      toast({
        variant: "destructive",
        title: err instanceof Error ? err.message : "Erro ao salvar",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const modelOptions = agentType === "image" ? MODEL_OPTIONS_IMAGE : MODEL_OPTIONS_TEXT
  const supportsSchema =
    agentType === "copy" || agentType === "qa" || agentType === "campaign_architect"

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      <div className="space-y-3 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
            {activePrompt ? `Versão ativa: v${activePrompt.version}` : "Nenhuma versão ativa"}
          </h3>
          {activePrompt && (
            <span className="text-[11px] text-slate-400 dark:text-white/40">
              criada em {new Date(activePrompt.created_at).toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
              Modelo
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="crm-input w-full"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {agentType !== "image" && (
            <div className="space-y-1">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Temperatura ({temperature})
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#1F1F1F]"
              />
            </div>
          )}
          {agentType !== "image" && (
            <div className="space-y-1">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Max tokens
              </label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
                min={100}
                max={8000}
                className="crm-input w-full"
              />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
            System prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Instruções de sistema para o agente..."
            className="crm-input w-full font-mono text-[12px] min-h-[200px] resize-y"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
            User template (suporta {"{{variáveis}}"})
          </label>
          <textarea
            value={userTemplate}
            onChange={(e) => setUserTemplate(e.target.value)}
            placeholder="Template da mensagem do usuário..."
            className="crm-input w-full font-mono text-[12px] min-h-[200px] resize-y"
          />
        </div>

        {supportsSchema && (
          <div className="space-y-1">
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
              Output schema (JSON Schema, opcional)
            </label>
            <textarea
              value={outputSchemaText}
              onChange={(e) => setOutputSchemaText(e.target.value)}
              placeholder='{"type": "object", "properties": {...}}'
              className="crm-input w-full font-mono text-[11px] min-h-[120px] resize-y"
            />
          </div>
        )}

        {validationMsg && (
          <div
            className={
              validationMsg.kind === "ok"
                ? "flex items-start gap-2 rounded-[4px] bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-200"
                : "flex items-start gap-2 rounded-[4px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200"
            }
          >
            {validationMsg.kind === "ok" ? (
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <span>{validationMsg.msg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={validateTemplate}
            className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08]"
          >
            Validar template
          </button>
          <button
            type="button"
            onClick={save}
            disabled={submitting || !systemPrompt.trim() || !userTemplate.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar nova versão
          </button>
        </div>
      </div>

      <aside className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02] p-4 h-fit lg:sticky lg:top-4">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75 mb-2">
          Placeholders disponíveis
        </h4>
        <ul className="space-y-1.5 text-[11px] max-h-[600px] overflow-y-auto">
          {placeholders.map((p) => (
            <li key={p.key} className="leading-tight">
              <code className="font-mono text-slate-900 dark:text-white">{`{{${p.key}}}`}</code>
              <p className="text-slate-500 dark:text-white/55">{p.desc}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
