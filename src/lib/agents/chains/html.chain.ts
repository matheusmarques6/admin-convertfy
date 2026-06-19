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
    const html = postProcessHtml(or.text)
    log.info("html.invoke.success", {
      model,
      via: "openrouter",
      durationMs: Date.now() - t0,
      inputTokens: or.tokensInput,
      outputTokens: or.tokensOutput,
      htmlLength: html.length,
    })
    return { html, tokensInput: or.tokensInput, tokensOutput: or.tokensOutput }
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
  const html = postProcessHtml(textBlocks.map((b) => b.text).join(""))

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

/** Erro de output truncado — o modelo nao fechou o documento (`</html>`). */
export class HtmlTruncatedError extends Error {
  constructor(htmlLength: number) {
    super(`HTML output truncado (sem </html>, ${htmlLength} chars)`)
    this.name = "HtmlTruncatedError"
  }
}

/** Remove fences markdown e extrai o fragmento <!DOCTYPE...</html> se houver. */
function postProcessHtml(rawText: string): string {
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
  return raw
}
