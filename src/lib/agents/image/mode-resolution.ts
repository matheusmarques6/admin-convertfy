/**
 * Mode resolution para o image agent (story AE-13).
 *
 * Determina se o slot deve usar:
 *   - `product_ref` (multimodal img2img — passa imagem real do top product
 *      como referencia visual via OpenRouter content array)
 *   - `text2img` (geracao puramente textual — comportamento legacy)
 *
 * Resolucao em ordem de prioridade:
 *   1. `blueprintMode` (override explicito do email_blueprints.image_mode)
 *   2. Matriz `WELCOME_MODE_BY_EMAIL` (por flow_type=welcome + email_number)
 *   3. Default `"text2img"`
 *
 * Fallbacks (apos resolver o mode "ideal"):
 *   - Se ideal=product_ref mas `multimodalEnabled=false`: cai pra text2img
 *     com source `fallback_text2img_disabled`
 *   - Se ideal=product_ref mas `topProductImageUrl` ausente: cai pra text2img
 *     com source `fallback_text2img_no_product`
 *
 * @see docs/stories/AE-13.image-product-ref-mode.md
 */

export type ImageMode = "product_ref" | "text2img"

export type ImageModeSource =
  | "blueprint"
  | "matrix"
  | "default"
  | "fallback_text2img_no_product"
  | "fallback_text2img_disabled"

const WELCOME_MODE_BY_EMAIL: Record<number, ImageMode> = {
  1: "product_ref",
  2: "product_ref",
  3: "product_ref",
  4: "text2img",
  5: "text2img",
  6: "product_ref",
}

export function resolveImageMode(input: {
  blueprintMode?: "auto" | "product_ref" | "text2img" | null
  flowType?: string | null
  emailNumber?: number | null
  topProductImageUrl?: string | null
  multimodalEnabled?: boolean
}): { mode: ImageMode; source: ImageModeSource } {
  // 1. Determina o mode "ideal" (blueprint override > matriz Welcome > default)
  let desired: ImageMode
  let source: ImageModeSource
  if (
    input.blueprintMode === "product_ref" ||
    input.blueprintMode === "text2img"
  ) {
    desired = input.blueprintMode
    source = "blueprint"
  } else if (input.flowType === "welcome" && input.emailNumber != null) {
    const fromMatrix = WELCOME_MODE_BY_EMAIL[input.emailNumber]
    if (fromMatrix) {
      desired = fromMatrix
      source = "matrix"
    } else {
      desired = "text2img"
      source = "default"
    }
  } else {
    desired = "text2img"
    source = "default"
  }

  // 2. Fallbacks pra text2img quando product_ref nao e viavel
  if (desired === "product_ref") {
    if (!input.multimodalEnabled) {
      return { mode: "text2img", source: "fallback_text2img_disabled" }
    }
    if (!input.topProductImageUrl) {
      return { mode: "text2img", source: "fallback_text2img_no_product" }
    }
  }

  return { mode: desired, source }
}

/**
 * Quando o slot deveria ser `product_ref` mas caiu em `text2img` (por
 * fallback), injetamos no prompt uma descricao textual rica do produto
 * pra compensar a perda de fidelidade visual.
 */
export function productRefDescriptionFallback(input: {
  productName: string
  productImageUrl?: string | null
}): string {
  const url = input.productImageUrl
    ? ` (style guide image at ${input.productImageUrl})`
    : ""
  return `Featured product reference: "${input.productName}"${url}. Match material, color and proportions of this exact product closely; do not invent a different SKU.`
}
