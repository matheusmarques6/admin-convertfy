/**
 * HTML Chain — geracao de HTML de email via Anthropic Messages API.
 *
 * v2 (Master Prompt): sintaxe handlebars-lite `{{var}}` no user_template
 * processada por `renderImageTemplate`. system_prompt + user_template
 * carregados de `email_agent_configs` (agent_type='html', is_active=true)
 * com fallback pros DEFAULTs hardcoded abaixo apenas se o row do DB
 * estiver ausente.
 *
 * Por que SDK direto e nao LangChain:
 *   - LangChain `ChatPromptTemplate` usa sintaxe `{var}` que colide com
 *     `{{var}}` do Master Prompt v2 (require escape constante).
 *   - O fluxo aqui e single-shot, sem chains compostas — SDK direto e
 *     mais simples e da controle sobre system role explicito.
 */

import Anthropic from "@anthropic-ai/sdk"

import { logger } from "@/lib/logger"

import { renderImageTemplate } from "../image/template-renderer"
import { invokeOpenRouter, isOpenRouterModel } from "../openrouter-invoke"

const log = logger.child("HtmlChain")

// ── Defaults (fallback) ────────────────────────────────────────────────
//
// Usados SOMENTE quando email_agent_configs nao tem row ativa pra
// agent_type='html'. A migration `20260630_html_agent_master_prompt_v2.sql`
// insere a versao canonica do prompt — em prod o fallback abaixo nao
// deve ser executado.
//
// Espelha as 21 vars do contrato emitido por `buildHtmlPromptVars`
// (src/lib/agents/html/build-vars.ts) para que, mesmo na ausencia da
// row do DB, a chain receba dados consistentes em vez de placeholders
// obsoletos.

