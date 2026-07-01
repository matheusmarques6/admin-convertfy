/**
 * buildImagePromptVars — monta as variáveis para renderizar o prompt do
 * agente de imagem.
 *
 * Extraído de `email-generation.service.ts` (AE-10..AE-16) para ser
 * compartilhado entre o pipeline de email e o pipeline de imagens de
 * campanha (Geração de Imagens por Loja). `email-generation.service.ts`
 * re-exporta `buildImagePromptVars`/`ImagePromptVarsInput` daqui para não
 * quebrar os callers existentes.
 *
 * Retorna 31 variaveis em DUAS convencoes co-existentes:
 *   - 19 vars legacy snake_case (`brand_name`, `nicho`, `tom_voz`,
 *     `primary_colors`, `top_products`, `block_purpose` etc) — mantidas para
 *     retrocompat com `DEFAULT_IMAGE_PROMPT_TEMPLATE` em image.chain.ts e com
 *     chamadas que existiam antes da AE-10.
 *   - 12 vars niche-adaptive UPPERCASE (`MARCA`, `LOGO_STYLE`, `NICHO`,
 *     `PRODUTO_HEROI`, `PUBLICO`, `CENARIO`, `PALETA_1`, `PALETA_2`, `NEUTRO`,
 *     `MOOD`, `IDIOMA`, `MOEDA`) — usadas pelos prompts mestres.
 *
 * Templates novos devem usar SOMENTE UPPERCASE. snake_case fica para callers
 * legacy (Klaviyo, chains pre-AE-10) ate migracao completa.
 */

import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"
import type {
  EmailBlueprint,
  StoreImageOverrides,
} from "@/types/email-generation"
import { mapTomVozToMood } from "./mood-mapping"
import { deriveCenario } from "./cenario-derivation"
import { resolveNeutro } from "./neutro-resolution"
import { deriveLogoStyle } from "./logo-style"
import { pickBrandLogo } from "@/lib/brand/pick-logo"
import { deriveShotArchetype } from "./shot-archetype"
import type { AspectKey } from "./aspect-ratio"
import type { ImageMode } from "./mode-resolution"

export interface ImagePromptVarsInput {
  brand: StoreBrandIdentity | null
  briefing: StoreBriefing | null
  topProducts: TopProduct[]
  storeRaw: Record<string, unknown>
  blockPurpose: string
  // ── Epic AE-Image Niche-Adaptive (story AE-10) ─────────
  // Opcionais — quando ausentes, as 19 vars antigas continuam
  // sendo retornadas, mas as 12 vars niche-adaptive (MAIUSCULAS)
  // são preenchidas com fallbacks dos helpers.
  emailNumber?: number
  flowType?: string
  blueprint?: EmailBlueprint | null
  storeOverrides?: StoreImageOverrides | null
  // ── Story AE-11 — hook para instrucao por bloco (AE-16 preenche). ─
  // Resolve para `INSTRUCAO_ADICIONAL` (UPPERCASE) no retorno; o
  // template envolve em {{#if INSTRUCAO_ADICIONAL}}...{{/if}} para
  // omitir o bloco quando vazio.
  instrucaoAdicional?: string
  // ── Master Prompt v2 — contexto por bloco já resolvido pelo caller ─
  // O caller (phase2-runner / resolve-block-prompt) já resolveu
  // aspect/mode via os derivers src/lib/agents/image. Passa eles pra
  // cá pra ficarem disponíveis ao template como vars (`aspect_ratio`,
  // `mode`, `product_ref`) e pra alimentar `deriveShotArchetype`.
  blockType?: string
  blockLabel?: string
  // Posição (1-based) do bloco no email. Usada pra casar o bloco do blueprint
  // pelo índice (robusto a múltiplos blocos do mesmo tipo) e ler o prompt de
  // imagem daquele bloco (image_brief). Fallback: match por tipo.
  blockPosition?: number
  imageOverlayReserveBottom?: boolean
  aspect?: AspectKey
  mode?: ImageMode
}

