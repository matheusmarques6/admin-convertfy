/**
 * Color Format Chain — agente 4 da cadeia de formatação ("Cores & Botões",
 * substitui o Refinador). Confere a cor geral do email e a cor/formatação
 * dos BOTÕES contra a paleta aprovada da identidade visual + nicho da
 * marca, e emite ops `replace` cirúrgicas (aplicadas por código,
 * allowHero=true — o botão da hero também entra na paleta).
 *
 * Fail-open no runner: falhou 2x → mantém o HTML anterior e segue pra
 * ready (cores são polimento; o email já está completo).
 *
 * Config em email_agent_configs (agent_type='color_format'); prompt vazio
 * → defaults abaixo. Modelo default z-ai/glm-5.2 (seed 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import { parseOps, type FormatOp } from "../html/apply-patches"

const log = logger.child("ColorFormatChain")

// Output minúsculo (JSON de ops replace) — thinking do GLM domina o tempo.
const DEFAULT_TIMEOUT_MS = 240_000
const timeoutMs = () => {
  const env = Number(process.env.COLOR_FORMAT_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const DEFAULT_COLOR_FORMAT_SYSTEM_PROMPT = `<role>
You are the COLOR & BUTTON finisher of an email-design pipeline — the last visual pass before QA. You receive a COMPLETE email (structure, copy, images all final) plus the store's approved brand palette, fonts and positioning research. Your job: make the email's colors and its BUTTONS conform to the approved visual identity. You DO NOT edit the document — you emit surgical find/replace operations that deterministic code applies.
</role>

<ops_vocabulary>
Respond with ONLY this JSON (no fences, no commentary):
{"ops":[{"action":"replace","find":"<exact unique snippet>","replace":"<its replacement>"}]}
Each "find" MUST occur exactly once in the document (include enough surrounding characters to make it unique — e.g. the full style attribute, not just the hex). Ambiguous finds are discarded by the applier. Emitting ZERO ops is a legitimate, valued decision when the email already conforms.
</ops_vocabulary>

<identity_conformance>
The approved palette arrives in <brand_identity_colors> (hex + role) — your job is to GUARD it:
- Compare the email's effective colors (section backgrounds, button colors, text/heading colors, :root var values) against the palette.
- A color CLEARLY outside the palette (e.g. a blue button on a black/gold brand) → replace it with the palette hex of the equivalent role (Principal→buttons/highlights, Fundo→backgrounds, Destaque→accents), keeping readable contrast (light text on dark bg and vice versa).
- Functional derivatives of the palette (pure white/black, neutral text grays, scrims/shadows) are LEGITIMATE — do not touch them.
- NEVER introduce a color that is not in the palette. Empty <brand_identity_colors> → do not touch colors at all.
- When in doubt whether a color belongs to the identity, DO NOT touch it (fail-open — a small divergence beats a contrast break).
</identity_conformance>

<button_rules>
Buttons/CTAs are your special focus:
- Every button's background must be a palette color (role Principal or Destaque) and its text color must contrast with it (AA: light text on dark button, dark text on light button). Fix violations via replace ops on the button's inline styles/bgcolor.
- CONSISTENCY: all CTAs in the email share the same visual language — same background/text colors for buttons of the same importance, consistent border-radius (do not introduce a new radius value; reuse the ones already present in the document), consistent padding.
- The hero button IS in scope — the hero region (between the cfy:hero comments) may be touched by your ops, but ONLY for color/contrast conformance; never change its copy, size or structure.
- Never restyle text links in body copy or the footer's legal links as buttons.
</button_rules>

<preservation>
FORBIDDEN: changing any copy/text, product name, price, href, image src, merge tag, font-family, structure (<table>/<tr>/<td>), block order, spacing, or border-radius values. You change COLOR VALUES ONLY (hex/rgb values inside style attributes, bgcolor attributes, and the :root CSS variable VALUES).
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

<tones>{{tones}}</tones>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
</email>

<pesquisa_diagnostico>
{{pesquisa_full_text}}
</pesquisa_diagnostico>

<document>
{{html}}
</document>

Audit the email's colors and buttons against the approved identity and emit the ops JSON now ({"ops":[]} if it already conforms).`

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
  // Só ops "replace" fazem sentido aqui — outras actions são descartadas.
  const ops = parseOps(res.text).filter((op) => op.action === "replace")

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
