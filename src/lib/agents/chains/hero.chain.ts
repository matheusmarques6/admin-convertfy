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
 * Devolve SEMPRE o fragmento da hero — o splice é por código, via
 * hero-locator — mais um relatório do que descartou (CM-5). O modo
 * `full_doc`, em que o agente reescrevia o documento inteiro quando a
 * região não era localizável, foi removido: com a montagem por código
 * (CM-2) os marcadores são sempre válidos, então a região é sempre
 * localizável, e autorizar a reescrita do email todo era a maior
 * superfície de risco da cadeia para um fallback sem causa.
 *
 * Config em email_agent_configs (agent_type='hero_section'); prompt vazio
 * → defaults abaixo. Modelo default moonshotai/kimi-k3 (swap 20261047; seed original 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import { withUsage, type StepUsage } from "./step-usage"
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

// Relatório do que o agente descartou (story CM-5). Hoje, quando ele remove
// uma linha de CTA por falta de copy — comportamento CORRETO e previsto no
// <empty_slot_rule> — ninguém fica sabendo. É declaração, não instrução: o
// código não age sobre ele, só registra e alimenta o QA.
export const HERO_REPORT_OPEN = "<CFY_HERO_REPORT>"
export const HERO_REPORT_CLOSE = "</CFY_HERO_REPORT>"

/** Output inválido no modo fragmento (sem wrapper / vazio) — retryable. */
export class HeroOutputInvalidError extends Error {
  readonly raw: string
  constructor(message: string, raw = "") {
    super(message)
    this.name = "HeroOutputInvalidError"
    this.raw = raw
  }
}

export const DEFAULT_HERO_SYSTEM_PROMPT = `<role>
You are the HERO SECTION finisher of an email-design pipeline. Upstream, the Montador assembled the full email from library components and a copy agent wrote the hero copy. Your ONLY job is to deliver the hero section of THIS email finished to the standard of the library variant it came from: image placed, copy placed, typography and colors from the approved brand identity, logo correct. You never touch any other section of the email.
</role>

<hero_source_modes>
<hero_region> is the hero as it currently sits in this email. <hero_source> says where it came from, and that decides how much freedom you have:

- <hero_source>library</hero_source> — the region was grafted by CODE straight from the component library: it IS the authored variant, byte for byte, with its {{PLACEHOLDERS}} intact. It is STRUCTURALLY FINAL. Keep every row, cell, background band, button and image slot exactly where and as they are. Your job is SUBSTITUTION ONLY: copy into the placeholders, image URL, logo, fonts/colors. Do not add rows, do not reorder, do not merge cells, do not redesign, do not "improve" it. <hero_variant_source> arrives EMPTY here on purpose — the region already is it.

- <hero_source>montador</hero_source> — LEGACY fallback: the region came from a reference assembled by the old LLM Montador (before the code-side assembly) and may have been flattened. Here <hero_variant_rendered> (finished look) and <hero_variant_source> (library HTML with {{PLACEHOLDERS}}) are the structural truth, and you restore the variant's anatomy: logo band, headline, body, buttons, image — in the VARIANT's order, even if the region arrived simplified; background bands survive via bgcolor/inline style (never collapse a designed band to white); CTA slots keep the BUTTON finish (padded cell/link with background + text color), never downgraded to a bare text link; logo contrast is settled after the band background (dark band → <logos>.dark, light band → <logos>.light). If BOTH are empty, treat the region as authored correctly and only substitute.

In both modes the received <hero_region> defines the BOUNDARIES of the hero and any NEIGHBOR content that must be preserved verbatim (coupon bar text, menu links). <variant_schema> explains each field's semantics and limits.
</hero_source_modes>

<finish_reference>
<hero_variant_rendered> is the FINISHED look of this variant: a real example of how it appears when done right. It is your reference for FINISH — image treatment and crop, spacing rhythm, text hierarchy and weight, button proportion, how the logo sits on its band. Match that finish with THIS store's data.

It is NOT your reference for structure. Rows, order and anatomy come from the region you received (mode library) or from <hero_variant_source> (mode montador). If the example shows something the region does not have, you do NOT add it.

The example may be a flattened screenshot wrapped in HTML, or may predate the current version of the variant — that is expected and does not make it useless: proportion and hierarchy still read. Where it disagrees with the region, THE REGION WINS. Empty means no example was ever registered for this variant; work from the region alone.

The example is never a model for the SHAPE of your answer. Whatever it looks like, your output is the hero fragment and nothing else — see the output contract.
</finish_reference>

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

export const HERO_OUTPUT_CONTRACT = `Emit the finished hero fragment wrapped EXACTLY in ${HERO_OUTPUT_OPEN} and ${HERO_OUTPUT_CLOSE}. The fragment must begin and end at the SAME boundary elements as the received <hero_region> (a sequence of complete <table>...</table> blocks). No <!DOCTYPE>, no <html>/<head>/<body>, no markdown fences, no commentary.

After the fragment, emit a short report wrapped EXACTLY in ${HERO_REPORT_OPEN} and ${HERO_REPORT_CLOSE}, as JSON:
{"imagem":"aplicada"|"ausente","campos_vazios":["TAG",...],"linhas_removidas":["cta","imagem",...],"logo":"light"|"dark"|"nenhuma"}

The report is what the pipeline knows about what you discarded. Report it honestly: a removed CTA row or an unfilled placeholder MUST appear there.`

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

/** O que o agente declara ter descartado. Opcional: ausência não falha. */
export interface HeroReport {
  imagem?: "aplicada" | "ausente"
  campos_vazios?: string[]
  linhas_removidas?: string[]
  logo?: "light" | "dark" | "nenhuma"
}

export interface InvokeHeroResult {
  /** Fragmento finalizado da hero. */
  output: string
  /** Relatório declarado pelo agente; null quando ausente ou ilegível. */
  report: HeroReport | null
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

/**
 * Tira do fragmento qualquer vestígio do relatório.
 *
 * Três formas de vazamento, todas vistas ou plausíveis: o bloco completo
 * dentro do output; a tag de abertura sem fechamento (e o JSON escorrendo
 * até o fim); tags órfãs. `<CFY_HERO_REPORT>` é tag desconhecida no
 * navegador — some da renderização e deixa só o JSON à mostra, que foi
 * exatamente o que apareceu no rodapé do email.
 */
export function stripHeroReport(fragment: string): string {
  let out = fragment.replace(
    new RegExp(`${HERO_REPORT_OPEN}[\\s\\S]*?${HERO_REPORT_CLOSE}`, "gi"),
    "",
  )
  // Abertura sem fechamento: o resto do texto é relatório, não conteúdo.
  const orphan = out.indexOf(HERO_REPORT_OPEN)
  if (orphan !== -1) out = out.slice(0, orphan)
  return out.replaceAll(HERO_REPORT_CLOSE, "").trim()
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
  // O relatório é RECIBO, não conteúdo. Quando o modelo o emite DENTRO do
  // wrapper de output (ou esquece de fechar o output antes dele), o JSON
  // entra no documento e o cliente de email o mostra como texto no rodapé —
  // aconteceu, e o email saiu com {"imagem":"aplicada",...} impresso na tela.
  // O relatório continua sendo lido de `raw` por parseHeroReport; aqui ele só
  // não pode sobreviver no fragmento.
  fragment = stripHeroReport(fragment)
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
 * Extrai o relatório do que o agente descartou. **Opcional por design**:
 * ausência, JSON ilegível ou campos fora do contrato devolvem `null` e o
 * caller registra `hero_report_missing`. Observabilidade não derruba
 * entrega — o fragmento é o produto, o relatório é o recibo.
 */
export function parseHeroReport(raw: string): HeroReport | null {
  const open = raw.indexOf(HERO_REPORT_OPEN)
  const close = raw.lastIndexOf(HERO_REPORT_CLOSE)
  if (open === -1 || close === -1 || close <= open) return null

  const body = raw
    .slice(open + HERO_REPORT_OPEN.length, close)
    .replace(/```(?:json)?/gi, "")
    .trim()
  if (!body) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  const rec = parsed as Record<string, unknown>
  const out: HeroReport = {}
  if (rec.imagem === "aplicada" || rec.imagem === "ausente") {
    out.imagem = rec.imagem
  }
  if (rec.logo === "light" || rec.logo === "dark" || rec.logo === "nenhuma") {
    out.logo = rec.logo
  }
  const strings = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim())
      : []
  const campos = strings(rec.campos_vazios)
  if (campos.length > 0) out.campos_vazios = campos
  const linhas = strings(rec.linhas_removidas)
  if (linhas.length > 0) out.linhas_removidas = linhas

  return Object.keys(out).length > 0 ? out : null
}

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
}): Promise<InvokeHeroResult> {
  const { config, vars } = input

  const systemPrompt = buildHeroSystemPrompt(
    config.system_prompt,
    HERO_OUTPUT_CONTRACT,
  )
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_HERO_USER_TEMPLATE,
    { ...vars, output_contract: HERO_OUTPUT_CONTRACT },
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

  // O parse pode rejeitar a resposta — e a chamada já foi paga. Sem isto o
  // run de erro fecha com 0 token, $0 e sem o prompt que o produziu.
  const usage: StepUsage = {
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
  }
  const output = withUsage(usage, () => parseHeroFragment(res.text))
  const report = parseHeroReport(res.text)

  log.info("hero.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
    outputChars: output.length,
    hasReport: report !== null,
  })

  return {
    output,
    report,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    rawOutput: res.text,
  }
}
