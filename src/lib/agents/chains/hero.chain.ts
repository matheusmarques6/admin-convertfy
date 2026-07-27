/**
 * Hero Chain — agente 1 da cadeia de formatação (split do HTML agent).
 *
 * Monta a HERO SECTION do email a partir da variante que o Montador
 * escolheu: recebe o `html` da variante (biblioteca), o `rendered_html`
 * (gold reference — como a variante fica PRONTA), o output_schema, a copy
 * da hero (n8n), a imagem gerada, a tipografia/cores aprovadas e as logos
 * clara/escura. Devolve SÓ o fragmento da hero (modo "fragment", splice
 * por código via hero-locator) ou o documento completo (modo "full_doc",
 * fallback quando a região não é localizável).
 *
 * Config em email_agent_configs (agent_type='hero_section'); prompt vazio
 * → defaults abaixo. Modelo default z-ai/glm-5.2 (seed 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import {
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "../html/hero-locator"

const log = logger.child("HeroChain")

// GLM-5.2 é reasoning model (pensa antes de escrever); o fragmento é
// pequeno mas o thinking consome tempo — 240s dá folga sem segurar a rota.
const DEFAULT_TIMEOUT_MS = 240_000
const timeoutMs = () => {
  const env = Number(process.env.HERO_CHAIN_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const HERO_OUTPUT_OPEN = "<CFY_HERO_OUTPUT>"
export const HERO_OUTPUT_CLOSE = "</CFY_HERO_OUTPUT>"

/** Output inválido no modo fragmento (sem wrapper / vazio) — retryable. */
export class HeroOutputInvalidError extends Error {
  readonly raw: string
  constructor(message: string, raw = "") {
    super(message)
    this.name = "HeroOutputInvalidError"
    this.raw = raw
  }
}

export type HeroChainMode = "fragment" | "full_doc"

