/**
 * Image Format Chain — agente 3 da cadeia de formatação (split do HTML
 * agent). Posiciona cada imagem gerada no seu slot (logo no lugar da
 * logo etc.), SEM tocar na hero (já finalizada; sentinelas cfy:hero).
 *
 * Output = JSON de operações ({"ops":[...]}) aplicado por código
 * (apply-patches.ts, allowHero=false) — o LLM decide o casamento
 * slot↔imagem; a mutação do documento é determinística e nunca o corrompe.
 *
 * Config em email_agent_configs (agent_type='image_format'); prompt vazio
 * → defaults abaixo. Modelo default z-ai/glm-5.2 (seed 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import { parseOps, type FormatOp } from "../html/apply-patches"

const log = logger.child("ImageFormatChain")

// Output minúsculo (JSON de ops) — o thinking do GLM domina o tempo.
const DEFAULT_TIMEOUT_MS = 180_000
const timeoutMs = () => {
  const env = Number(process.env.IMAGE_FORMAT_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT = `<role>
You are the IMAGE PLACER of an email-design pipeline. You receive a complete email document whose copy is already placed and whose image slots still carry {{*_IMAGE}}/{{*_THUMB}} placeholders, plus the generated images (<image_map>) and the store logos. You DO NOT edit the document — you emit a JSON list of operations that deterministic code applies. You never touch the hero (between the cfy:hero comments): its image is already placed.
</role>

<ops_vocabulary>
Respond with ONLY this JSON (no fences, no commentary):
{"ops":[
  {"action":"img","tag":"PRODUCTS_IMAGE","url":"https://...","alt":"short description"},
  {"action":"remove_slot","tag":"REVIEW_3_IMAGE"},
  {"action":"replace","find":"<exact unique snippet from the document>","replace":"<its replacement>"}
]}
- "img": swaps the {{TAG}} token for the URL (and {{TAG_ALT}} for the alt when provided). Use for every slot that has a matching image.
- "remove_slot": removes the table row holding the {{TAG}} token. Use for slots with NO matching image.
- "replace": exact find/replace; "find" MUST occur exactly once in the document. Use ONLY for: (a) swapping a styled TEXT logo for the real logo markup from <logos>; (b) appending Shopify CDN crop params to a product image URL you placed. Never for anything inside the hero.
</ops_vocabulary>

<image_slot_rules>
Placement is TAG-DRIVEN. Each <image_map> entry carries "tag", "block_type", "aspect_ratio" and "render_width_px":
1. MATCH BY TAG: fill a slot ONLY with the entry whose "tag" matches the placeholder name (indexes count: {{REVIEW_2_IMAGE}} matches tag REVIEW_2_IMAGE, not REVIEW_1_IMAGE). No entry with that tag → try match by block position (entry id IMG_{position}). Still no match → rule 3.
2. ONE SLOT PER IMAGE: each image_map URL appears AT MOST ONCE in the whole email. NEVER reuse an image for a second slot. Fewer images than slots means some slots get remove_slot — that is correct.
3. UNFILLED SLOT → remove_slot. Do NOT leave the raw token, do NOT substitute a different image, do NOT invent a URL.
4. TEXT SLOTS ARE NOT IMAGE SLOTS: never emit an op targeting a TEXT placeholder ({{BADGE_1_TEXT}}, {{USP_1_TITLE}}...).
5. RENDER SIZE: the applier keeps the slot's authored <img> attributes; when you place a Shopify CDN URL (cdn.shopify.com) in a product grid, append \`width=520&height=650&crop=center\` to the URL's query string (keep the v= param) via the "url" you emit — all cards in the same grid must share the same ratio.
6. LOGO: where the document renders the brand name as a styled TEXT box in the header/footer (a text logo), you may swap it for the real logo markup via ONE "replace" op — use <logos>.light on light background, <logos>.dark on dark background. If <logos> are empty, leave the text logo as-is. Never place the logo in body copy.
</image_slot_rules>

<hero_is_untouchable>
NEVER emit an op whose target lives between the comments <!-- cfy:hero:start --> and <!-- cfy:hero:end -->. The applier rejects them; don't waste ops.
</hero_is_untouchable>`

export const DEFAULT_IMAGE_FORMAT_USER_TEMPLATE = `<store brand_name="{{brand_name}}" />

<logos>
  <light>{{logo_light}}</light>
  <dark>{{logo_dark}}</dark>
</logos>

<image_map>
{{image_map_json}}
</image_map>

<top_products>
{{top_products_json}}
</top_products>

<document>
{{html}}
</document>

Emit the ops JSON now.`

export interface InvokeImageFormatResult {
  ops: FormatOp[]
  tokensInput: number
  tokensOutput: number
  costUsd: number
  renderedPrompt: string
  rawOutput: string
}

export async function invokeImageFormatChain(input: {
  config: FormatChainConfig
  vars: Record<string, string>
}): Promise<InvokeImageFormatResult> {
  const { config, vars } = input

  const systemPrompt =
    config.system_prompt.trim() || DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT
  const userMessage = renderImageTemplate(
    config.user_template.trim() || DEFAULT_IMAGE_FORMAT_USER_TEMPLATE,
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
    title: "Convertfy Admin Image Format",
    // Step mecânico (output = JSON pequeno de ops): thinking do GLM só
    // adiciona minutos. FORMAT_OPS_REASONING=on re-liga sem deploy.
    ...(process.env.FORMAT_OPS_REASONING === "on"
      ? {}
      : { reasoning: { enabled: false } }),
  })

  // parseOps lança OpsParseError (retryable no runner).
  const ops = parseOps(res.text)

  log.info("image_format.invoke.success", {
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