export const DEFAULT_HTML_SYSTEM_PROMPT = `<role>
You are the HTML Repainter for an email-design pipeline. You do NOT write copy, generate images, redesign layout, or convert markup. The Montador upstream already produced a complete table-based email template (reference_html) with placeholders. Your job is to substitute IN PLACE — preserve every <table>, <tr>, <td>, attribute, the CSS :root block, block order and block count. The output must be a sendable email (Klaviyo/Mailchimp/Omnisend), not a Figma mock.
</role>

<core_principle>
The reference_html IS the output, minus six substitutions. Treat the reference as immutable structure; only swap values inside it.
</core_principle>

<substitute_only_these>
1. CSS variables in :root — replace the VALUES (not names) of --bg, --text, --heading, --button-bg, --button-text, --accent with the hex values from <color_roles>. Keep every other rule and selector intact.
2. font-family declarations — replace with <fonts>.heading for headings/titles and <fonts>.body for body/paragraph text. Use the @import url provided.
3. Content placeholders {{TOKEN}} (e.g. {{HERO_TEXT}}, {{COUPON_CODE}}, {{USP_1_TITLE}}, {{REVIEW_1_TEXT}}, {{HEADLINE}}, {{BODY_1}}) — replace with the matching copy from <blocks_with_content>. Match by block_type + position + field semantics (e.g. {{HERO_TEXT}} -> hero block's headline/subheadline; {{USP_1_TITLE}} -> features block, first item title). Copy verbatim — do not rewrite, translate, summarize, or invent. Brand name placeholders ({{BRAND_NAME}}) -> <store>.brand_name.
4. Empty image slots — wherever the reference has a <td> with background-color:var(--accent) acting as a visual placeholder for an image (typically with fixed height), replace its content with an <img src="..." alt="..." style="display:block;width:100%;height:auto;"> using the URL from <image_map> for the matching block. Respect aspect_ratio. Never invent URLs.
5. Logo placeholder — wherever the reference renders the brand name as a styled text box (typically near the top or footer), replace the rendered text with the inline SVG from <logo> OR keep an <img> with the logo URL if SVG is empty. Brand-text logos in body copy stay as text.
6. URLs in href attributes ({{CTA_URL}}, {{USP_CTA_URL}}, {{PRODUCTS_CTA_URL}}, {{LINK_*_URL}}, {{FACEBOOK_URL}}, etc.) — use the matching url from <blocks_with_content>; if a block has no url, use "#" (placeholder).
</substitute_only_these>

<merge_tags_are_literal>
Tokens that ARE merge tags of the email service provider must remain LITERAL in the output (the ESP substitutes at send time):
- [unsubscribe_link], [unsubscribe], [email], [first_name]
- {{ unsubscribe }} and Liquid syntax {% unsubscribe %}
- *|UNSUB|*, *|FNAME|*
- \${name}
Do NOT replace these. Do NOT flag them. Keep verbatim.
</merge_tags_are_literal>

<hard_prohibitions>
- DO NOT convert <table> to <div>. Tables stay tables. This is a sendable email.
- DO NOT add, remove, reorder, merge, or split blocks. Block count and order in your output must match the reference exactly.
- DO NOT change inline styles other than the color values (which come from var(--xxx) — and the var values themselves only change inside :root).
- DO NOT add CSS, classes, or selectors that are not in the reference.
- DO NOT add MSO/Outlook conditionals beyond what's in the reference.
- DO NOT touch <meta>, <head>, <!DOCTYPE>, the <style> block structure, media queries, or comments other than to substitute font-family + :root vars.
- NEVER place a <div> (or any non-table element) as a direct child of <table>, e.g. \`</tr><div style="height:64px"></div><tr>\`. This is invalid HTML — email clients foster-parent it to the TOP of the email, creating a blank gap and pushing the hero down. To add vertical space between blocks, use a table row: \`<tr><td style="height:Npx;line-height:Npx;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>\`, or padding on the adjacent cell. Between </tr> and <tr> ONLY <tr>...</tr> or comments may appear.
- PREHEADER: the preheader is ONE short hidden line of text (just the preheader copy). NEVER pad it with repeated &nbsp;, &#160;, zero-width characters (U+200C/U+200D/U+200B/U+FEFF), or any whitespace/spacer "hack". No spacer block of any kind. Emit the preheader text once and move on.
- DO NOT repeat any character, entity, or token more than a handful of times in a row. If you find yourself emitting a long run of the same thing, STOP and continue with the next block.
- DO NOT emit commentary, markdown fences, or any text before <!DOCTYPE html> or after </html>.
</hard_prohibitions>

<self_check>
Before emitting, verify silently and fix any failure:
- Count of <table role="presentation"> tags in output == count in reference.
- No content placeholder {{TOKEN}} from the reference's payload section remains unsubstituted (with the exception of literal merge tags above).
- :root has exactly the six CSS vars (--bg, --text, --heading, --button-bg, --button-text, --accent) with the color_roles values.
- font-family declarations use the brand fonts.
- Every image slot is either an <img src> from image_map or untouched if no image was provided for that block.
- Logo placeholder is replaced (inline SVG or img URL).
- Output starts with <!DOCTYPE html> and ends with </html>. Nothing else.
</self_check>

<reference_count_check>
CRITICAL — these are countable structural rules. The reference_html encodes a specific layout (zig-zag, framed sections, asymmetric radii, button grids). Failing to preserve these means you REGENERATED a stack-linear email instead of repainting the reference. Before emitting, count and verify:

1. data-block attributes: count('data-block=') in your output MUST equal count('data-block=') in reference_html. If reference has any data-block="..." attributes, they MUST appear verbatim in the same elements in the output.

2. Responsive plumbing classes: if reference contains the strings "mobile-reset-left", "mobile-reset-right", "stack-col", "stack-pad", or any class with prefix "stack-" / "mobile-", those classes MUST appear in your output on the same elements.

3. Asymmetric radii: if reference contains border-radius values like "0 0 30px 0", "30px 0 0 0", "210px 210px 0 0" (or any radius with at least 2 different values), the output MUST preserve those EXACT 4-corner values on the same elements. NEVER simplify to a single value.

4. Link grid: if reference contains placeholders {{LINK_1}} AND {{LINK_5}} (or any LINK_N up to 5), the output MUST contain 5 distinct anchor/button elements arranged in a 2+2+1 grid layout (two pairs of two, then one centered), NOT a simple horizontal list.

5. Hero-product vs product-grid: if reference has placeholders {{PRODUCT_FEATURE}} or {{PRODUCTS_TITLE}} (single hero product with feature list), DO NOT replace it with a product catalog grid from top_products. Render the single hero-product block from the reference's structure. The reverse also holds: if reference has a 2x2 product grid using top_products, DO NOT collapse it into a single hero product.

If ANY of these counts/checks fails, you are regenerating the layout — STOP and rewrite the output to match the reference structure exactly before emitting.
</reference_count_check>

<formatting_hard_rules>
Non-negotiable output-formatting rules. They override any conflicting habit and apply to EVERY email you emit. Violating any of them ships a broken email.

1. LINKS — every href must be one absolute, well-formed URL:
   - Always start with \`https://\`. A bare domain like \`href="store.com"\` is FORBIDDEN — emit \`href="https://store.com"\`.
   - A URL must contain ZERO whitespace. When you join a domain with a path (e.g. store domain + \`/products/slug\`), concatenate them directly: \`https://store.com/products/slug\`. Never \`store.com /products/slug\`.
   - If a payload URL already includes \`https://\`, use it as-is; if it lacks the protocol, prefix \`https://\`; if it contains spaces, remove them.

2. PRODUCT GRID IMAGES — cards must align perfectly:
   - Every product \`<img>\` carries BOTH the HTML \`width\` attribute (the real rendered px width of the card image) AND the inline style. Outlook ignores CSS width; without the attribute the image explodes to its original size.
   - Normalize aspect ratio: when the image src is a Shopify CDN URL (\`cdn.shopify.com\`), append the crop params \`width=520&height=650&crop=center\` to the existing query string (keep the \`v=\` param). All cards in the same grid must use the SAME ratio so their heights match.
   - Grid columns must sum to 100%: use \`33.33%\` for 3 columns and \`50%\` for 2 — never \`33%\`.

3. NO DUPLICATE PRODUCTS — a product may appear ONCE in the whole email. If a recommendations/cross-sell block would repeat a product already shown in a cart/reserved-items block, pick different products from top_products. If there are not enough distinct products, render fewer cards instead of repeating one.
</formatting_hard_rules>

<hero_overlay_hard_rule>
This rule governs the HERO block only.

THE HERO IS ALWAYS AN INTEGRATED BACKGROUND-IMAGE OVERLAY: a single full-bleed
cell whose BACKGROUND is the hero image, with the brand logo/kicker, headline,
subcopy and CTA laid OVER the image. This holds for EVERY flow and EVERY
reference. If the reference authored the hero as a stacked \`<img>\` plus separate
text rows, or as a plain image slot, COLLAPSE it into this one overlay cell.
NEVER render the hero image as a standalone \`<img>\` row with the text stacked in
a separate row above or below it.

REPAINT, don't reinvent: if the reference hero ALREADY carries a
\`background-image\` overlay (or a \`<!-- hero: overlay ... -->\` comment), keep its
structure and comment; swap ONLY the background-image URL for the image_map URL,
apply color_roles + fonts, and pour in the copy.

CONSTRUCTION (this exact recipe is what prevents the image from being squashed
into a thin strip — the bug older versions hit):
- ONE hero cell \`<tr><td>\`. Put the image on the cell as BOTH the
  \`background="{url}"\` attribute AND a \`background-image\` that layers a
  legibility scrim UNDER the text:
  \`background-image:linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.5) 100%), url('{url}')\`
  with \`background-size:cover; background-position:center center;
  background-repeat:no-repeat\`, over a solid dark \`background-color\` fallback.
- ADAPTIVE HEIGHT via GENEROUS VERTICAL PADDING on the cell (e.g.
  \`padding:56px 40px 60px 40px\`) so the cell GROWS with the text and the next
  block always starts BELOW it. NEVER a fixed height, NEVER \`position:absolute\`
  (both let the text overflow the image or the next block overlap it).
- OUTLOOK FALLBACK (MANDATORY — Outlook desktop ignores CSS background-image;
  without this the hero renders as an empty band). Wrap the overlaid content in
  VML so the background still paints in Outlook:
  \`<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="frame" src="{url}" color="{bgFallback}" /><v:textbox inset="0,0,0,0"><![endif]-->\`
  ... the overlaid content ...
  \`<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->\`
- TEXT COLOR: white (\`#FFFFFF\`) by default — it reads over the scrim on any
  photo. Use a dark brand color only if the copy stays clearly legible.
- FONT SIZES by role — NEVER enlarge the eyebrow/kicker: eyebrow/kicker 11-13px
  uppercase with letter-spacing, headline 34-44px, subcopy 15-17px, CTA 13-15px.
- The hero is its OWN \`<tr><td>\`; the next block is a SEPARATE \`<tr>\`. Nothing
  may bleed from one cell into the next.

If the hero has NO image (generation failed upstream): render a text-only hero
(solid brand color, text in normal flow). NEVER invent a URL or reuse another
block's image.
</hero_overlay_hard_rule>

<image_slot_rules>
Image placement is TAG-DRIVEN. The reference marks image slots with {{*_IMAGE}} / {{*_THUMB}} placeholders (e.g. {{HERO_IMAGE}}, {{PRODUCTS_IMAGE}}, {{REVIEW_1_IMAGE}}); <image_map> entries may carry "tag", "block_type", "aspect_ratio" and "render_width_px". These rules OVERRIDE item 4 of <substitute_only_these> wherever they conflict:

0. LEGACY PAYLOAD GUARD: if the <image_map> entries do NOT carry a "tag" field, this is a legacy payload — match images by entry id only (IMG_{position} ↔ the block at that position), respect each entry's aspect_ratio, and NEVER remove a slot because a tag is missing: fill what you can and leave the rest as authored (rule 3 does NOT apply). Rules 1–3 apply ONLY when entries carry "tag".
1. MATCH BY TAG: fill a slot ONLY with the image_map entry whose "tag" matches the slot's placeholder name (indexes count: {{REVIEW_2_IMAGE}} matches tag REVIEW_2_IMAGE, not REVIEW_1_IMAGE). If no entry carries that tag, match by block position (entry id IMG_{position} vs the block the slot belongs to). Still no match → rule 3.
2. ONE SLOT PER IMAGE: each image_map URL appears AT MOST ONCE in the whole email. NEVER reuse an image to fill a second slot, never use one block's image inside another block. Fewer images than slots means some slots stay unfilled — that is correct.
3. UNFILLED SLOT → REMOVE: a slot with no matching image is REMOVED — delete the placeholder element (or its dedicated <tr>); if siblings share the row, collapse only that cell. Do NOT leave the raw {{TAG}} token, do NOT substitute a different image, do NOT invent a URL.
4. TEXT SLOTS ARE NOT IMAGE SLOTS: never insert an <img> where the reference has a TEXT placeholder ({{BADGE_1_TEXT}}, {{USP_1_TITLE}}, {{REVIEW_1_NAME}}...). A colored box holding a text token is a TEXT element even if it visually resembles a placeholder box.
5. RENDER SIZE: respect each entry's aspect_ratio — the image was composed and sized for THAT slot (hero 4:5, product 4:3, avatar/thumb 1:1); a 1:1 avatar/thumb stays small and square, never stretched into a banner. When the entry carries render_width_px, the inserted <img> carries width="{render_width_px}" as an HTML attribute AND style="display:block;width:100%;max-width:{render_width_px}px;height:auto;". When it does not (legacy payload), keep the slot's authored width.
</image_slot_rules>

Emit ONLY the final HTML.`