/**
 * Monta variaveis para renderizar o prompt do agente de imagem.
 */
export function buildImagePromptVars(input: ImagePromptVarsInput): Record<string, string> {
  const marca = (input.briefing?.marca ?? {}) as Record<string, unknown>
  const detail = (input.briefing?.briefing ?? {}) as Record<string, unknown>
  const brand = input.brand
  const products = (input.topProducts ?? []).slice(0, 5)

  const primaryColors = (brand?.colors_primary ?? []).map((c) => c.hex).join(", ") || "#000000"
  const secondaryColors = (brand?.colors_secondary ?? []).map((c) => c.hex).join(", ") || ""
  const colorNames = (brand?.colors_primary ?? []).map((c) => c.name).join(", ")

  const topProductsDesc = products.length > 0
    ? products.map((p, i) => `${i + 1}. ${p.name} (R$ ${p.price})`).join("; ")
    : "Nenhum produto disponível"
  const topProductsImages = products.map((p) => p.image_url).filter(Boolean).join(", ")

  const restricoesArr = detail.restricoes as string[] | undefined
  const restricoes = Array.isArray(restricoesArr) ? restricoesArr.join("; ") : ""

  // Fallback p/ client_stores.niche quando o briefing nao populou marca.nicho
  // (espelha architect/generate.service.ts). Sem isso, loja com niche so em
  // client_stores gerava imagem generica a toa.
  const nicho =
    (marca.nicho as string) || (input.storeRaw?.niche as string) || ""
  const posicionamento = (marca.posicionamento as string) ?? "medio"
  const tomVoz = (marca.tom_voz as string) ?? "casual"
  const brandName = (input.storeRaw.store_name as string) ?? "Loja"

  // ── Niche-adaptive (story AE-10) ─────────────────────────
  const overrides = input.storeOverrides ?? null
  const blueprint = input.blueprint ?? null

  const MOOD = overrides?.mood_override?.trim()
    ? overrides.mood_override
    : mapTomVozToMood(tomVoz)

  const CENARIO = deriveCenario({
    nicho,
    posicionamento,
    override: overrides?.cenario_override ?? null,
  })

  const NEUTRO = resolveNeutro({
    colorsPrimary: brand?.colors_primary ?? null,
    colorsSecondary: brand?.colors_secondary ?? null,
    posicionamento,
    override: overrides?.neutro_override ?? null,
  })

  const LOGO_STYLE = deriveLogoStyle({
    fontHeading: brand?.font_heading ?? null,
    override: overrides?.logo_style_override ?? null,
  })

  // Prioridade: override loja > hint do blueprint > top product [0]
  const PRODUTO_HEROI =
    overrides?.produto_heroi_override?.trim() ||
    blueprint?.image_produto_heroi_hint ||
    products[0]?.name ||
    ""

  const PALETA_1 = (brand?.colors_primary ?? [])[0]?.hex ?? ""
  const PALETA_2 = (brand?.colors_secondary ?? [])[0]?.hex ?? ""

  const PUBLICO = (marca.persona as string) ?? ""
  const IDIOMA = (input.storeRaw.language as string) ?? "pt-BR"
  const MOEDA = (input.storeRaw.currency as string) ?? "BRL"

  // ── Master Prompt v2 — vars por bloco ────────────────────
  // Resolve o bloco do blueprint DESTE slot. Prioriza a POSIÇÃO (robusto a
  // múltiplos blocos do mesmo tipo); cai pra match por tipo se o caller não
  // passou position. Dele saem `blueprint_purpose` e o prompt de imagem.
  const bpBlock =
    input.blockPosition != null
      ? blueprint?.blocks?.[input.blockPosition - 1]
      : input.blockType
        ? blueprint?.blocks?.find((b) => b.type === input.blockType)
        : undefined
  const blueprintPurpose = bpBlock?.purpose ?? ""
  const modeVal: ImageMode = input.mode ?? "text2img"
  const aspectVal: string = input.aspect ?? ""
  const shotArchetype = deriveShotArchetype({
    blockType: input.blockType,
    blockLabel: input.blockLabel,
    blueprintPurpose,
    mode: modeVal,
    emailNumber: input.emailNumber,
    flowType: input.flowType,
  })

  return {
    brand_name: brandName,
    block_purpose: input.blockPurpose,

    // Perfil da marca
    nicho,
    posicionamento,
    tom_voz: tomVoz,
    persona: (marca.persona as string) ?? "",
    diferencial: (marca.diferencial as string) ?? "",
    slogan: (marca.slogan as string) ?? "",
    restricoes,

    // Identidade visual
    primary_colors: primaryColors,
    secondary_colors: secondaryColors,
    color_names: colorNames,
    font_heading: brand?.font_heading ?? "",
    font_body: brand?.font_body ?? "",
    logo_url: pickBrandLogo(brand, "png")?.url ?? "",

    // Top 5 produtos
    top_products: topProductsDesc,
    top_products_images: topProductsImages,
    product_1_name: products[0]?.name ?? "",
    product_2_name: products[1]?.name ?? "",
    product_3_name: products[2]?.name ?? "",
    product_4_name: products[3]?.name ?? "",
    product_5_name: products[4]?.name ?? "",

    // ── Niche-adaptive (story AE-10) — chaves MAIUSCULAS ────
    MARCA: brandName,
    LOGO_STYLE,
    NICHO: nicho,
    PRODUTO_HEROI,
    PUBLICO,
    CENARIO,
    PALETA_1,
    PALETA_2,
    NEUTRO,
    MOOD,
    IDIOMA,
    MOEDA,
    INSTRUCAO_ADICIONAL: (input.instrucaoAdicional ?? "").trim(),
    // Prompt da imagem DESTE bloco (blueprint blocks[].image_brief), editado
    // no popup do editor de blueprints. Fallback: image_brief nível-email
    // (legado). Entra como direção de arte autoritativa no template.
    IMAGE_BRIEF:
      bpBlock?.image_brief?.trim() || blueprint?.image_brief?.trim() || "",

    // Contexto pro switch do template (snake_case porque o template usa
    // {{#case flow_type}}{{#when "welcome"}}... — convencao do parser
    // handlebars-lite que casa snake_case com string).
    flow_type: input.flowType ?? "",
    email_number: input.emailNumber != null ? String(input.emailNumber) : "",

    // ── Master Prompt v2 — contexto por bloco ──────────────
    // block_type/block_label/blueprint_purpose ajudam o modelo a entender
    // QUAL slot ele está renderizando dentro do email. shot_archetype é
    // o enum derivado (8 valores) que o System Prompt v2 conhece. mode +
    // aspect_ratio espelham o que o caller já decidiu via resolvers.
    block_type: input.blockType ?? "",
    block_label: input.blockLabel ?? "",
    blueprint_purpose: blueprintPurpose,
    image_overlay_reserve_bottom: input.imageOverlayReserveBottom
      ? "true"
      : "false",
    aspect_ratio: aspectVal,
    mode: modeVal,
    // product_ref é boolean-like — `""` = falsy no renderer (vide
    // BOOLEAN_LIKE_VARS abaixo). Quando true, vira `"true"` (truthy).
    product_ref: modeVal === "product_ref" ? "true" : "",
    shot_archetype: shotArchetype,
    SHOT_ARCHETYPE: shotArchetype,
  }
}

/**
 * Vars que precisam ficar literalmente `"true"` / `"false"` / `""`
 * mesmo quando o template não as referencia explicitamente. Sem isso,
 * `fillMissingVars` reescreve `""` como `"(nenhum)"` — que é truthy
 * no renderer custom — quebrando `{{#if product_ref}}` e
 * `{{#if image_overlay_reserve_bottom}}`.
 */
export const BOOLEAN_LIKE_VARS = new Set([
  "product_ref",
  "image_overlay_reserve_bottom",
])
