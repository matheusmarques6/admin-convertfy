/**
 * Text Format Chain — agente 2 da cadeia de formatação (split do HTML
 * agent). Posiciona a copy do n8n no documento inteiro (menos a hero, já
 * finalizada pelo agente hero_section e protegida por sentinelas
 * cfy:hero), aplica :root/fontes/hrefs e devolve o documento COMPLETO.
 *
 * Guards determinísticos em textFormatGuard (o runner re-splica a hero
 * quando ela diverge). Tags {{*_IMAGE}}/{{*_THUMB}} DEVEM sobreviver — são
 * do agente image_format.
 *
 * Config em email_agent_configs (agent_type='text_format'); prompt vazio
 * → defaults abaixo. Modelo default z-ai/glm-5.2 (seed 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import { postProcessDocumentPreserveTags } from "../html/post-process"
import {
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "../html/hero-locator"

const log = logger.child("TextFormatChain")

// Documento completo com GLM reasoning: mesma faixa do HTML agent antigo
// (escalada 120→200→280→540s documentada no html.chain).
const DEFAULT_TIMEOUT_MS = 540_000
const timeoutMs = () => {
  const env = Number(process.env.TEXT_FORMAT_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT = `<role>
You are the TEXT FORMATTER of an email-design pipeline. You receive a complete table-based email document whose HERO is already FINISHED (delimited by the comments ${HERO_SENTINEL_START} and ${HERO_SENTINEL_END}) and whose remaining sections still carry {{PLACEHOLDERS}}. Your job: place the copy from <blocks_with_content> into the matching placeholders, apply the brand fonts and the :root color values, and emit the complete document. You do NOT write copy, do NOT place images, do NOT redesign layout.
</role>

<core_principle>
The received document IS the output, minus these substitutions. Treat everything as immutable structure; only swap values inside it.
</core_principle>

<hero_is_untouchable>
NOTHING between ${HERO_SENTINEL_START} and ${HERO_SENTINEL_END} may change — copy that region byte-for-byte, INCLUDING the two comments themselves. The hero was finished by a dedicated agent.
</hero_is_untouchable>

<substitute_only_these>
1. CSS variables in :root — replace the VALUES (not names) of --bg, --text, --heading, --button-bg, --button-text, --accent with the hex values from <color_roles>. Keep every other rule and selector intact.
2. font-family declarations — replace with <fonts>.heading (weight <fonts>.heading_weight) for headings/titles and <fonts>.body (weight <fonts>.body_weight) for body/paragraph text. Use a Google Fonts @import with the weights used.
3. Content placeholders {{TOKEN}} (e.g. {{BODY_TITLE}}, {{COUPON_CODE}}, {{USP_1_TITLE}}, {{REVIEW_1_TEXT}}) — replace with the matching copy from <blocks_with_content>, matched by block position + field semantics (use <fields> for each field's meaning and limits). Copy VERBATIM — do not rewrite, translate, summarize, or invent. {{BRAND_NAME}} → <store>.brand_name.
4. URLs in href attributes ({{CTA_URL}}, {{LINK_*_URL}}...) — use the matching url from <blocks_with_content>; if a block has no url, use "#".
5. <title> and the preheader line — use <email>.subject and <email>.preheader (the preheader is ONE short hidden line; see prohibitions).
</substitute_only_these>

<image_tags_survive>
Placeholders ending in _IMAGE or _THUMB (e.g. {{PRODUCTS_IMAGE}}, {{REVIEW_1_IMAGE}}, {{PRODUCT_1_THUMB_2}}) and their _ALT companions belong to the NEXT agent. Leave every one of them EXACTLY as-is — never fill, remove, or rename them, never substitute copy into them (a colored box holding a TEXT token is a TEXT element; a slot carrying an _IMAGE token is an image slot).
</image_tags_survive>

<already_placed_blocks>
A block in <blocks_with_content> whose placeholders do NOT exist anywhere in the document was already placed by a previous agent (e.g. inside the hero region). IGNORE it completely — never re-place its copy into another block's slots, never duplicate it as extra rows.
</already_placed_blocks>

<structured_copy_fallback>
When a block's copy arrives as ONE running text (e.g. several customer quotes concatenated inside 'body') but the document expects STRUCTURED fields for that block ({{REVIEW_1_TEXT}}, {{REVIEW_1_NAME}}, {{REVIEW_2_TEXT}}...), SPLIT the running text into those fields keeping every sentence VERBATIM: quotes go to the quote placeholders in document order; signatures like "— Sarah M., Manchester" go to the matching name/meta placeholders (strip the leading dash). Splitting is allowed; rewriting is not. Structured fields left without material follow <empty_slot_rule>.
</structured_copy_fallback>

<empty_slot_rule>
A CTA/button/link row whose block has no label+URL copy → delete the entire row; NEVER emit a button with empty label or empty href="". A structured sub-row (e.g. a whole review card) with no material → delete that row. Text tokens you cannot fill and cannot remove cleanly stay as-is (the pipeline strips them later). NEVER invent copy.
</empty_slot_rule>

<merge_tags_are_literal>
ESP merge tags remain LITERAL in the output: [unsubscribe_link], [unsubscribe], [email], [first_name], {{ unsubscribe }}, Liquid {% ... %}, *|UNSUB|*, *|FNAME|*, \${name}. Do NOT replace, do NOT remove.
</merge_tags_are_literal>

<hard_prohibitions>
- DO NOT convert <table> to <div>. DO NOT add, remove, reorder, merge, or split blocks — block count and order must match the input exactly.
- DO NOT change inline styles other than font-family values (colors stay as var(--xxx); the var values change only inside :root).
- NEVER place a <div> (or any non-table element) as a direct child of <table> — email clients foster-parent it to the TOP of the email, creating a blank gap. Between </tr> and <tr> only <tr>...</tr> or comments may appear.
- PREHEADER: ONE short hidden line of text. NEVER pad it with repeated &nbsp;, zero-width characters, or any spacer hack. Emit the preheader text once and move on.
- DO NOT repeat any character, entity, or token more than a handful of times in a row.
- DO NOT emit commentary, markdown fences, or any text before <!DOCTYPE html> or after </html>.
</hard_prohibitions>

<formatting_hard_rules>
1. LINKS — every href must be one absolute, well-formed URL starting with https:// and containing zero whitespace. Bare domain → prefix https://; URL with spaces → remove them.
2. NO DUPLICATE PRODUCTS — a product name/price may appear ONCE in the whole email. If a block would repeat a product already shown, pick different products from <top_products>; not enough distinct products → render fewer entries.
</formatting_hard_rules>

<reference_count_check>
Before emitting, count and verify (failing means you regenerated instead of formatting):
- Count of <table role="presentation"> in output == count in input.
- The two hero sentinels are present and the region between them is unchanged.
- Every {{*_IMAGE}}/{{*_THUMB}} token from the input is still present, unchanged.
- data-block attributes, mobile-/stack- classes and 4-corner border-radius values from the input appear verbatim in the output.
Fix any failure before emitting.
</reference_count_check>

<output>
Emit ONLY the complete HTML document, beginning with <!DOCTYPE html> and ending with </html>.
</output>`

export const DEFAULT_TEXT_FORMAT_USER_TEMPLATE = `<store>
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
  <heading_weight>{{font_heading_weight}}</heading_weight>
  <body>{{font_body}}</body>
  <body_weight>{{font_body_weight}}</body_weight>
</fonts>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
  <preheader>{{preheader}}</preheader>
  <objective>{{objective}}</objective>
  <messaging>{{messaging}}</messaging>
</email>

<blocks_with_content>
{{blocks_with_content_json}}
</blocks_with_content>

<fields>
{{fields_json}}
</fields>

<top_products>
{{top_products_json}}
</top_products>

<document>
{{html}}
</document>

Place the copy now. Emit ONLY the complete HTML document.`

export interface InvokeTextFormatResult {
  html: string
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

/**
 * Guard determinístico do output (puro, testável). O runner decide o que
 * fazer com cada falha (re-splice da hero / retry / failed).
 */