export const DEFAULT_HTML_USER_TEMPLATE = `<store>
  <brand_name>{{brand_name}}</brand_name>
  <locale>{{locale}}</locale>
</store>

<color_roles>
  <bg>{{color_bg}}</bg>
  <text>{{color_text}}</text>
  <heading>{{color_heading}}</heading>
  <button_bg>{{color_button_bg}}</button_bg>
  <button_text>{{color_button_text}}</button_text>
  <accent>{{color_accent}}</accent>
</color_roles>

<fonts>
  <heading>{{font_heading}}</heading>
  <body>{{font_body}}</body>
</fonts>

<logo width_px="{{logo_width}}">
{{logo_svg}}
</logo>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
  <preheader>{{preheader}}</preheader>
  <objective>{{objective}}</objective>
  <messaging>{{messaging}}</messaging>
</email>

<reference_html>
{{reference_html}}
</reference_html>

<image_map>
{{image_map_json}}
</image_map>

<top_products>
{{top_products_json}}
</top_products>

<blocks_with_content>
{{blocks_with_content_json}}
</blocks_with_content>

Assemble this email now. Emit ONLY the HTML, beginning with <!DOCTYPE html> and ending with </html>.`

// ── Config ─────────────────────────────────────────────────────────────

export interface HtmlChainConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  user_template: string
}

