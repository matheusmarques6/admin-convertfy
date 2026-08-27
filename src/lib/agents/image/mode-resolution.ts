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
 *   3. Default `"product_ref"` quando ha foto de produto — ver abaixo
 *
 * O default era `text2img`, e a matriz so cobre `flow_type=welcome`. Todo o
 * resto (abandoned_cart, browse_abandonment, site_abandoned...) caia no
 * `else` e GERAVA o produto do zero, mesmo com a foto real ja carregada no
 * payload. Foi o que aconteceu com a Innova Bay (ago/2026): as 5 URLs do CDN
 * da Shopify chegaram ao agente em `top_products_images` e nenhuma foi usada
 * como referencia — o modelo inventou os produtos.
 *
 * Agora, sem override e fora da matriz, o default e `product_ref` sempre que
 * houver `topProductImageUrl` (a viabilidade real ainda passa pelos
 * fallbacks abaixo e pelo gate de download em `product-image-guard`). Sem
 * foto, `text2img` segue sendo o unico caminho possivel.
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
  | "fallback_text2img_unreachable"

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
      desired = input.topProductImageUrl ? "product_ref" : "text2img"
      source = "default"
    }
  } else {
    // Espelhar a foto real é o comportamento desejado sempre que ela
    // existir — não só no flow welcome.
    desired = input.topProductImageUrl ? "product_ref" : "text2img"
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
 * Instrucao de FIDELIDADE para o modo `product_ref`.
 *
 * Mandar a foto no content array nao basta: sem instrucao explicita o modelo
 * trata a imagem como inspiracao de estilo e devolve um produto "parecido" —
 * outra embalagem, outro formato, outro rotulo. O produto do e-mail tem que
 * ser o produto da loja, nao um primo dele.
 *
 * A direcao fotografica da variante continua mandando na CENA (luz,
 * enquadramento, fundo, pose). Esta instrucao manda no OBJETO.
 */
export function productRefFidelityInstruction(input: {
  productName: string
}): string {
  return [
    "CFY_PRODUCT_FIDELITY — THE ATTACHED PHOTO IS THE PRODUCT, NOT A MOOD REFERENCE.",
    `The attached image shows "${input.productName}", the real product sold by this store.`,
    "Reproduce THAT EXACT product: same shape, same proportions, same materials and finish, same colours, same label and typography, same details. Down to the badge, the port, the seam.",
    "You may change ONLY the scene around it — lighting, angle, framing, background, staging — as the photographic direction asks.",
    "You may NOT redesign the product, restyle the packaging, invent a variant, swap the logo, change the wording on the label, or produce a similar item from the same category.",
    "If the photographic direction describes a product category that does not match the attached photo, the ATTACHED PHOTO WINS: shoot this product, in the scene the direction asks for.",
  ].join("\n")
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

/**
 * QUAIS apêndices o prompt de imagem recebe, dado o modo resolvido.
 *
 * A montagem do prompt já vive num lugar só (`buildImagePromptWithSegments`);
 * a DECISÃO de quais apêndices entram vivia em dois — o `phase2-runner` e o
 * `resolve-block-prompt.service` — e as duas cópias divergiram: a manual
 * nunca aplicou a fidelidade e desconhecia o fallback `unreachable`. Imagem
 * regenerada à mão saía de um prompt diferente da gerada pelo pipeline.
 *
 * As duas instruções são MUTUAMENTE EXCLUSIVAS por construção: a fidelidade
 * fala da foto anexada (só existe em `product_ref`) e a descrição textual
 * compensa a foto que NÃO pôde ir (só existe nos fallbacks para text2img).
 */
export function resolveImageAppendices(input: {
  mode: ImageMode
  modeSource: ImageModeSource
  productName?: string | null
  productImageUrl?: string | null
}): { fidelity: string | null; fallbackDescription: string | null } {
  const productName = (input.productName ?? "").trim()
  // Sem nome de produto não há o que instruir: as duas frases se apoiam nele.
  if (!productName) return { fidelity: null, fallbackDescription: null }

  const caiuPorFallback =
    input.modeSource === "fallback_text2img_disabled" ||
    input.modeSource === "fallback_text2img_no_product" ||
    input.modeSource === "fallback_text2img_unreachable"

  return {
    fidelity:
      input.mode === "product_ref"
        ? productRefFidelityInstruction({ productName })
        : null,
    fallbackDescription: caiuPorFallback
      ? productRefDescriptionFallback({
          productName,
          productImageUrl: input.productImageUrl,
        })
      : null,
  }
}
