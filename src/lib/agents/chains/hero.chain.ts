/**
 * Hero Chain — agente 1 da cadeia de formatação (split do HTML agent).
 *
 * Finaliza a HERO SECTION do email. Desde o enxerto por ID (hero-graft,
 * jul/2026) a região que chega já É o HTML canônico da variante escolhida
 * pelo Montador — o código a enxertou antes da cadeia. Nesse modo
 * (`hero_source=library`) o agente só SUBSTITUI: copy, imagem, logo,
 * fontes/cores. Quando o enxerto não acontece (`hero_source=montador`:
 * variante ausente, região não localizável, fragmento inutilizável) volta
 * o modo antigo, em que a variante (`html` + `rendered_html`) é a
 * referência estrutural a restaurar.
 *
 * Devolve SÓ o fragmento da hero (modo "fragment", splice por código via
 * hero-locator) ou o documento completo (modo "full_doc", fallback quando
 * a região não é localizável).
 *
 * Config em email_agent_configs (agent_type='hero_section'); prompt vazio
 * → defaults abaixo. Modelo default moonshotai/kimi-k3 (swap 20261047; seed original 20261039).
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

<hero_source_modes>
<hero_region> is the hero as it currently sits in this email. <hero_source> says where it came from, and that decides how much freedom you have:

- <hero_source>library</hero_source> — the region was grafted by CODE straight from the component library: it IS the authored variant, byte for byte, with its {{PLACEHOLDERS}} intact. It is STRUCTURALLY FINAL. Keep every row, cell, background band, button and image slot exactly where and as they are. Your job is SUBSTITUTION ONLY: copy into the placeholders, image URL, logo, fonts/colors. Do not add rows, do not reorder, do not merge cells, do not redesign, do not "improve" it. <hero_variant_source> and <hero_variant_rendered> arrive EMPTY in this mode on purpose — the region already is the reference.

- <hero_source>montador</hero_source> — the region came from the assembler and may have been flattened. Here <hero_variant_rendered> (finished look) and <hero_variant_source> (library HTML with {{PLACEHOLDERS}}) are the structural truth, and you restore the variant's anatomy: logo band, headline, body, buttons, image — in the VARIANT's order, even if the region arrived simplified; background bands survive via bgcolor/inline style (never collapse a designed band to white); CTA slots keep the BUTTON finish (padded cell/link with background + text color), never downgraded to a bare text link; logo contrast is settled after the band background (dark band → <logos>.dark, light band → <logos>.light). If BOTH are empty, treat the region as authored correctly and only substitute.

In both modes the received <hero_region> defines the BOUNDARIES of the hero and any NEIGHBOR content that must be preserved verbatim (coupon bar text, menu links). <variant_schema> explains each field's semantics and limits.
</hero_source_modes>

<hero_image_hard_rule>
The hero image slot is an \`<img>\` carrying the \`{{HERO_IMAGE}}\` placeholder (or a hardcoded legacy URL). Your ONLY job on the image is to SWAP that placeholder/URL for <hero_image>.url (and \`{{HERO_IMAGE_ALT}}\` for a short description). Do NOT convert the image to a CSS background, do NOT add overlays/scrims/\`position:absolute\`, do NOT set a fixed height (keep \`height:auto\`), do NOT crop. The image row's POSITION follows the variant's order (see structure_fidelity); with no variant, do NOT reorder image row vs text rows.
If <hero_image>.url is EMPTY (generation failed upstream): remove only the image row (or placeholder cell) and keep the text rows. NEVER invent a URL, NEVER reuse another image.
</hero_image_hard_rule>

<copy_rules>
<hero_content> is an ARRAY: the copy of EVERY block that lives inside the hero region. Composite hero variants include neighbor blocks (coupon banner, logo bar) — their copy comes in the array too, each entry with its own type/label/content. Fill EVERY placeholder in the region ({{COUPON_CODE}}, {{HERO_HEADLINE}}, {{HERO_CTA_LABEL}}...) with the matching field from the RIGHT block, VERBATIM — do not rewrite, translate, summarize, or invent copy. CTA hrefs come from the blocks' URLs.
</copy_rules>

<empty_slot_rule>
Removing a slot is the LAST resort, and only on hard evidence that the copy for it does not exist.
- If <hero_content> is an EMPTY array, the copy for this region simply has not landed yet: KEEP every placeholder exactly as it is and remove NOTHING. A later deterministic stage fills them by code.
- If <hero_content> HAS entries but none of them carries a value for a given slot, then: a CTA/button whose label AND url are both absent → delete that entire row/cell (never emit a button with empty label or href=""); a text placeholder with no matching content → remove its row only if it is the row's only content, otherwise leave the token as-is (the pipeline strips it later).
- NEVER invent copy, labels or URLs to fill a slot.
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

<hero_source>{{hero_source}}</hero_source>

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

/**
 * Monta o system prompt do hero — story CM-1.
 *
 * NÃO passa por `renderImageTemplate`. Aquele renderer substitui QUALQUER
 * `{{ALGO}}` e resolve var desconhecida para string VAZIA, então ele
 * apagava as tags canônicas que este prompt usa como exemplo:
 * `{{HERO_IMAGE}}`, `{{HERO_IMAGE_ALT}}`, `{{COUPON_CODE}}`,
 * `{{HERO_HEADLINE}}`, `{{HERO_CTA_LABEL}}`, `{{PLACEHOLDERS}}` e
 * `{{ unsubscribe }}`. O agente cuja única função é preencher esses
 * placeholders vinha sendo instruído com a lista em branco — e o modo
 * `library` prometia "os {{PLACEHOLDERS}} intactos" com a palavra apagada.
 *
 * O único ponto de interpolação legítimo aqui é o contrato de output, que
 * é substituído literalmente. Se precisar de mais vars no system, adicione
 * substituições explícitas — nunca volte a chamar o renderer.
 */
export function buildHeroSystemPrompt(
  systemPrompt: string,
  outputContract: string,
): string {
  return (systemPrompt.trim() || DEFAULT_HERO_SYSTEM_PROMPT).replaceAll(
    "{{output_contract}}",
    outputContract,
  )
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
  const systemPrompt = buildHeroSystemPrompt(
    config.system_prompt,
    outputContract,
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
    // Kimi K3 tem reasoning always-on — sem o corte a hero volta a
    // estourar timeout pensando. FORMAT_OPS_REASONING=on re-liga.
    ...(process.env.FORMAT_OPS_REASONING === "on"
      ? {}
      : { reasoning: { enabled: false } }),
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
