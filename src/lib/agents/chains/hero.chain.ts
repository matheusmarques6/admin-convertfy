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
import type { RenderedKind } from "../shared/rendered-classify"
import { imageUrlsIn } from "../shared/rendered-image"
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

<design_system>
THIS IS THE SPECIFICATION OF THE HERO. <design_system> in the user message was written by the person who owns this design — it defines how this hero MUST look: anatomy and order of blocks, grid and spacing, palette and where each colour goes, typography (size, weight, case, tracking), how each button is finished, how the photo sits. Read it FIRST.

<hero_region> is the STARTING POINT — the HTML as it exists today. It is not the target. Your job is to deliver the region CONFORMED to the specification.

Where the two disagree, THE SPECIFICATION WINS — including on structure:
- The spec calls for a row the region does not have → add it, built in the spec's own terms.
- The region has a row the spec does not describe → remove it.
- The spec sets a value (size, weight, case, colour, border, radius, padding, width, alignment) → apply it, overwriting whatever the region has.
- The spec forbids something the region does (a radius, a solid second button, a white background) → fix it.
- The spec fixes an order → reorder the rows to match it.
Do NOT preserve a detail merely because the region has it. The region carries no authority of its own — it is the material.

What you may NOT do, even to satisfy the spec:
- invent copy, labels, URLs or an image (only <hero_content> and <hero_image> provide those);
- break the image rule (swap the placeholder for the URL — never a CSS background, never an overlay, never a fixed height);
- rewrite, translate or summarise copy — it goes in verbatim;
- touch merge tags of the ESP ([unsubscribe_link], {{ unsubscribe }}, *|FNAME|*) — they stay literal;
- leave a placeholder with no matching content filled with something you made up — leave the token, a later stage handles it;
- emit anything but table-based email HTML inside the 600px column.
A slot the spec asks for and the copy does not fill: build the row and keep its {{PLACEHOLDER}} — the deterministic stage fills it later.

Empty <design_system> means nothing was written for this variant. THEN, and only then, the region is structurally final and your job is substitution only.
</design_system>

<hero_source_modes>
<hero_region> is the hero as it currently sits in this email. <hero_source> says where it came from, and that decides how much freedom you have:

- <hero_source>library</hero_source> — the region was grafted by CODE straight from the component library: it IS the authored variant, byte for byte, with its {{PLACEHOLDERS}} intact. <hero_variant_source> arrives EMPTY here on purpose — the region already is it. WITH a <design_system>, the region is the starting point and the spec decides the final structure (see above). WITHOUT one, the region is structurally final: keep every row, cell, background band, button and image slot exactly where and as they are, and your job is SUBSTITUTION ONLY — copy into the placeholders, image URL, logo, fonts/colors, nothing else.

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
THE COPY IN THE REGION IS FINAL. A deterministic merge ran BEFORE you and already wrote the final copy into the region's text — every human-readable sentence you see is the product, not placeholder material. NEVER rewrite, translate, summarize, re-case or "improve" any text in the region. Your surface is everything EXCEPT the words: image, logo, fonts, colors, structure per the spec.

<hero_content> is an ARRAY with the copy of every block that lives inside the region — it is CONTEXT. Use it only for two things: (a) a CTA href, taken from the block's URL; (b) a leftover {{PLACEHOLDER}} that still sits in the region AND has an exact matching field in <hero_content> — fill it VERBATIM. Never use it to second-guess text the merge already placed.
</copy_rules>

<empty_slot_rule>
<hero_pending> lists the region's fields the deterministic merge could NOT write ({key, motivo, tem_valor}). It is the ONLY license to remove anything:
- <hero_pending> EMPTY → remove NOTHING. Every row stays, placeholders included (a later stage strips leftover tokens by code).
- An entry with tem_valor=false whose slot is a CTA/button (label AND url absent) → delete that entire row/cell (never emit a button with empty label or href="").
- An entry with tem_valor=false on a text slot → remove its row only if the pending token is the row's ONLY content; otherwise leave it as-is.
- Entries with tem_valor=true mean the copy EXISTS but had no anchor — leave their rows untouched; the pipeline registers it.
- NEVER invent copy, labels or URLs to fill a slot.
</empty_slot_rule>

<merge_tags_are_literal>
ESP merge tags ([unsubscribe_link], [first_name], {{ unsubscribe }}, {% ... %}, *|FNAME|*) remain LITERAL. Do not replace or remove them.
</merge_tags_are_literal>