// Fallback usado só quando não há row ativa de email_agent_configs (agent_type
// ='html'). Sonnet 4.6: o HTML agent é montador (não arquiteta), então não
// precisa de Opus — a estrutura vem do reference_html (Montador).
const DEFAULT_MODEL = "claude-sonnet-4-6"

export interface InvokeHtmlInput {
  config: HtmlChainConfig
  vars: Record<string, string>
}

export interface InvokeHtmlResult {
  html: string
  tokensInput: number
  tokensOutput: number
  /** User prompt renderizado (handlebars-lite aplicado em config.user_template
   *  + vars). Exposto p/ o caller persistir em email_generation_runs.
   *  rendered_prompt — telemetria de auditoria do input do modelo. */
  renderedPrompt: string
}

/**
 * Renderiza user_template (handlebars-lite) e invoca a Messages API.
 *
 * Pos-processa o output: remove fences markdown, extrai apenas o
 * fragmento `<!DOCTYPE html>...</html>` se vier envolto em prosa.
 */
export async function invokeHtmlChain(
  input: InvokeHtmlInput,
): Promise<InvokeHtmlResult> {
  const { config, vars } = input

  const userMessage = renderImageTemplate(config.user_template, vars)
  const systemPrompt = config.system_prompt.trim() || DEFAULT_HTML_SYSTEM_PROMPT
  const model = config.model || DEFAULT_MODEL

  // Modelos claude-opus-4-7 e claude-opus-4-8 removeram os parametros
  // de sampling (`temperature`, `top_p`, `top_k`) — enviar qualquer um
  // retorna 400 ("'temperature' is deprecated for this model"). Para
  // models legacy (opus-4-6, sonnet-4-x), o param continua valido.
  // Pra controlar profundidade no 4.7+, usar `output_config.effort`.
  const supportsTemperature = !/opus-4[.-](7|8)/i.test(model)

  // Roteamento por id: "vendor/model" (ex.: anthropic/claude-sonnet-4.6) vai
  // pelo OpenRouter; demais usam o SDK Anthropic direto.
  if (isOpenRouterModel(model)) {
    const t0 = Date.now()
    const or = await invokeOpenRouter({
      model,
      systemPrompt,
      userMessage,
      maxTokens: config.max_tokens,
      temperature: supportsTemperature ? config.temperature : undefined,
      // 120s cortava quando o reference_html (do Montador) é grande/complexo —
      // o teste com Montador em gpt-5.4 estourou em 120,6s. 200s dá fôlego e
      // ainda cabe no maxDuration=300 da rota (HTML 200 + QA 60 + overhead).
      timeoutMs: 200_000,
      title: "Convertfy Admin HTML",
    })
    const html = postProcessHtml(or.text, vars.locale)
    log.info("html.invoke.success", {
      model,
      via: "openrouter",
      durationMs: Date.now() - t0,
      inputTokens: or.tokensInput,
      outputTokens: or.tokensOutput,
      htmlLength: html.length,
    })
    return {
      html,
      tokensInput: or.tokensInput,
      tokensOutput: or.tokensOutput,
      renderedPrompt: userMessage,
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nao configurada")
  }

  log.info("html.invoke.start", {
    model,
    temperature: supportsTemperature ? config.temperature : null,
    maxTokens: config.max_tokens,
    systemPromptLength: systemPrompt.length,
    userMessageLength: userMessage.length,
  })

  // maxRetries: SDK ja faz backoff exponencial em 408/409/429/5xx.
  // Default e' 2 — explicitar pra documentar a politica de robustez.
  // timeout: 200s — teto abaixo do maxDuration:300 do route, com folga pro QA.
  const client = new Anthropic({
    apiKey,
    maxRetries: 2,
    timeout: 200_000,
  })

  const t0 = Date.now()

  // Defesa em camadas:
  // (a) Match de model id — pra evitar a chamada que ja sabemos que 400.
  // (b) Catch do 400 "temperature is deprecated" — pra cobrir variantes
  //     de model id que o regex nao previu (futuras versoes que removerem
  //     o param, IDs com sufixo de variante, etc).
  // Sem o temperature, model decide proprio nivel de criatividade.
  const baseRequest = {
    model,
    max_tokens: config.max_tokens,
    system: systemPrompt,
    messages: [{ role: "user" as const, content: userMessage }],
  }

  let res
  try {
    res = await client.messages.create({
      ...baseRequest,
      ...(supportsTemperature ? { temperature: config.temperature } : {}),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTemperatureDeprecated =
      err instanceof Anthropic.BadRequestError &&
      /temperature.*deprecated|deprecated.*temperature/i.test(msg)
    if (!isTemperatureDeprecated) throw err
    log.warn("html.invoke.temperature_deprecated_retry", { model })
    res = await client.messages.create(baseRequest)
  }

  const durationMs = Date.now() - t0

  const textBlocks = res.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text",
  )
  const html = postProcessHtml(textBlocks.map((b) => b.text).join(""), vars.locale)

  log.info("html.invoke.success", {
    model,
    durationMs,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    htmlLength: html.length,
  })

  return {
    html,
    tokensInput: res.usage.input_tokens,
    tokensOutput: res.usage.output_tokens,
    renderedPrompt: userMessage,
  }
}

/**
 * Colapsa "spacer hacks" descontrolados de preheader. Modelos as vezes entram
 * num loop gerando `&nbsp;‌&nbsp;‌...` milhares de vezes (preheader padding),
 * estouram o max_tokens e TRUNCAM o email antes do corpo. Cortar qualquer run
 * >= 12 de nbsp/zero-width pra 3 evita o desperdicio e o bloat. Defensivo: o
 * prompt ja proibe o spacer, isto e a rede de seguranca.
 */
function collapseRunawaySpacers(html: string): string {
  // Cobre &nbsp; / &#160; / U+00A0 e zero-width: U+200C U+200D U+200B U+FEFF.
  return html.replace(
    /(?:&nbsp;|&#160;| |‌|‍|​|﻿){12,}/gi,
    "&nbsp;&nbsp;&nbsp;",
  )
}

// Corrige "spacer divs" órfãos entre blocos (foster parenting → gap no topo).
// Módulo próprio (puro) porque o Refinador também precisa aplicar no output
// dele (apply-delta.ts) sem importar este chain inteiro. Import + re-export
// mantém o uso interno (abaixo) e os importadores/testes existentes.
import { fixOrphanSpacerDivs, fixSpacerColumnWidths } from "../html/orphan-spacer"
export { fixOrphanSpacerDivs, fixSpacerColumnWidths }

/** Erro de output truncado — o modelo nao fechou o documento (`</html>`). */
export class HtmlTruncatedError extends Error {
  constructor(htmlLength: number) {
    super(`HTML output truncado (sem </html>, ${htmlLength} chars)`)
    this.name = "HtmlTruncatedError"
  }
}

// Placeholders de CONTEUDO do Montador: {{HEADLINE}}, {{HERO_TEXT}},
// {{USP_1_TITLE}} etc — sempre MAIUSCULAS. NAO casa merge tags do provedor
// (`{{ unsubscribe }}` minusculo/espacado, `{% ... %}`, `*|...|*`,
// `[unsubscribe_link]`), que devem permanecer literais.
const UNRESOLVED_CONTENT_TOKEN = /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/g

/**
 * Limpa placeholders de conteudo nao-substituidos pelo agente. Se o Montador
 * usou `{{HEADLINE}}` mas o agente nao casou com blocks_with_content, o token
 * chegaria LITERAL ao cliente. Aqui logamos (observabilidade) e removemos —
 * melhor um campo vazio do que `{{HEADLINE}}` visivel no email.
 */
function stripUnresolvedPlaceholders(html: string): string {
  const matches = html.match(UNRESOLVED_CONTENT_TOKEN)
  if (matches && matches.length > 0) {
    const unique = Array.from(new Set(matches))
    // Slot de IMAGEM perdido é mais grave que copy não preenchida: o email
    // sai sem um visual que o Montador pediu, e com QA desligado ninguém vê.
    // Warn dedicado separa os dois casos na telemetria.
    const imageTokens = unique.filter((t) =>
      /_(?:IMAGE|THUMB)(?:_\d+)?\s*\}\}$/.test(t),
    )
    if (imageTokens.length > 0) {
      log.warn("html.image_slot_unfilled", {
        count: imageTokens.length,
        tokens: imageTokens.slice(0, 10),
      })
    }
    log.warn("html.unresolved_placeholders", {
      count: matches.length,
      sample: unique.slice(0, 10),
    })
    return html.replace(UNRESOLVED_CONTENT_TOKEN, "")
  }
  return html
}

/**
 * Forca o atributo `lang` do <html> pro locale da loja. O modelo escolhia
 * o lang arbitrariamente (lang="en" em loja pt-BR e vice-versa — batch de
 * jul/2026 saiu misturado). O locale ja e' resolvido/normalizado por
 * buildHtmlPromptVars, entao a correcao aqui e' deterministica: substitui
 * o atributo se existir, injeta se faltar. No-op com locale vazio.
 */
export function enforceLangAttribute(html: string, locale: string): string {
  const trimmed = locale?.trim()
  if (!trimmed || !/^[a-z]{2}(-[A-Z]{2})?$/.test(trimmed)) return html
  if (/<html[^>]*\slang\s*=\s*["'][^"']*["']/i.test(html)) {
    return html.replace(
      /(<html[^>]*\slang\s*=\s*["'])[^"']*(["'])/i,
      `$1${trimmed}$2`,
    )
  }
  return html.replace(/<html(\s|>)/i, `<html lang="${trimmed}"$1`)
}

/** Remove fences markdown e extrai o fragmento <!DOCTYPE...</html> se houver. */
function postProcessHtml(rawText: string, locale?: string): string {
  let raw = rawText.replace(/```(?:html)?\s*/gi, "").trim()
  raw = collapseRunawaySpacers(raw)
  const doctypeMatch = raw.match(/(<!DOCTYPE[\s\S]*<\/html>)/i)
  if (doctypeMatch) raw = doctypeMatch[1]
  // Guard de truncamento: sem `</html>` o documento esta incompleto (ex.: o
  // modelo estourou max_tokens num spacer runaway antes de gerar o corpo).
  // Lancar aqui faz runPhase2HtmlQa marcar `failed: html_failed` (visivel +
  // retry) em vez de salvar um email quebrado como "sucesso" -> render vazio.
  if (!/<\/html>\s*$/i.test(raw)) {
    throw new HtmlTruncatedError(raw.length)
  }
  raw = fixOrphanSpacerDivs(raw)
  raw = fixSpacerColumnWidths(raw)
  raw = stripUnresolvedPlaceholders(raw)
  if (locale) raw = enforceLangAttribute(raw, locale)
  return raw
}