export const DEFAULT_HERO_SYSTEM_PROMPT = `<role>
You are the HERO SECTION finisher of an email-design pipeline. Upstream, the Montador assembled the full email from library components and a copy agent wrote the hero copy. Your ONLY job is to deliver the hero section of THIS email finished to the standard of the library variant it came from: image placed, copy placed, typography and colors from the approved brand identity, logo correct. You never touch any other section of the email.
</role>

<gold_reference>
<hero_variant_rendered> is the FINISHED look of this hero variant — a real, rendered example of how this hero looks when done right (image treatment, spacing, text placement, button finish). Reproduce THAT finish using THIS store's data. <hero_variant_source> is the same variant as authored in the library (with {{PLACEHOLDERS}}); <variant_schema> explains each field's semantics and limits.
If <hero_variant_rendered> and <hero_variant_source> are EMPTY (variant unknown — degraded mode): treat <hero_region> as already authored correctly; keep its structure byte-for-byte and only perform the substitutions below (image swap, copy fill, fonts/colors/logo).
</gold_reference>

<structure_fidelity>
When a variant IS provided, the VARIANT is the structural truth of the hero's interior — not the received region. The Montador may have flattened the region while assembling; your job is to deliver the hero at the VARIANT's standard. Concretely:
- Row order and anatomy follow the variant/rendered reference: logo band, headline, body, buttons, image — in the VARIANT's order, even if <hero_region> arrived in a different/simplified order.
- Background bands SURVIVE: if the variant shows a colored band (logo bar with dark background, tinted hero background), reproduce it via bgcolor/inline style — using the variant's var(--xxx) or <color_roles>. Never let a designed band collapse to plain white.
- CTA slots keep the variant's BUTTON finish: a padded cell/link with background color + text color from <color_roles> (or the variant's vars). NEVER downgrade a styled button into a bare underlined text link.
- Logo contrast is settled AFTER the band background: dark band → <logos>.dark (fallback <logos>.light), light band → <logos>.light. A light/white logo sitting on a white background is ALWAYS wrong — if the variant's logo band is dark, keep it dark so the logo stays visible.
- The received <hero_region> still defines the BOUNDARIES of the hero inside the email and any NEIGHBOR content that must be preserved verbatim (coupon bar text, menu links).
</structure_fidelity>

<hero_image_hard_rule>
The hero image slot is an \`<img>\` carrying the \`{{HERO_IMAGE}}\` placeholder (or a hardcoded legacy URL). Your ONLY job on the image is to SWAP that placeholder/URL for <hero_image>.url (and \`{{HERO_IMAGE_ALT}}\` for a short description). Do NOT convert the image to a CSS background, do NOT add overlays/scrims/\`position:absolute\`, do NOT set a fixed height (keep \`height:auto\`), do NOT crop. The image row's POSITION follows the variant's order (see structure_fidelity); with no variant, do NOT reorder image row vs text rows.
If <hero_image>.url is EMPTY (generation failed upstream): remove only the image row (or placeholder cell) and keep the text rows. NEVER invent a URL, NEVER reuse another image.
</hero_image_hard_rule>

<copy_rules>
<hero_content> is an ARRAY: the copy of EVERY block that lives inside the hero region. Composite hero variants include neighbor blocks (coupon banner, logo bar) — their copy comes in the array too, each entry with its own type/label/content. Fill EVERY placeholder in the region ({{COUPON_CODE}}, {{HERO_HEADLINE}}, {{HERO_CTA_LABEL}}...) with the matching field from the RIGHT block, VERBATIM — do not rewrite, translate, summarize, or invent copy. CTA hrefs come from the blocks' URLs.
</copy_rules>

<empty_slot_rule>
A slot with NO matching copy is REMOVED, never left half-empty:
- CTA/button/link row whose block copy has no label+URL for it → delete the entire row/cell (same principle as the missing image). NEVER emit a button with empty label or empty href="".
- A text placeholder with no matching content: remove its row if it is the row's only content; otherwise leave the token as-is (the pipeline strips it later). NEVER invent text.
</empty_slot_rule>

<merge_tags_are_literal>
ESP merge tags ([unsubscribe_link], [first_name], {{ unsubscribe }}, {% ... %}, *|FNAME|*) remain LITERAL. Do not replace or remove them.
</merge_tags_are_literal>

<identity_rules>
- Fonts: headings/display use <fonts>.heading (weight <fonts>.heading_weight); body/paragraph text uses <fonts>.body (weight <fonts>.body_weight).
- Colors: where the variant uses var(--xxx), KEEP the var reference (the :root values are handled downstream). Explicit hex values you introduce must come ONLY from <color_roles>.
- Logo (when the hero carries one): on a DARK background use <logos>.dark if non-empty, otherwise <logos>.light; on a light background use <logos>.light. Never both.
</identity_rules>

<structural_rules>
Table-based email HTML only. Never place a <div> (or any non-table element) as a direct child of <table> — between </tr> and <tr> only <tr>...</tr> or comments may appear. Keep widths within the 600px column. No <style> blocks of your own — inline styles only, consistent with the variant.
</structural_rules>

<output_contract>
{{output_contract}}
</output_contract>`

export const HERO_OUTPUT_CONTRACT_FRAGMENT = `Emit ONLY the finished hero fragment, wrapped EXACTLY in ${HERO_OUTPUT_OPEN} and ${HERO_OUTPUT_CLOSE}. The fragment must begin and end at the SAME boundary elements as the received <hero_region> (a sequence of complete <table>...</table> blocks). No <!DOCTYPE>, no <html>/<head>/<body>, no markdown fences, no commentary, nothing outside the wrapper.`

export const HERO_OUTPUT_CONTRACT_FULL_DOC = `Emit the COMPLETE email document, from <!DOCTYPE html> to </html>, with ONLY the hero section changed — every other section byte-for-byte identical to <montador_html>. No markdown fences, no commentary.`

export const DEFAULT_HERO_USER_TEMPLATE = `<store>
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

<logos>
  <light>{{logo_light}}</light>
  <dark>{{logo_dark}}</dark>
</logos>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
</email>

<hero_variant_source>
{{hero_variant_html}}
</hero_variant_source>

<hero_variant_rendered>
{{hero_variant_rendered_html}}
</hero_variant_rendered>

<variant_schema>
{{hero_variant_schema_json}}
</variant_schema>

<hero_content>
{{hero_content_json}}
</hero_content>

<hero_image url="{{hero_image_url}}" alt="{{hero_image_alt}}" />

<montador_html>
{{montador_html}}
</montador_html>

<hero_region>
{{hero_region_html}}
</hero_region>

Finish the hero section now, following the output contract.`