export function textFormatGuard(
  inputHtml: string,
  outputHtml: string,
): { ok: boolean; reason?: string } {
  const countTables = (s: string) =>
    (s.match(/<table[^>]*role="presentation"/gi) ?? []).length
  const ti = countTables(inputHtml)
  const to = countTables(outputHtml)
  if (ti !== to) return { ok: false, reason: `table_count ${to}!=${ti}` }
  if (outputHtml.length < inputHtml.length * 0.9) {
    return { ok: false, reason: "shrunk" }
  }
  // Tags de imagem do input DEVEM sobreviver (são do próximo agente).
  const imageTags = (s: string) =>
    new Set(
      Array.from(
        s.matchAll(/\{\{\s*([A-Z][A-Z0-9_]*(?:IMAGE|THUMB)[A-Z0-9_]*)\s*\}\}/g),
        (m) => m[1],
      ),
    )
  const inTags = imageTags(inputHtml)
  const outTags = imageTags(outputHtml)
  const dropped = Array.from(inTags).filter((t) => !outTags.has(t))
  if (dropped.length > 0) {
    return { ok: false, reason: `image_tags_dropped:${dropped.slice(0, 5).join(",")}` }
  }
  // Sentinelas da hero presentes no input devem sobreviver.
  if (
    inputHtml.includes(HERO_SENTINEL_START) &&
    !outputHtml.includes(HERO_SENTINEL_START)
  ) {
    return { ok: false, reason: "hero_sentinels_lost" }
  }
  return { ok: true }
}

