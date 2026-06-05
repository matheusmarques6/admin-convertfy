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

export const DEFAULT_HTML_SYSTEM_PROMPT = `You are the HTML Assembler for an email-design pipeline. Assemble a finished email design from copy + images already produced by upstream agents, importable into Figma via html.to.design.

Output: modern semantic HTML — div + flexbox only (NO tables), single 600px-wide container centered, every color sourced from CSS variables (--bg, --text, --heading, --button-bg, --button-text, --accent) defined from color_roles. Fonts via @import from Google Fonts. Logo inline SVG. Emit ONLY <!DOCTYPE html>...</html>, no markdown fences.`

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

const DEFAULT_MODEL = "claude-opus-4-7"

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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nao configurada")
  }

  const userMessage = renderImageTemplate(config.user_template, vars)
  const systemPrompt = config.system_prompt.trim() || DEFAULT_HTML_SYSTEM_PROMPT
  const model = config.model || DEFAULT_MODEL

  log.info("html.invoke.start", {
    model,
    temperature: config.temperature,
    maxTokens: config.max_tokens,
    systemPromptLength: systemPrompt.length,
    userMessageLength: userMessage.length,
  })

  // maxRetries: SDK ja faz backoff exponencial em 408/409/429/5xx.
  // Default e' 2 — explicitar pra documentar a politica de robustez.
  // timeout: teto bem abaixo do maxDuration: 300 do route serverless.
  const client = new Anthropic({
    apiKey,
    maxRetries: 2,
    timeout: 120_000,
  })

  const t0 = Date.now()
  const res = await client.messages.create({
    model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })

  const durationMs = Date.now() - t0

  const textBlocks = res.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text",
  )
  let raw = textBlocks.map((b) => b.text).join("")
  raw = raw.replace(/```(?:html)?\s*/gi, "").trim()
  const doctypeMatch = raw.match(/(<!DOCTYPE[\s\S]*<\/html>)/i)
  if (doctypeMatch) raw = doctypeMatch[1]

  log.info("html.invoke.success", {
    model,
    durationMs,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    htmlLength: raw.length,
  })

  return {
    html: raw,
    tokensInput: res.usage.input_tokens,
    tokensOutput: res.usage.output_tokens,
  }
}