export interface InvokeHeroResult {
  /** Fragmento da hero (modo fragment) OU documento completo (full_doc). */
  output: string
  mode: HeroChainMode
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

/** Extrai o fragmento entre os wrappers; lança HeroOutputInvalidError. */
export function parseHeroFragment(raw: string): string {
  const cleaned = raw.replace(/```(?:html)?\s*/gi, "").replace(/```/g, "")
  const open = cleaned.indexOf(HERO_OUTPUT_OPEN)
  const close = cleaned.lastIndexOf(HERO_OUTPUT_CLOSE)
  if (open === -1 || close === -1 || close <= open) {
    throw new HeroOutputInvalidError("output sem wrapper CFY_HERO_OUTPUT", raw)
  }
  let fragment = cleaned.slice(open + HERO_OUTPUT_OPEN.length, close).trim()
  // Se o modelo ecoou as sentinelas do splice, remove — o splice injeta as dele.
  fragment = fragment
    .replaceAll(HERO_SENTINEL_START, "")
    .replaceAll(HERO_SENTINEL_END, "")
    .trim()
  if (!fragment || !/<table\b/i.test(fragment)) {
    throw new HeroOutputInvalidError("fragmento vazio ou sem <table>", raw)
  }
  if (/<!DOCTYPE|<html[\s>]|<body[\s>]/i.test(fragment)) {
    throw new HeroOutputInvalidError(
      "fragmento contém documento (esperava só a hero)",
      raw,
    )
  }
  return fragment
}

/**
 * Guard estrutural do modo full_doc (puro): o documento devolvido precisa
 * preservar a estrutura do input — só a hero pode ter mudado. Tags de
 * imagem NÃO-hero devem sobreviver (a da hero pode ter sido consumida).
 * Tolerância de ±3 tabelas: o structure_fidelity permite reestruturar o
 * INTERIOR da hero pra espelhar a variante (faixa de logo, botões), o que
 * legitimamente muda algumas tabelas aninhadas — reescrita do documento
 * inteiro continua barrada pelo shrink + tags de imagem.
 */
export function heroFullDocGuard(
  inputHtml: string,
  outputHtml: string,
): { ok: boolean; reason?: string } {
  if (!/<\/html>/i.test(outputHtml)) return { ok: false, reason: "no_close_html" }
  const count = (s: string) => (s.match(/<table[\s>]/gi) ?? []).length
  const ti = count(inputHtml)
  const to = count(outputHtml)
  if (Math.abs(ti - to) > 3) {
    return { ok: false, reason: `table_count ${to}!=${ti}` }
  }
  if (outputHtml.length < inputHtml.length * 0.7) {
    return { ok: false, reason: "shrunk" }
  }
  const nonHeroImageTags = (s: string) =>
    new Set(
      Array.from(
        s.matchAll(/\{\{\s*([A-Z][A-Z0-9_]*(?:IMAGE|THUMB)[A-Z0-9_]*)\s*\}\}/g),
        (m) => m[1],
      ).filter((t) => !t.startsWith("HERO")),
    )
  const inTags = nonHeroImageTags(inputHtml)
  const outTags = nonHeroImageTags(outputHtml)
  const dropped = Array.from(inTags).filter((t) => !outTags.has(t))
  if (dropped.length > 0) {
    return { ok: false, reason: `image_tags_dropped:${dropped.slice(0, 5).join(",")}` }
  }
  return { ok: true }
}

export async function invokeHeroChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
  mode: HeroChainMode
}): Promise<InvokeHeroResult> {
  const { config, vars, mode } = input

  const outputContract =
    mode === "fragment"
      ? HERO_OUTPUT_CONTRACT_FRAGMENT
      : HERO_OUTPUT_CONTRACT_FULL_DOC
  const systemPrompt = renderImageTemplate(
    config.system_prompt.trim() || DEFAULT_HERO_SYSTEM_PROMPT,
    { output_contract: outputContract },
  )
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_HERO_USER_TEMPLATE,
    { ...vars, output_contract: outputContract },
  )

  const t0 = Date.now()
  const res = await invokeFormatModel({
    model: config.model,
    systemPrompt,
    userMessage,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    timeoutMs: timeoutMs(),
    title: "Convertfy Admin Hero Section",
  })

  const output =
    mode === "fragment" ? parseHeroFragment(res.text) : res.text

  log.info("hero.invoke.success", {
    model: config.model,
    mode,
    durationMs: Date.now() - t0,
    outputChars: output.length,
  })

  return {
    output,
    mode,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    rawOutput: res.text,
  }
}