<identity_rules>
- Fonts: headings/display use <fonts>.heading (weight <fonts>.heading_weight); body/paragraph text uses <fonts>.body (weight <fonts>.body_weight).
- Colors: where the variant uses var(--xxx), KEEP the var reference (the :root values are handled downstream). Explicit hex values you introduce must come ONLY from <color_roles>.
- Logo — the hero almost always carries one, in ONE of two shapes:
  a) an image slot (a {{LOGO}} placeholder or an <img> of the brand mark) → swap it for the markup in <logos>;
  b) the brand name rendered as STYLED TEXT (a wordmark drawn with CSS, the name inside a bordered/pill box, letter-spaced type). Replace that text content with the markup from <logos>, keeping the cell, its padding, alignment and background exactly as they are. This is a CONTENT substitution, so it is allowed in mode 'library' too — the hero is the ONLY place this happens, because the downstream image agent never touches the hero region.
  Both empty in <logos> → leave the text as it is: it is the only brand mark the email would have.
  Contrast: on a DARK background use <logos>.dark if non-empty, otherwise <logos>.light; on a light background use <logos>.light. Never both.
  Report it: "logo":"light"|"dark" when you placed one, "nenhuma" ONLY when <logos> is empty or the hero genuinely has no logo — not when you simply left a text wordmark untouched.
</identity_rules>

<structural_rules>
Table-based email HTML only. Never place a <div> (or any non-table element) as a direct child of <table> — between </tr> and <tr> only <tr>...</tr> or comments may appear. Keep widths within the 600px column. No <style> blocks of your own — inline styles only, consistent with the variant.
</structural_rules>

<output_contract>
{{output_contract}}
</output_contract>`

export const HERO_OUTPUT_CONTRACT = `Emit the finished hero fragment wrapped EXACTLY in ${HERO_OUTPUT_OPEN} and ${HERO_OUTPUT_CLOSE}. MIRROR THE BOUNDARY OF THE REGION YOU RECEIVED: if <hero_region> starts with <tr>, return <tr>...</tr> rows; if it starts with <table>, return complete <table>...</table> blocks. Never swap one for the other — the fragment is spliced back at that exact position, and the wrong boundary produces invalid HTML. No <!DOCTYPE>, no <html>/<head>/<body>, no markdown fences, no commentary.

After the fragment, emit a short report wrapped EXACTLY in ${HERO_REPORT_OPEN} and ${HERO_REPORT_CLOSE}, as JSON:
{"imagem":"aplicada"|"ausente","campos_vazios":["TAG",...],"linhas_removidas":["cta","imagem",...],"logo":"light"|"dark"|"nenhuma"}