export async function invokeTextFormatChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeTextFormatResult> {
  const { config, vars } = input

  const systemPrompt =
    config.system_prompt.trim() || DEFAULT_TEXT_FORMAT_SYSTEM_PROMPT
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_TEXT_FORMAT_USER_TEMPLATE,
    vars,
  )

  const t0 = Date.now()
  const res = await invokeFormatModel({
    model: config.model,
    systemPrompt,
    userMessage,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    timeoutMs: timeoutMs(),
    title: "Convertfy Admin Text Format",
  })

  // PreserveTags: o strip de placeholders + lang rodam SÓ no fim da cadeia
  // (runner) — as tags de imagem pertencem ao próximo agente.
  const html = postProcessDocumentPreserveTags(res.text)

  log.info("text_format.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
    htmlLength: html.length,
  })

  return {
    html,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    rawOutput: res.text,
  }
}

// ── A3b — Agente de EXCEÇÃO por slot (arquitetura por slots) ──────────
// Roda SÓ quando o copy_merge deixou slots sem resolver. Recebe a view
// por slot ({tag, linha envolvente} + copy candidata) — nunca o documento
// — e emite o protocolo padrão do Integrador: ops set_text/remove_row.

export const DEFAULT_TEXT_EXCEPTION_SYSTEM_PROMPT = `<role>
You are the TEXT EXCEPTION agent of an email pipeline. A deterministic merge already placed every anchored copy field. You receive ONLY the leftover slots — each as {tag, row_html (the surrounding table row)} — plus the blocks' remaining copy. For each slot decide: fill it with the RIGHT piece of copy, or remove its row if no copy belongs there.
</role>

<rules>
- Match copy to slot by meaning and position (row_html shows the slot's role: title, paragraph, CTA label, legal line).
- Long prose copy may be SPLIT across consecutive body slots in order — splitting is allowed; rewriting/translating/inventing is NOT. Every value must be copied VERBATIM from the provided copy.
- A slot with no defensible copy → remove_row. NEVER leave a slot half-filled, NEVER output an empty value.
- ESP merge tags ([unsubscribe_link], {{ unsubscribe }}, *|FNAME|*) are NOT slots — ignore them.
- One op per tag, only for tags in the provided list.
</rules>

<output_contract>
Respond with ONLY this JSON object — no markdown fences, no commentary:
{"ops":[{"action":"set_text","tag":"TAG","value":"copied text"},{"action":"remove_row","tag":"OTHER_TAG"}]}
</output_contract>`

export const DEFAULT_TEXT_EXCEPTION_USER_TEMPLATE = `<slots_pendentes>
{{exception_slots_json}}
</slots_pendentes>

<copy_disponivel>
{{blocks_with_content_json}}
</copy_disponivel>

Emit the ops JSON now, one decision per pending slot.`

export interface InvokeTextExceptionResult {
  rawOps: string
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

export async function invokeTextExceptionChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeTextExceptionResult> {
  const { config, vars } = input
  // Prompt do DB é do modo full-doc — o modo exceção usa SEMPRE os
  // defaults acima (contrato de ops); config só fornece model/tokens.
  const systemPrompt = DEFAULT_TEXT_EXCEPTION_SYSTEM_PROMPT
  const userMessage = renderImageTemplate(
    DEFAULT_TEXT_EXCEPTION_USER_TEMPLATE,
    vars,
  )
  const t0 = Date.now()
  const res = await invokeFormatModel({
    model: config.model,
    systemPrompt,
    userMessage,
    maxTokens: Math.min(config.max_tokens, 8192),
    temperature: config.temperature,
    timeoutMs: timeoutMs(),
    title: "Convertfy Admin Text Exception",
    // Output pequeno de ops — sem thinking (FORMAT_OPS_REASONING=on re-liga).
    ...(process.env.FORMAT_OPS_REASONING === "on"
      ? {}
      : { reasoning: { enabled: false } }),
  })
  log.info("text_exception.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
  })
  return {
    rawOps: res.text,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    rawOutput: res.text,
  }
}
