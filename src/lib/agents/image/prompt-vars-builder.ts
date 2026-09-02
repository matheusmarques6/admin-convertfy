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
import { personaToText } from "./persona-text"
import { deriveCenario } from "./cenario-derivation"
import { resolveNeutro } from "./neutro-resolution"
import { deriveLogoStyle } from "./logo-style"
import { pickBrandLogo } from "@/lib/brand/pick-logo"
import {
  buildSegmentedPrompt,
  type PromptSegment,
  type SegmentOrigin,
} from "../shared/prompt-provenance"
import { renderImageTemplate } from "./template-renderer"
import { renderImagePrompt } from "../chains/image.chain"
import { deriveColorRoles } from "@/lib/agents/html/color-roles"
import { deriveShotArchetype } from "./shot-archetype"
import { buildImageSlots } from "./build-image-slots"
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
  // Copy REAL do bloco (email_blocks.content) — resolvida no phase2. Alimenta
  // as `areas_de_texto` de cada slot em IMAGE_SLOTS — só a FORMA (papel e
  // tamanho); o texto em si não vai ao modelo. Ausente → sem áreas no slot.
  blockContent?: Record<string, unknown> | null
  /**
   * Direção fotográfica por `variant_id` (migration 20261060). O bloco do
   * blueprint carrega a variante que o Montador casou; daqui sai o
   * briefing do fotógrafo DESTE bloco. Ausente → var vazia e o prompt
   * segue como antes.
   */
  photoDirectionByVariant?: Record<string, string>
  /**
   * Slot alvo desta geração. Desde que a geração virou por campo, cada
   * chamada corresponde a UM slot — e o prompt precisa carregar só o brief
   * dele. Sem isto o modelo recebia os N briefs do bloco de uma vez e
   * devolvia uma imagem só, tentando (mal) atender todos.
   *
   * Ausente → IMAGE_SLOTS traz todos os campos do bloco, comportamento
   * legado usado pelo preview de prompt e por blocos sem schema.
   */
  fieldKey?: string | null
}

/**
 * Monta variaveis para renderizar o prompt do agente de imagem.
 */