The report is what the pipeline knows about what you discarded. Report it honestly: a removed CTA row or an unfilled placeholder MUST appear there.`

export const DEFAULT_HERO_USER_TEMPLATE = `{{#if hero_variant_design_system}}<design_system>
{{hero_variant_design_system}}
</design_system>

{{/if}}<store>
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

<hero_pending>
{{hero_pending_json}}
</hero_pending>

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
  /** O que aconteceu com o espelho visual (CM-8). */
  vision: VisionDecision
}

// ── Espelho visual (story CM-8) ────────────────────────────────────────

/**
 * Modelo do fallback visual. Precisa de VISÃO e de rota pelo OpenRouter (o
 * caminho Anthropic-direto recusa anexo — ver format-invoke).
 *
 * Escolha: o mesmo Sonnet 4.6 que o `qa-vision.chain` já usa em produção
 * para avaliar imagem de hero. Visão comprovada nesse exato tipo de
 * conteúdo, e não introduz um provedor novo na cadeia.
 */
export const HERO_VISION_MODEL = "anthropic/claude-sonnet-4.6"

/** Por que o espelho visual entrou (ou não) nesta execução. */
export type VisionReason =
  /** Exemplo é mockup-imagem e a URL foi anexada: o fallback rodou. */
  | "mockup_com_imagem"
  /** Exemplo é HTML estrutural — o CSS ensina mais que um screenshot. */
  | "exemplo_estrutural"
  /** Não há exemplo, ou não há URL http(s) aproveitável nele. */
  | "sem_imagem"
  /** Desligado no settings (string vazia). */
  | "desligado"

export interface VisionDecision {
  used: boolean
  /** Modelo que REALMENTE rodou — com fallback, difere do configurado. */
  model: string
  reason: VisionReason
  /** URLs anexadas ao prompt. */
  images: string[]
}

export interface HeroVisionInput {
  /** Classificação do exemplo (rendered-classify). */
  kind: RenderedKind
  /** HTML do exemplo, de onde a URL é extraída. */
  renderedHtml: string | null
  /**
   * Override do modelo: `undefined`/`null` → HERO_VISION_MODEL; string
   * vazia → fallback DESLIGADO. Vem de
   * `email_generation_settings.hero_vision_model`.
   */
  modelOverride?: string | null
}

/**
 * Decide se esta execução roda com o espelho visual e em qual modelo.
 *
 * A regra em uma frase: **anexa a imagem só quando o exemplo É uma
 * imagem**. Exemplo estrutural segue como texto no modelo configurado —
 * ali o CSS descreve o acabamento melhor do que um screenshot, e trocar de
 * modelo custaria mais sem ganho.
 *
 * Pura (zero I/O) — testável.
 */
export function decideHeroVision(
  configuredModel: string,
  input: HeroVisionInput,
): VisionDecision {
  const none = (reason: VisionReason): VisionDecision => ({
    used: false,
    model: configuredModel,
    reason,
    images: [],
  })

  const override = input.modelOverride
  if (typeof override === "string" && !override.trim()) return none("desligado")
  if (input.kind !== "mockup") return none("exemplo_estrutural")

  const images = imageUrlsIn(input.renderedHtml)
  if (images.length === 0) return none("sem_imagem")

  return {
    used: true,
    model: override?.trim() || HERO_VISION_MODEL,
    reason: "mockup_com_imagem",
    images,
  }
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
  out = out.replaceAll(HERO_REPORT_CLOSE, "").trim()
  return stripBareReportJson(out)
}

/**
 * Corta o relatório emitido SEM as tags — JSON solto depois do HTML.
 *
 * As tags são o contrato, mas o modelo às vezes escreve só o objeto. Aí
 * nada no caminho o reconhece e ele chega ao email como texto: o rodapé
 * saiu com `…"],"logo":"light"}` à mostra, num email entregue.
 *
 * O corte exige DUAS coisas para não comer conteúdo legítimo: o trecho
 * final precisa começar em `{` depois da última tag HTML fechada, e conter
 * pelo menos uma chave do relatório. Um `{` solto no meio de copy não
 * satisfaz as duas.
 */
const REPORT_KEYS = /"(?:imagem|campos_vazios|linhas_removidas|logo)"\s*:/

export function stripBareReportJson(fragment: string): string {
  const lastClose = fragment.lastIndexOf(">")
  if (lastClose === -1) return fragment
  const tail = fragment.slice(lastClose + 1)
  const open = tail.indexOf("{")
  if (open === -1) return fragment
  if (!REPORT_KEYS.test(tail.slice(open))) return fragment
  return (fragment.slice(0, lastClose + 1) + tail.slice(0, open)).trimEnd()
}

/**
 * Forma de um fragmento de hero: uma sequência de linhas (`<tr>`) ou de
 * tabelas (`<table>`). Comentários e espaço à frente são ignorados — o
 * fragmento legítimo começa em `<!-- cfy:block:0:hero:start -->`.
 */
export type HeroShape = "row" | "table"

const LEADING_NOISE = /^(?:\s|<!--[\s\S]*?-->)+/

/** Forma do primeiro elemento real. null = não é `<tr>` nem `<table>`. */
export function heroShapeOf(html: string): HeroShape | null {
  const body = html.replace(LEADING_NOISE, "")
  if (/^<tr\b/i.test(body)) return "row"
  if (/^<table\b/i.test(body)) return "table"
  return null
}

/**
 * Extrai o fragmento entre os wrappers; lança HeroOutputInvalidError.
 *
 * `expect` é a forma da região que o agente RECEBEU, e o fragmento tem de
 * devolver a mesma: o splice troca a região por ele no lugar exato, então
 * uma `<table>` no lugar de uma `<tr>` (ou o contrário) produz HTML inválido
 * — `<table>` solta entre `</tr>` e `<tr>`, ou `<tr>` fora de tabela.
 *
 * Sem `expect`, aceita as duas formas. O guard antigo exigia a substring
 * `<table>` e mais nada, o que reprovava por definição toda hero em modo
 * MARKER: ali a região é o conteúdo entre `cfy:block:N:hero:start/end`, que
 * é uma `<tr>` sem tabela nenhuma. O modelo espelhava a fronteira recebida —
 * corretamente — e levava "fragmento vazio ou sem <table>" nas duas
 * tentativas, derrubando o email. Só o modo TAG (legado, região achada por
 * `scanBalancedTable`) passava.
 */
export function parseHeroFragment(
  raw: string,
  opts?: { expect?: HeroShape },
): string {
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
  if (!fragment) {
    throw new HeroOutputInvalidError("fragmento vazio", raw)
  }
  // O documento inteiro é checado ANTES da forma: um `<!DOCTYPE>` seguido de
  // `<html>` não tem forma de hero, e "não é <tr> nem <table>" seria um
  // diagnóstico pior do que dizer que veio um documento.
  if (/<!DOCTYPE|<html[\s>]|<body[\s>]/i.test(fragment)) {
    throw new HeroOutputInvalidError(
      "fragmento contém documento (esperava só a hero)",
      raw,
    )
  }
  const shape = heroShapeOf(fragment)
  if (!shape) {
    throw new HeroOutputInvalidError(
      "fragmento não começa em <tr> nem <table>",
      raw,
    )
  }
  if (opts?.expect && shape !== opts.expect) {
    throw new HeroOutputInvalidError(
      `fragmento é <${shape === "row" ? "tr" : "table"}> mas a região é <${
        opts.expect === "row" ? "tr" : "table"
      }>`,
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
  visionAttached = false,
): string {
  const base = (systemPrompt.trim() || DEFAULT_HERO_SYSTEM_PROMPT).replaceAll(
    "{{output_contract}}",
    outputContract,
  )
  return visionAttached ? `${base}\n\n${HERO_VISION_NOTE}` : base
}

/**
 * Acrescentado ao system SÓ quando a imagem vai anexada. Sem ela, essa
 * instrução mandaria o agente procurar algo que não existe no prompt.
 */
export const HERO_VISION_NOTE = `<attached_example>
An IMAGE is attached to this message: the rendered example of this variant, i.e. how this hero looks when finished well. LOOK at it and match its FINISH — image treatment and crop, spacing rhythm, text hierarchy and weight, button proportion, how the logo sits on its band.

It is NOT your reference for structure, and <hero_variant_rendered> arrives EMPTY on purpose: the example only exists as the attached image. Rows, order and anatomy come from <hero_region>. If the image shows something the region does not have, you do NOT add it — THE REGION WINS.

The example may show an older version of the variant. Treat it as a photo of the intended finish, never as a spec to restore.
</attached_example>`

export async function invokeHeroChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
  /**
   * Decisão do espelho visual (CM-8), tomada pelo RUNNER — que é quem abre
   * o run e precisa gravar nele o modelo que de fato vai rodar. Se a
   * decisão fosse tomada aqui dentro, a coluna `model` do run registraria o
   * modelo configurado enquanto outro executava, e o custo por email
   * apareceria no lugar errado. Ausente → nenhum anexo.
   */
  vision?: VisionDecision
  /**
   * Forma da região que o runner vai substituir (`heroShapeOf` do HTML entre
   * os marcadores). O parser cobra a mesma forma de volta. Ausente → aceita
   * `<tr>` ou `<table>`.
   */
  expectShape?: HeroShape
}): Promise<InvokeHeroResult> {
  const { config, vars } = input

  const vision: VisionDecision = input.vision ?? {
    used: false,
    model: config.model,
    reason: "sem_imagem",
    images: [],
  }

  const systemPrompt = buildHeroSystemPrompt(
    config.system_prompt,
    HERO_OUTPUT_CONTRACT,
    vision.used,
  )
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_HERO_USER_TEMPLATE,
    {
      ...vars,
      output_contract: HERO_OUTPUT_CONTRACT,
      // Com a imagem anexada, o HTML do mockup NÃO vai junto: é uma URL
      // crua que não ensina nada e ainda oferece ao modelo um molde do
      // formato errado (foi assim que o documento entrou no fragmento).
      ...(vision.used ? { hero_variant_rendered_html: "" } : {}),
    },
  )

  if (vision.used) {
    log.warn("hero.vision_fallback", {
      configured: config.model,
      running: vision.model,
      images: vision.images.length,
    })
  }

  const t0 = Date.now()
  const res = await invokeFormatModel({
    model: vision.model,
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
    ...(vision.images.length > 0 ? { images: vision.images } : {}),
  })

  // O parse pode rejeitar a resposta — e a chamada já foi paga. Sem isto o
  // run de erro fecha com 0 token, $0 e sem o prompt que o produziu.
  const usage: StepUsage = {
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
  }
  const output = withUsage(usage, () =>
    parseHeroFragment(res.text, { expect: input.expectShape }),
  )
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
    vision,
  }
}
