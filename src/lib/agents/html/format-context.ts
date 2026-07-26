/**
 * format-context — contexto compartilhado da cadeia de formatação
 * (hero_section → text_format → image_format → color_format) + builders
 * de vars por agente + resolução da variante da hero.
 *
 * Substitui o buildHtmlPromptVars monolítico: as queries rodam UMA vez
 * (loadFormatChainContext) e cada agente monta suas vars a partir do
 * contexto + do HTML intermediário do step anterior.
 *
 * Resolução da variante da hero (algoritmo puro, cascata):
 *   1. store_email_references.slot_map (escolha salva pelo Montador)
 *   2. blueprint.blocks[] — primeiro bloco type='hero' com variant_id
 *   3. email_generation_choices mais recente (memória do Curador)
 *   4. null → modo degradado (hero tratada como já autorada; só swaps)
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { languageLabelToCode } from "@/lib/i18n/store-language"
import { logger } from "@/lib/logger"
import type {
  EmailBlueprint,
  ReferenceSlotMapEntry,
} from "@/types/email-generation"
import type { ZodTypeAny } from "zod"

import type { StoreBrandIdentity } from "@/types/email-workspace"

import { loadGlobalReferenceTemplate } from "../reference-template"
import {
  buildBlocksWithContent,
  buildImageMap,
  buildTopProductsJson,
  fetchLogoMarkup,
  type BlockWithContent,
  type EmailBlockRow,
  type HtmlPromptVarsInput,
  type ImageMapEntry,
} from "./build-vars"
import { precheckBrandReady } from "./brand-guards"
import { DEFAULT_REFERENCE_SKELETON } from "./default-reference"
import { deriveColorRoles, type ColorRoles } from "./color-roles"
import {
  ColorFormatPromptVarsSchema,
  HeroPromptVarsSchema,
  ImageFormatPromptVarsSchema,
  TextFormatPromptVarsSchema,
} from "./contract"
import type { HeroChainMode } from "../chains/hero.chain"

const log = logger.child("FormatContext")

const DEFAULT_LOCALE = "pt-BR"
const DEFAULT_FONT = "Inter"
const DEFAULT_FONT_WEIGHT = "400"

export interface FormatChainContext {
  emailRow: { name: string; subject: string; preheader: string } | null
  blocks: EmailBlockRow[]
  referenceHtml: string
  referenceSource: "assembler" | "global" | "default_skeleton"
  slotMap: ReferenceSlotMapEntry[] | null
  blueprint: EmailBlueprint | null
  roles: ColorRoles
  logoLight: string
  logoDark: string
  locale: string
  brandName: string
  fontHeading: string
  fontHeadingWeight: string
  fontBody: string
  fontBodyWeight: string
  imageMap: ImageMapEntry[]
  blocksWithContent: BlockWithContent[]
  topProductsJson: string
}

/**
 * Logos clara/escura separadas: clara varre main→alt→monogram (nunca
 * reverse); escura é EXCLUSIVAMENTE a reverse (vazia quando a marca não
 * tem versão pra fundo escuro — o prompt manda cair na clara).
 */
async function fetchLogoLightDark(
  brand: StoreBrandIdentity | null,
  admin: SupabaseClient,
): Promise<{ light: string; dark: string }> {
  if (!brand) return { light: "", dark: "" }
  const lightBrand: StoreBrandIdentity = {
    ...brand,
    logo_reverse_svg: null,
    logo_reverse_png: null,
  }
  const darkBrand: StoreBrandIdentity = {
    ...brand,
    logo_main_svg: null,
    logo_main_png: null,
    logo_alt_svg: null,
    logo_alt_png: null,
    logo_monogram_svg: null,
    logo_monogram_png: null,
  }
  const [light, dark] = await Promise.all([
    fetchLogoMarkup(lightBrand, admin),
    fetchLogoMarkup(darkBrand, admin),
  ])
  return { light, dark }
}