export function buildImagePromptVars(input: ImagePromptVarsInput): Record<string, string> {
  const marca = (input.briefing?.marca ?? {}) as Record<string, unknown>
  const brand = input.brand
  const products = (input.topProducts ?? []).slice(0, 5)

  const primaryColors = (brand?.colors_primary ?? []).map((c) => c.hex).join(", ") || "#000000"
  // Cor de FUNDO do email — o mesmo `bg` que a cadeia de formatação aplica
  // no documento (deriveColorRoles). Sem ela o modelo escolhia um fundo
  // qualquer e a foto não fundia com a seção: no email da Luxe Lift o bloco
  // saiu bege e a foto cinza-azulada, quebrando a fusão que o design system
  // chama de truque central do layout.
  const bgColor = deriveColorRoles(
    brand?.colors_primary ?? [],
    brand?.colors_secondary ?? [],
  ).bg
  const secondaryColors = (brand?.colors_secondary ?? []).map((c) => c.hex).join(", ") || ""
  const colorNames = (brand?.colors_primary ?? []).map((c) => c.name).join(", ")

  const topProductsDesc = products.length > 0
    ? products.map((p, i) => `${i + 1}. ${p.name} (R$ ${p.price})`).join("; ")
    : "Nenhum produto disponível"
  const topProductsImages = products.map((p) => p.image_url).filter(Boolean).join(", ")

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
  // Fallback em cascata: sem cor secundária, usa a 2a primária e por fim o
  // NEUTRO — PALETA_2 vazia deixava buraco no prompt ("com acentos de .").
  const PALETA_2 =
    (brand?.colors_secondary ?? [])[0]?.hex ??
    ((brand?.colors_primary ?? [])[1]?.hex || NEUTRO)

  // Fallback pro pilar de pesquisa (client_stores.icp_persona — OBJETO,
  // normalizado via personaToText) quando o briefing não populou
  // marca.persona. PUBLICO vazio deixava buracos tipo "universo de ." e
  // "Target audience: ." no prompt.
  const PUBLICO =
    personaToText(marca.persona) ||
    personaToText(input.storeRaw?.icp_persona)
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

  // IMAGE_SLOTS é a fonte PRIMÁRIA (schema estruturado + slot_note + copy do
  // grupo). Quando presente, suprime o IMAGE_BRIEF legado (que carrega os
  // mesmos dados espremidos) pra não duplicar direção de arte no prompt.
  // Briefing do fotógrafo DESTE bloco: sai da variante que o Montador casou
  // a ele. É input principal do prompt — nicho, posicionamento e paleta
  // passam a ser contexto de apoio.
  const photoDirection = (
    input.photoDirectionByVariant?.[(bpBlock?.variant_id ?? "").trim()] ?? ""
  ).trim()

  // Um slot por chamada: o buildImageSlots emite só a seção do campo alvo
  // (`fieldKey`), mas recebe o schema INTEIRO do bloco — as `areas_de_texto`
  // vêm do content inteiro e os irmãos de imagem entram como
  // `outras_imagens_deste_bloco` (a segunda foto sabe o que a primeira
  // mostra).
  const imageSlots = buildImageSlots(bpBlock?.fields, input.blockContent, {
    fieldKey: input.fieldKey ?? null,
  })
  const legacyImageBrief =
    bpBlock?.image_brief?.trim() || blueprint?.image_brief?.trim() || ""

  return {
    brand_name: brandName,
    block_purpose: input.blockPurpose,

    // ── Ideia do email (F5) — do blueprint (nível email) ────
    EMAIL_OBJETIVO: blueprint?.objective?.trim() ?? "",
    // Fase 3 do Estruturador: o fio narrativo (quando existe) é a ideia do
    // email mais fiel — messaging segue como fallback (gerações sem
    // Estruturador / rows legadas).
    EMAIL_IDEIA:
      (blueprint?.fio_narrativo ?? blueprint?.messaging)?.trim() ?? "",

    // Direção fotográfica da variante deste bloco (COMO fotografar).
    // Vazia quando ninguém escreveu — o template omite a seção inteira.
    PHOTO_DIRECTION: photoDirection,
    EMAIL_ASSUNTO: blueprint?.subject_hint?.trim() ?? "",

    // Perfil da marca (enxuto — tom/persona/diferencial/slogan/restrições
    // saíram: são redundantes com MOOD/PUBLICO ou não-visuais).
    nicho,
    posicionamento,

    // Identidade visual
    // Fundo do email: quando a composição pede fundo contínuo, é ESTE hex.
    BG_COLOR: bgColor,
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
    // Fallback legado do IMAGE_SLOTS (blueprints antigos sem fields
    // estruturados). Suprimido quando IMAGE_SLOTS existe (evita duplicar).
    IMAGE_BRIEF: imageSlots ? "" : legacyImageBrief,
    // Seções estruturadas por slot de imagem (schema + slot_note + copy do
    // grupo). Fonte PRIMÁRIA de direção de arte; vazio → cai no IMAGE_BRIEF.
    IMAGE_SLOTS: imageSlots,

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

// ── Proveniência das vars do prompt de imagem (migration 20261085) ──────
//
// Ao lado de quem as monta. As classes seguem a fonte real: dados da loja e
// da identidade visual são `loja`; a direção fotográfica é da BIBLIOTECA
// (escrita no cadastro da variante); a ideia do email e a direção de arte
// por slot vêm do blueprint/Estruturador, portanto `upstream`; o que o
// código deriva (arquétipo, modo, geometria) é `sistema`.

const IMG_LOJA: SegmentOrigin = { cls: "loja", rotulo: "Dados da loja — client_stores" }
const IMG_BRAND: SegmentOrigin = { cls: "loja", rotulo: "Identidade visual — store_brand_identity" }
const IMG_PROD: SegmentOrigin = { cls: "loja", rotulo: "Produtos da loja — store_products" }
const IMG_BLUEPRINT: SegmentOrigin = { cls: "upstream", rotulo: "Blueprint do email" }
const IMG_CODIGO: SegmentOrigin = { cls: "sistema", rotulo: "Derivado por código" }

export const IMAGE_VAR_ORIGINS: Record<string, SegmentOrigin> = {
  brand_name: IMG_LOJA,
  MARCA: IMG_LOJA,
  nicho: IMG_LOJA,
  NICHO: IMG_LOJA,
  posicionamento: IMG_LOJA,
  PUBLICO: IMG_LOJA,
  IDIOMA: IMG_LOJA,
  MOEDA: IMG_LOJA,
  BG_COLOR: IMG_BRAND,
  primary_colors: IMG_BRAND,
  secondary_colors: IMG_BRAND,
  color_names: IMG_BRAND,
  PALETA_1: IMG_BRAND,
  PALETA_2: IMG_BRAND,
  NEUTRO: IMG_BRAND,
  font_heading: IMG_BRAND,
  font_body: IMG_BRAND,
  logo_url: IMG_BRAND,
  LOGO_STYLE: IMG_BRAND,
  top_products: IMG_PROD,
  top_products_images: IMG_PROD,
  product_1_name: IMG_PROD,
  product_2_name: IMG_PROD,
  product_3_name: IMG_PROD,
  product_4_name: IMG_PROD,
  product_5_name: IMG_PROD,
  PRODUTO_HEROI: IMG_PROD,
  EMAIL_OBJETIVO: IMG_BLUEPRINT,
  EMAIL_ASSUNTO: IMG_BLUEPRINT,
  // O fio do Estruturador quando existe; messaging do blueprint como fallback.
  EMAIL_IDEIA: { cls: "upstream", rotulo: "Ideia do email — fio do Estruturador (ou messaging)" },
  // Escrita no cadastro da variante: é a biblioteca dizendo COMO fotografar.
  PHOTO_DIRECTION: { cls: "biblioteca", rotulo: "Direção fotográfica da variante" },
  IMAGE_SLOTS: { cls: "biblioteca", rotulo: "Direção de arte por slot — schema da variante" },
  IMAGE_BRIEF: IMG_BLUEPRINT,
  blueprint_purpose: IMG_BLUEPRINT,
  block_purpose: IMG_BLUEPRINT,
  block_label: IMG_BLUEPRINT,
  block_type: IMG_CODIGO,
  block_position: IMG_CODIGO,
  CENARIO: IMG_CODIGO,
  MOOD: IMG_CODIGO,
  shot_archetype: IMG_CODIGO,
  SHOT_ARCHETYPE: IMG_CODIGO,
  mode: IMG_CODIGO,
  aspect_ratio: IMG_CODIGO,
  flow_type: IMG_CODIGO,
  email_number: IMG_CODIGO,
  image_overlay_reserve_bottom: IMG_CODIGO,
  product_ref: IMG_CODIGO,
  INSTRUCAO_ADICIONAL: { cls: "loja", rotulo: "Instrução do operador no bloco" },
}

/**
 * O prompt de imagem montado E segmentado, num lugar só.
 *
 * A montagem é sempre a mesma — template renderizado + geometria + os
 * apêndices condicionais — e vivia duplicada entre o `phase2-runner` e o
 * `resolve-block-prompt.service` (que declara um "SYNC CONTRACT" no
 * cabeçalho justamente por isso). Duplicar a segmentação também seria o
 * terceiro lugar a sair de sincronia.
 *
 * Dois dialetos: config do banco usa `{{var}}` (renderImageTemplate, com
 * `{{#if}}`/`{{#case}}`), o default in-code usa `{var}` (renderImagePrompt).
 * `fromConfig` decide qual.
 *
 * O guard é a recomposição: os segmentos só saem quando reproduzem o prompt
 * final byte a byte — senão `segments: null` e a run grava o texto puro.
 */
export function buildImagePromptWithSegments(input: {
  template: string
  vars: Record<string, string>
  /** true = template veio de email_agent_configs (dialeto `{{var}}`). */
  fromConfig: boolean
  /** Instrução de proporção/dimensões calculada pelo código. */
  geometry: string
  /** Descrição do produto quando o anexo não pôde ir (fallback text2img). */
  fallbackDescription?: string | null
  /** Instrução de fidelidade ao produto anexado (modo product_ref). */
  fidelity?: string | null
}): { prompt: string; segments: PromptSegment[] | null } {
  const base = input.fromConfig
    ? renderImageTemplate(input.template, input.vars)
    : renderImagePrompt(input.template, input.vars)

  const seg = buildSegmentedPrompt(input.template, input.vars, IMAGE_VAR_ORIGINS, {
    parte: "user",
    dialeto: input.fromConfig ? "double" : "single",
  })

  const apendices: PromptSegment[] = []
  let prompt = `${base}\n\n${input.geometry}`
  apendices.push({
    cls: "sistema",
    rotulo: "Geometria — proporção/dimensões calculadas pelo código",
    texto: `\n\n${input.geometry}`,
    chars: input.geometry.length + 2,
    parte: "user",
  })

  if (input.fallbackDescription) {
    prompt += `\n\n${input.fallbackDescription}`
    apendices.push({
      cls: "sistema",
      rotulo: "Descrição do produto — fallback text2img (o anexo não pôde ir)",
      texto: `\n\n${input.fallbackDescription}`,
      chars: input.fallbackDescription.length + 2,
      parte: "user",
    })
  }

  if (input.fidelity) {
    prompt += `\n\n${input.fidelity}`
    apendices.push({
      cls: "agente",
      rotulo: "Fidelidade ao produto anexado — instrução in-code",
      texto: `\n\n${input.fidelity}`,
      chars: input.fidelity.length + 2,
      parte: "user",
    })
  }

  const candidato =
    seg.segments && seg.prompt === base ? [...seg.segments, ...apendices] : null
  const segments =
    candidato && candidato.map((sg) => sg.texto ?? "").join("") === prompt
      ? candidato
      : null

  return { prompt, segments }
}
