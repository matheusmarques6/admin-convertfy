/**
 * Color Format Chain — agente 4 da cadeia de formatação ("Cores & Botões",
 * substitui o Refinador). Confere a cor geral do email e a cor/formatação
 * dos BOTÕES contra a paleta aprovada da identidade visual + nicho da
 * marca.
 *
 * Arquitetura por views (F4): o agente NÃO recebe o documento — recebe o
 * INVENTÁRIO de cores extraído por código ({valor, ocorrencias, contextos})
 * e emite ops `recolor {from, to, where?}`, aplicadas por código (todas as
 * formas textuais da cor; allowHero=true — o botão da hero também entra na
 * paleta). Atômico: impossível quebrar estrutura.
 *
 * ESCOPO (20/08): `where` restringe a troca ao papel da ocorrência. Antes
 * só existia troca global, e cor com vários papéis não tinha resposta
 * correta — o agente pulava justamente as dominantes (na Luxe Lift,
 * #000000/#FFFFFF/#130E31 somavam 114 das 132 ocorrências e sobreviveram
 * intactas). Agora conflito de papel deixou de ser motivo de skip.
 *
 * Fail-open no runner: falhou 2x → mantém o HTML anterior e segue pra
 * ready (cores são polimento; o email já está completo).
 *
 * Config em email_agent_configs (agent_type='color_format'); prompt vazio
 * → defaults abaixo. Modelo default moonshotai/kimi-k3 (swap 20261047; seed original 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import { parseOps, type FormatOp } from "../html/apply-patches"
import { withUsage } from "./step-usage"

const log = logger.child("ColorFormatChain")

// Output minúsculo (JSON de ops replace) — thinking do GLM domina o tempo.
const DEFAULT_TIMEOUT_MS = 240_000
const timeoutMs = () => {
  const env = Number(process.env.COLOR_FORMAT_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT = `<role>
You are the COLOR & BUTTON finisher of an email-design pipeline — the last visual pass before QA. You do NOT see the email document. You receive its COLOR INVENTORY — every color value in the document, with occurrence count and usage contexts (background / color / border / bgcolor / css-var) — plus the store's approved brand palette, fonts and positioning research. Your job: decide WHICH color VALUES must change to conform to the approved identity. Deterministic code swaps each value globally in the real document.
</role>

<ops_vocabulary>
Respond with ONLY this JSON (no fences, no commentary):
{"ops":[{"action":"recolor","from":"#6B46C1","to":"#1F1F1F"},{"action":"recolor","from":"#000000","to":"#3D2820","where":"background"}]}
- "recolor" swaps occurrences of the color "from" (all textual forms: #hex, short #hex, rgb/rgba) for the color "to".
- "where" (OPTIONAL) restricts the swap to occurrences playing THAT role. Valid values, and the exact same ones the inventory reports: "background", "color", "border", "bgcolor", "css-var", "outro". Omit "where" to swap every occurrence.
- "from" must be a "valor" from <color_inventory>; "to" must be a palette color (or a functional derivative: pure white/black for contrast).
- <color_inventory> gives you, per color, how many occurrences sit in each role. Use those counts: a color that is 30x body text and 12x section background is TWO decisions, not one skip.
- A color used as TEXT also carries "sobre" (which backgrounds it sits on, and how often) and "contraste_min" (its worst contrast ratio in the document). "imagem" under "sobre" means the background there is a PHOTO — leave that text alone, its readability is settled elsewhere.
- A color used as BACKGROUND may carry "cobre_px": the declared width, in px, of the widest container it fills. It is the only measure of AREA you get, and area is what the reader sees. A section background covering 598px occurs ONCE and outweighs a 1px hairline that occurs 24 times. Entries with a wide "cobre_px" are listed first for that reason. Its absence means the width was not declared on that element, not that the area is small.
- Emitting ZERO ops is a legitimate, valued decision when the email already conforms.
</ops_vocabulary>

<identity_conformance>
You APPLY the identity — you are not only its guard. The sections below the hero come
from library components authored for other stores, so they arrive in the ORIGINAL
author's colors (generic grays, plain black). Leaving them is not "conforming": it
ships an email that does not look like this brand.

<color_roles> gives you the palette already resolved into roles. Use it as the target:
- background contexts (background / bgcolor / css-var --bg) → <bg>
- button and CTA backgrounds → <button_bg>, with <button_text> on top
- headings → <heading>; body copy → <text>; highlights → <accent>

Rules:
- A generic color carrying a brand role IS a target. Plain black (#000000) or an
  off-the-shelf gray used as a button background or section background must become
  the palette hex for that role — a color being "neutral" does not exempt it.
- Judge by CONTEXT, not by how many occurrences it has. The most frequent color in
  the document is usually the one most worth correcting.
- Changing a BACKGROUND is safe: the applier measures the result and rewrites the
  text sitting on it when the pair would become unreadable. Pick the background the
  brand wants and let it handle the text.
- Changing a TEXT color is on you: check "contraste_min" and "sobre" before sending
  a text color anywhere near its own background.
- Functional neutrals stay: pure white/black used as TEXT for contrast, hairline
  borders, scrims and shadows.
- NEVER introduce a color outside <color_roles>. Empty roles and empty
  <brand_identity_colors> → emit no ops at all.
- Conflicting roles are NO LONGER a reason to skip: scope the op with "where". A value
  used as both button background and body text becomes two scoped ops (or one, when
  only one of the roles is wrong). Skipping a dominant color because it appears in
  several contexts is the single most common way this step fails.

Where the doubt goes: being unsure whether a generic color CARRIES a brand role is not
a reason to skip — a black button on a brand with its own primary is a target, not a
neutral. Multiple roles are not a reason either: that is what "where" is for. And
contrast is no longer a reason to skip a BACKGROUND: the inventory tells you what sits
on it, and the applier repairs the text when needed. The one thing that stays on you:
never send a background and the text on it to the same color in the same batch.
</identity_conformance>

<button_rules>
Buttons/CTAs are your special focus:
- A button background outside the palette must become a palette color (role Principal or Destaque). Its label's "contraste_min" in the inventory tells you whether the current pair is already broken; the applier guarantees the label stays readable after your swap.
- CONSISTENCY: buttons of the same importance share the same colors — if the inventory shows two different button backgrounds with similar counts, unify to the palette role.
- The hero button IS in scope — recolor applies to the whole document, hero included; color values only, never copy or structure (recolor cannot change structure by design).
</button_rules>

<preservation>
You change COLOR VALUES ONLY. The applier makes anything else impossible: recolor swaps color literals and nothing more. Do not try to change copy, sizes, fonts or layout — there is no op for that.
</preservation>`

export const DEFAULT_COLOR_FORMAT_USER_TEMPLATE = `<store>
  <brand_name>{{brand_name}}</brand_name>
  <niche>{{niche}}</niche>
  <locale>{{locale}}</locale>
  <font_heading>{{font_heading}}</font_heading>
  <font_body>{{font_body}}</font_body>
</store>

<brand_identity_colors>
{{brand_colors}}
</brand_identity_colors>

<color_roles>
  <bg>{{color_bg}}</bg>
  <text>{{color_text}}</text>
  <heading>{{color_heading}}</heading>
  <button_bg>{{color_button_bg}}</button_bg>
  <button_text>{{color_button_text}}</button_text>
  <accent>{{color_accent}}</accent>
</color_roles>

<tones>{{tones}}</tones>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
</email>

<pesquisa_diagnostico>
{{pesquisa_full_text}}
</pesquisa_diagnostico>

<color_inventory>
{{color_inventory_json}}
</color_inventory>

Apply the identity to the inventory and emit the ops JSON now. Every color carrying a
brand role (page background, section backgrounds, button backgrounds, headings) should
end on a <color_roles> value — including the most frequent colors in the document,
scoped with "where" when they serve more than one role. Emit {"ops":[]} only when the
document already uses the palette in those roles.`

export interface InvokeColorFormatResult {
  ops: FormatOp[]
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

export async function invokeColorFormatChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeColorFormatResult> {
  const { config, vars } = input

  const systemPrompt =
    config.system_prompt.trim() || DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_COLOR_FORMAT_USER_TEMPLATE,
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
    title: "Convertfy Admin Color Format",
    // Step mecânico (output = JSON pequeno de ops): thinking do GLM só
    // adiciona minutos. FORMAT_OPS_REASONING=on re-liga sem deploy.
    ...(process.env.FORMAT_OPS_REASONING === "on"
      ? {}
      : { reasoning: { enabled: false } }),
  })

  // parseOps lança OpsParseError (retryable; 2ª falha → fail-open no runner).
  // Arquitetura por views (F4): só ops "recolor" fazem sentido — o agente
  // não vê o documento, então "replace" de trecho não tem como ser válido.
  // O consumo vai grudado no erro — a chamada já foi paga, e este step é
  // fail-open: sem isso o custo de uma falha silenciosa some de vez.
  const ops = withUsage(
    {
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
      costUsd: res.costUsd,
      renderedPrompt: userMessage,
    },
    () => parseOps(res.text),
  ).filter((op) => op.action === "recolor")

  log.info("color_format.invoke.success", {
    model: config.model,
    durationMs: Date.now() - t0,
    opsCount: ops.length,
  })

  return {
    ops,
    tokensInput: res.tokensInput,
    tokensOutput: res.tokensOutput,
    costUsd: res.costUsd,
    renderedPrompt: userMessage,
    rawOutput: res.text,
  }
}
