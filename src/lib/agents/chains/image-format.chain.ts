/**
 * Image Format Chain — agente 3 da cadeia de formatação (split do HTML
 * agent). Posiciona cada imagem gerada no seu slot (logo no lugar da
 * logo etc.), SEM tocar na hero (já finalizada; sentinelas cfy:hero).
 *
 * Arquitetura por views (F3): o agente NÃO recebe o documento — só as
 * views dos slots de imagem ({block_id, tag, row_html} fatiadas por
 * código) + candidatos a logo de texto. Output = JSON de operações
 * ({"ops":[...]}) aplicado por código (apply-patches.ts, allowHero=false)
 * no documento completo que o agente nunca viu — a mutação é
 * determinística e nunca o corrompe.
 *
 * Config em email_agent_configs (agent_type='image_format'); prompt vazio
 * → defaults abaixo. Modelo default moonshotai/kimi-k3 (swap 20261047; seed original 20261039).
 */

import { logger } from "@/lib/logger"
import { renderImageTemplate } from "../image/template-renderer"
import { invokeFormatModel, type FormatChainConfig } from "./format-invoke"
import { parseOps, type FormatOp } from "../html/apply-patches"
import { withUsage } from "./step-usage"

const log = logger.child("ImageFormatChain")

// Output minúsculo (JSON de ops) — o thinking do GLM domina o tempo.
const DEFAULT_TIMEOUT_MS = 180_000
const timeoutMs = () => {
  const env = Number(process.env.IMAGE_FORMAT_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS
}

export const DEFAULT_IMAGE_FORMAT_SYSTEM_PROMPT = `<role>
You are the IMAGE PLACER of an email-design pipeline. You do NOT see the email document — you receive per-slot VIEWS: each image slot as {block_id, tag, row_html (the surrounding table row, verbatim)}, plus the generated images (<image_map>), the store logos and text-logo candidate rows. You emit a JSON list of operations; deterministic code applies them to the real document. The hero is already finalized and is not in your views.
</role>

<ops_vocabulary>
Respond with ONLY this JSON (no fences, no commentary):
{"ops":[
  {"action":"img","tag":"PRODUCTS_IMAGE","url":"https://...","alt":"short description","block_id":"uuid-or-omit"},
  {"action":"remove_slot","tag":"REVIEW_3_IMAGE"},
  {"action":"replace","find":"<exact snippet copied from a logo candidate row_html>","replace":"<its replacement>"}
]}
- "img": swaps the {{TAG}} token for the URL (and {{TAG_ALT}} for the alt when provided). Use for every slot that has a matching image. Echo the slot's block_id when present.
- "remove_slot": removes the table row holding the {{TAG}} token. Use for slots with NO matching image.
- "replace": exact find/replace; "find" MUST be copied VERBATIM from a row_html in <logo_candidates> and must be unique. Use ONLY for swapping a styled TEXT logo for the real logo markup from <logos>.
</ops_vocabulary>

<image_slot_rules>
Placement is TAG-DRIVEN. Each <image_map> entry carries "tag", "block_type", "aspect_ratio" and "render_width_px":
1. MATCH BY TAG: fill a slot ONLY with the entry whose "tag" matches the slot's tag (indexes count: {{REVIEW_2_IMAGE}} matches tag REVIEW_2_IMAGE, not REVIEW_1_IMAGE). No entry with that tag → try match by block position (entry id IMG_{position}). Still no match → rule 3.
2. ONE SLOT PER IMAGE: each image_map URL appears AT MOST ONCE across all your ops. NEVER reuse an image for a second slot. Fewer images than slots means some slots get remove_slot — that is correct.
3. UNFILLED SLOT → remove_slot. Do NOT leave the slot unaddressed, do NOT substitute a different image, do NOT invent a URL.
4. ONE OP PER SLOT, only for tags present in <image_slots>. Never emit an op for a TEXT placeholder.
5. RENDER SIZE: the applier keeps the slot's authored <img> attributes (visible in row_html); when you place a Shopify CDN URL (cdn.shopify.com) in a product grid, append \`width=520&height=650&crop=center\` to the URL's query string (keep the v= param) — all cards in the same grid must share the same ratio.
6. LOGO: if a <logo_candidates> row renders the brand name as a styled TEXT box (header/footer), you may swap it for the real logo markup via ONE "replace" op — use <logos>.light on light background, <logos>.dark on dark background. If <logos> are empty or there is no candidate row, emit no replace.
</image_slot_rules>`

export const DEFAULT_IMAGE_FORMAT_USER_TEMPLATE = `<store brand_name="{{brand_name}}" />

<logos>
  <light>{{logo_light}}</light>
  <dark>{{logo_dark}}</dark>
</logos>

<image_map>
{{image_map_json}}
</image_map>

<image_slots>
{{image_slots_json}}
</image_slots>

<logo_candidates>
{{logo_candidates_json}}
</logo_candidates>

<top_products>
{{top_products_json}}
</top_products>

Emit the ops JSON now, one decision per slot.`

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

  // parseOps lança OpsParseError (retryable no runner). O consumo vai
  // grudado no erro — a chamada já foi paga, o run de erro tem de registrar.
  const ops = withUsage(
    {
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
      costUsd: res.costUsd,
      renderedPrompt: userMessage,
    },
    () => parseOps(res.text),
  )

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