/** Paleta aprovada serializada ("Papel: #HEX (Nome)" por linha). */
export function serializeBrandColors(brand: StoreBrandIdentity | null): string {
  if (!brand) return ""
  const all = [
    ...(Array.isArray(brand.colors_primary) ? brand.colors_primary : []),
    ...(Array.isArray(brand.colors_secondary) ? brand.colors_secondary : []),
  ]
  return all
    .filter((c) => c && typeof c.hex === "string" && c.hex.trim())
    .map((c) => {
      const role = typeof c.role === "string" && c.role.trim() ? c.role : "Cor"
      const name = typeof c.name === "string" && c.name.trim() ? ` (${c.name})` : ""
      return `${role}: ${c.hex}${name}`
    })
    .join("\n")
}

/**
 * Queries + derivações compartilhadas da cadeia. Mesmo comportamento do
 * antigo buildHtmlPromptVars: reference assembler→global→skeleton,
 * precheck de brand só loga (não bloqueia), locale normalizado.
 */
export async function loadFormatChainContext(
  input: HtmlPromptVarsInput,
): Promise<FormatChainContext> {
  const {
    emailId,
    brand,
    blueprint,
    topProducts,
    storeRaw,
    flowType,
    emailNumber,
    admin,
    relaxedBrandCheck,
  } = input

  const storeId = (storeRaw?.id as string | undefined) ?? null
  precheckBrandReady(brand, storeId, { relaxed: relaxedBrandCheck })

  const [emailRes, blocksRes, storeRefRes, globalRefHtml] = await Promise.all([
    admin
      .from("email_flow_emails")
      .select("name, subject, preheader")
      .eq("id", emailId)
      .maybeSingle(),
    admin
      .from("email_blocks")
      .select("id, position, block_type, label, content")
      .eq("email_id", emailId)
      .order("position", { ascending: true }),
    storeId && flowType && emailNumber != null
      ? admin
          .from("store_email_references")
          .select("html, slot_map")
          .eq("store_id", storeId)
          .eq("flow_type", flowType)
          .eq("email_number", emailNumber)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadGlobalReferenceTemplate(admin, flowType, emailNumber),
  ])

  const emailRow = emailRes.data as
    | { name: string; subject: string; preheader: string }
    | null
  const blocks = (blocksRes.data as EmailBlockRow[] | null) ?? []
  const storeRef = (storeRefRes as {
    data: { html?: string | null; slot_map?: ReferenceSlotMapEntry[] | null } | null
  }).data
  const storeRefHtml = storeRef?.html ?? null
  const referenceHtml = storeRefHtml || globalRefHtml || DEFAULT_REFERENCE_SKELETON
  const referenceSource = storeRefHtml
    ? ("assembler" as const)
    : globalRefHtml
      ? ("global" as const)
      : ("default_skeleton" as const)
  if (referenceSource !== "assembler") {
    log.warn("fmt.reference_not_from_assembler", {
      emailId,
      flowType,
      emailNumber,
      source: referenceSource,
    })
  }

  const roles = deriveColorRoles(
    brand?.colors_primary ?? [],
    brand?.colors_secondary ?? [],
  )
  const { light: logoLight, dark: logoDark } = await fetchLogoLightDark(
    brand,
    admin,
  )

  const rawLanguage = storeRaw?.language as string | undefined
  const normalizedCode = languageLabelToCode(rawLanguage)
  const looksLikeIsoCode =
    typeof rawLanguage === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLanguage)
  const locale =
    normalizedCode ?? (looksLikeIsoCode ? rawLanguage : DEFAULT_LOCALE)

  const brandName = (storeRaw?.store_name as string | undefined) || "Loja"

  return {
    emailRow,
    blocks,
    referenceHtml,
    referenceSource,
    slotMap: Array.isArray(storeRef?.slot_map) ? storeRef.slot_map : null,
    blueprint,
    roles,
    logoLight,
    logoDark,
    locale,
    brandName,
    fontHeading: brand?.font_heading || DEFAULT_FONT,
    fontHeadingWeight: brand?.font_heading_weight || DEFAULT_FONT_WEIGHT,
    fontBody: brand?.font_body || DEFAULT_FONT,
    fontBodyWeight: brand?.font_body_weight || DEFAULT_FONT_WEIGHT,
    imageMap: buildImageMap(blocks, blueprint),
    blocksWithContent: buildBlocksWithContent(blocks, blueprint, brandName),
    topProductsJson: buildTopProductsJson(topProducts),
  }
}

