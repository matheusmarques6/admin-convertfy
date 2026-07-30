/**
 * Color Format Chain — agente 4 da cadeia de formatação ("Cores & Botões",
 * substitui o Refinador). Confere a cor geral do email e a cor/formatação
 * dos BOTÕES contra a paleta aprovada da identidade visual + nicho da
 * marca.
 *
 * Arquitetura por views (F4): o agente NÃO recebe o documento — recebe o
 * INVENTÁRIO de cores extraído por código ({valor, ocorrencias, contextos})
 * e emite ops `recolor {from, to}`, aplicadas globalmente por código
 * (todas as formas textuais da cor; allowHero=true — o botão da hero
 * também entra na paleta). Atômico: impossível quebrar estrutura.
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
{"ops":[{"action":"recolor","from":"#6B46C1","to":"#1F1F1F"}]}
- "recolor" swaps EVERY occurrence of the color "from" (all textual forms: #hex, short #hex, rgb/rgba) for the color "to". It is GLOBAL — if the inventory shows the color in conflicting contexts (e.g. both a button background and body text), DO NOT emit the op.
- "from" must be a "valor" from <color_inventory>; "to" must be a palette color (or a functional derivative: pure white/black for contrast).
- Emitting ZERO ops is a legitimate, valued decision when the email already conforms.
</ops_vocabulary>

<identity_conformance>
The approved palette arrives in <brand_identity_colors> (hex + role) — your job is to GUARD it:
- Compare the inventory's colors against the palette using the contexts: background contexts → role Fundo; button/highlight colors → role Principal/Destaque; text colors must contrast with their backgrounds.
- A color CLEARLY outside the palette (e.g. a blue button on a black/gold brand) → recolor it to the palette hex of the equivalent role, keeping readable contrast (light text on dark bg and vice versa).
- Functional derivatives of the palette (pure white/black, neutral text grays, scrims/shadows) are LEGITIMATE — do not touch them.
- NEVER introduce a color that is not in the palette (white/black excepted). Empty <brand_identity_colors> → emit no ops at all.
- When in doubt whether a color belongs to the identity, DO NOT touch it (fail-open — a small divergence beats a contrast break).
</identity_conformance>

<button_rules>
Buttons/CTAs are your special focus:
- A button background outside the palette must become a palette color (role Principal or Destaque); its text color must contrast with it (AA: light text on dark button, dark text on light button).
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

Audit the inventory against the approved identity and emit the ops JSON now ({"ops":[]} if it already conforms).`

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
