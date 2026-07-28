/**
 * Contrato canonico do HTML Agent v2.
 *
 * Fonte unica das 20 vars que `buildHtmlPromptVars` emite, do que o
 * `user_template` consome, e do que a sidebar "PLACEHOLDERS DISPONIVEIS"
 * lista. Drift entre code, UI e migration vira erro de typecheck/runtime
 * em vez de bug silencioso.
 *
 * - `HtmlPromptVarsSchema`: Zod schema (validacao runtime em dev/test)
 * - `HtmlPromptVars`: tipo inferido
 * - `HTML_PROMPT_VAR_KEYS`: array tipado das 20 keys (UI importa)
 * - `HTML_PROMPT_VAR_DESCRIPTIONS`: descricao por key (UI sidebar)
 */

import { z } from "zod"

const HEX_RE = /^#[0-9A-F]{6}$/

export const HtmlPromptVarsSchema = z.object({
  brand_name: z.string(),
  locale: z.string(),
  color_bg: z.string().regex(HEX_RE, "color_bg deve ser hex normalizado (#RRGGBB upper)"),
  color_text: z.string().regex(HEX_RE),
  color_heading: z.string().regex(HEX_RE),
  color_button_bg: z.string().regex(HEX_RE),
  color_button_text: z.string().regex(HEX_RE),
  color_accent: z.string().regex(HEX_RE),
  font_heading: z.string(),
  font_body: z.string(),
  // logo_svg pode ser vazio (logo missing) — valida tipo, nao conteudo.
  logo_svg: z.string(),
  logo_width: z.string(),
  email_name: z.string(),
  subject: z.string(),
  preheader: z.string(),
  objective: z.string(),
  messaging: z.string(),
  reference_html: z.string(),
  image_map_json: z.string(),
  top_products_json: z.string(),
  blocks_with_content_json: z.string(),
})

export type HtmlPromptVars = z.infer<typeof HtmlPromptVarsSchema>

export const HTML_PROMPT_VAR_KEYS = HtmlPromptVarsSchema.keyof().options

// ── Cadeia de formatação (split do HTML agent, migration 20261039) ──
// 4 schemas no lugar do único: cada agente tem seu contrato de vars.
// SYNC: PLACEHOLDERS_BY_AGENT (prompt-editor.tsx) espelha estas keys.

const baseIdentity = {
  brand_name: z.string(),
  locale: z.string(),
  color_bg: z.string().regex(HEX_RE),
  color_text: z.string().regex(HEX_RE),
  color_heading: z.string().regex(HEX_RE),
  color_button_bg: z.string().regex(HEX_RE),
  color_button_text: z.string().regex(HEX_RE),
  color_accent: z.string().regex(HEX_RE),
  font_heading: z.string(),
  font_heading_weight: z.string(),
  font_body: z.string(),
  font_body_weight: z.string(),
}

export const HeroPromptVarsSchema = z.object({
  ...baseIdentity,
  logo_light: z.string(),
  logo_dark: z.string(),
  email_name: z.string(),
  subject: z.string(),
  montador_html: z.string(),
  hero_region_html: z.string(),
  hero_variant_html: z.string(),
  hero_variant_rendered_html: z.string(),
  hero_variant_schema_json: z.string(),
  hero_content_json: z.string(),
  hero_image_url: z.string(),
  hero_image_alt: z.string(),
  output_contract: z.string(),
})
export type HeroPromptVars = z.infer<typeof HeroPromptVarsSchema>

export const TextFormatPromptVarsSchema = z.object({
  ...baseIdentity,
  html: z.string(),
  email_name: z.string(),
  subject: z.string(),
  preheader: z.string(),
  objective: z.string(),
  messaging: z.string(),
  blocks_with_content_json: z.string(),
  fields_json: z.string(),
  top_products_json: z.string(),
})
export type TextFormatPromptVars = z.infer<typeof TextFormatPromptVarsSchema>

// Arquitetura por views (F3): o agente NÃO recebe mais o documento —
// só as views dos slots de imagem (row_html fatiado por código) e as
// linhas candidatas a logo de texto. O applyOps segue aplicando as ops
// no documento completo que o agente nunca viu.
export const ImageFormatPromptVarsSchema = z.object({
  brand_name: z.string(),
  image_slots_json: z.string(),
  image_map_json: z.string(),
  logo_candidates_json: z.string(),
  logo_light: z.string(),
  logo_dark: z.string(),
  top_products_json: z.string(),
})
export type ImageFormatPromptVars = z.infer<typeof ImageFormatPromptVarsSchema>

// Arquitetura por views (F4): o agente NÃO recebe o documento — recebe o
// inventário de cores extraído por código ({valor, ocorrencias, contextos})
// e emite ops `recolor {from, to}` aplicadas globalmente pelo código.
export const ColorFormatPromptVarsSchema = z.object({
  brand_name: z.string(),
  niche: z.string(),
  locale: z.string(),
  tones: z.string(),
  color_inventory_json: z.string(),
  brand_colors: z.string(),
  font_heading: z.string(),
  font_body: z.string(),
  pesquisa_full_text: z.string(),
  email_name: z.string(),
  subject: z.string(),
})
export type ColorFormatPromptVars = z.infer<typeof ColorFormatPromptVarsSchema>

export const HTML_PROMPT_VAR_DESCRIPTIONS: Record<
  keyof HtmlPromptVars,
  string
> = {
  brand_name: "Nome da loja",
  locale: "Idioma da loja (ex: pt-BR)",
  color_bg: "Cor de fundo (--bg)",
  color_text: "Cor do texto corpo (--text)",
  color_heading: "Cor dos headings (--heading)",
  color_button_bg: "Cor de fundo do botão (--button-bg)",
  color_button_text: "Cor do texto do botão (--button-text)",
  color_accent: "Cor de destaque/accent (--accent)",
  font_heading: "Fonte de heading (Google Fonts)",
  font_body: "Fonte de body (Google Fonts)",
  logo_svg: "SVG inline do logo",
  logo_width: "Largura do logo em px",
  email_name: "Nome interno do email",
  subject: "Subject line",
  preheader: "Preheader text",
  objective: "Objetivo editorial do email (do blueprint)",
  messaging: "Mensagem central do email (do blueprint)",
  reference_html: "HTML de referência (autoridade de forma)",
  image_map_json:
    "Array de imagens [{id,url,tag,block_type,aspect_ratio,render_width_px,overlay}]",
  top_products_json: "Array de produtos top da loja",
  blocks_with_content_json: "Blocos com content + purpose por bloco",
}