// ── Resolução da variante da hero ──────────────────────────────────

export interface HeroVariantData {
  id: string
  html: string
  rendered_html: string | null
  output_schema: unknown
  block_type: string
}

export type HeroVariantSource = "slot_map" | "blueprint" | "choices" | null

const isHeroSection = (s: string | null | undefined): boolean =>
  typeof s === "string" && s.toLowerCase().includes("hero")

/**
 * Cascata determinística da escolha do Montador pra hero. Devolve a
 * variante carregada (html + rendered_html + schema) ou null → degradado.
 */
export async function resolveHeroVariant(
  admin: SupabaseClient,
  params: {
    storeId: string | null
    flowType: string | null
    emailNumber: number | null
    slotMap: ReferenceSlotMapEntry[] | null
    blueprint: EmailBlueprint | null
  },
): Promise<{ variant: HeroVariantData | null; source: HeroVariantSource }> {
  const { storeId, flowType, emailNumber, slotMap, blueprint } = params

  let variantId: string | null = null
  let source: HeroVariantSource = null

  // 1. slot_map do reference (escolha salva por parte do email).
  const fromSlotMap = slotMap?.find(
    (s) => isHeroSection(s.section) && s.variant_id,
  )
  if (fromSlotMap?.variant_id) {
    variantId = fromSlotMap.variant_id
    source = "slot_map"
  }

  // 2. blueprint.blocks — packageBlueprint persiste variant_id por bloco.
  if (!variantId && Array.isArray(blueprint?.blocks)) {
    const heroBlock = blueprint.blocks.find(
      (b) => b.type === "hero" && b.variant_id,
    )
    if (heroBlock?.variant_id) {
      variantId = heroBlock.variant_id
      source = "blueprint"
    }
  }

  // 3. Memória do Curador (append-only; mais recente vence).
  if (!variantId && storeId && flowType && emailNumber != null) {
    const { data } = await admin
      .from("email_generation_choices")
      .select("choices")
      .eq("store_id", storeId)
      .eq("flow_type", flowType)
      .eq("email_number", emailNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const choices = (data?.choices ?? []) as Array<{
      section?: string
      variant_id?: string
    }>
    const heroChoice = choices.find(
      (c) => isHeroSection(c.section) && c.variant_id,
    )
    if (heroChoice?.variant_id) {
      variantId = heroChoice.variant_id
      source = "choices"
    }
  }

  if (!variantId) return { variant: null, source: null }

  const { data: variant, error } = await admin
    .from("email_component_variants")
    .select("id, html, rendered_html, output_schema, block_type")
    .eq("id", variantId)
    .maybeSingle()
  if (error || !variant) {
    log.warn("fmt.hero_variant_load_failed", {
      variantId,
      source,
      error: error?.message ?? "not_found",
    })
    return { variant: null, source: null }
  }
  return { variant: variant as HeroVariantData, source }
}

// ── Builders de vars por agente ────────────────────────────────────

function validateVars(
  schema: ZodTypeAny,
  vars: Record<string, string>,
  agent: string,
): Record<string, string> {
  if (process.env.NODE_ENV !== "production") {
    schema.parse(vars)
  } else {
    const result = schema.safeParse(vars)
    if (!result.success) {
      log.warn("contract.drift", {
        agent,
        issues: result.error.issues.slice(0, 5),
      })
    }
  }
  return vars
}

function identityVars(ctx: FormatChainContext): Record<string, string> {
  return {
    brand_name: ctx.brandName,
    locale: ctx.locale,
    color_bg: ctx.roles.bg,
    color_text: ctx.roles.text,
    color_heading: ctx.roles.heading,
    color_button_bg: ctx.roles.button_bg,
    color_button_text: ctx.roles.button_text,
    color_accent: ctx.roles.accent,
    font_heading: ctx.fontHeading,
    font_heading_weight: ctx.fontHeadingWeight,
    font_body: ctx.fontBody,
    font_body_weight: ctx.fontBodyWeight,
  }
}

export function buildHeroVars(
  ctx: FormatChainContext,
  params: {
    mode: HeroChainMode
    regionHtml: string
    variant: HeroVariantData | null
  },
): Record<string, string> {
  const heroBlock = ctx.blocksWithContent.find((b) => b.type === "hero")
  const heroImage = ctx.imageMap.find((e) => e.block_type === "hero")
  const vars = {
    ...identityVars(ctx),
    logo_light: ctx.logoLight,
    logo_dark: ctx.logoDark,
    email_name: ctx.emailRow?.name || "",
    subject: ctx.emailRow?.subject || "",
    montador_html: ctx.referenceHtml,
    hero_region_html: params.regionHtml,
    hero_variant_html: params.variant?.html ?? "",
    hero_variant_rendered_html: params.variant?.rendered_html ?? "",
    hero_variant_schema_json: params.variant?.output_schema
      ? JSON.stringify(params.variant.output_schema, null, 2)
      : "",
    hero_content_json: heroBlock ? JSON.stringify(heroBlock, null, 2) : "{}",
    hero_image_url: heroImage?.url ?? "",
    hero_image_alt: "",
    // Preenchida pelo chain conforme o mode (fragment/full_doc) — presente
    // aqui só pra satisfazer o contrato/validador.
    output_contract: params.mode,
  }
  return validateVars(HeroPromptVarsSchema, vars, "hero_section")
}

export function buildTextFormatVars(
  ctx: FormatChainContext,
  html: string,
): Record<string, string> {
  const nonHeroBlocks = ctx.blocksWithContent.filter((b) => b.type !== "hero")
  const fields = Array.isArray(ctx.blueprint?.blocks)
    ? ctx.blueprint.blocks
        .map((b, i) => ({
          position: i + 1,
          type: b.type,
          variant_name: b.variant_name ?? null,
          fields: b.fields ?? [],
        }))
        .filter((b) => b.type !== "hero")
    : []
  const vars = {
    ...identityVars(ctx),
    html,
    email_name: ctx.emailRow?.name || "",
    subject: ctx.emailRow?.subject || "",
    preheader: ctx.emailRow?.preheader || "",
    objective: ctx.blueprint?.objective || "",
    messaging: ctx.blueprint?.messaging || "",
    blocks_with_content_json: JSON.stringify(nonHeroBlocks, null, 2),
    fields_json: JSON.stringify(fields, null, 2),
    top_products_json: ctx.topProductsJson,
  }
  return validateVars(TextFormatPromptVarsSchema, vars, "text_format")
}

export function buildImageFormatVars(
  ctx: FormatChainContext,
  html: string,
): Record<string, string> {
  // A entry da hero fica de fora — a imagem da hero já foi colocada pelo
  // agente hero_section (avatares/reviews/products entram normalmente).
  const nonHeroEntries = ctx.imageMap.filter((e) => e.block_type !== "hero")
  const vars = {
    brand_name: ctx.brandName,
    html,
    image_map_json: JSON.stringify(nonHeroEntries, null, 2),
    logo_light: ctx.logoLight,
    logo_dark: ctx.logoDark,
    top_products_json: ctx.topProductsJson,
  }
  return validateVars(ImageFormatPromptVarsSchema, vars, "image_format")
}

export function buildColorFormatVars(
  ctx: FormatChainContext,
  html: string,
  extras: {
    brand: StoreBrandIdentity | null
    niche: string
    tones: string
    pesquisaFullText: string
  },
): Record<string, string> {
  const vars = {
    brand_name: ctx.brandName,
    niche: extras.niche,
    locale: ctx.locale,
    tones: extras.tones,
    html,
    brand_colors: serializeBrandColors(extras.brand),
    font_heading: ctx.fontHeading,
    font_body: ctx.fontBody,
    pesquisa_full_text: extras.pesquisaFullText,
    email_name: ctx.emailRow?.name || "",
    subject: ctx.emailRow?.subject || "",
  }
  return validateVars(ColorFormatPromptVarsSchema, vars, "color_format")
}
