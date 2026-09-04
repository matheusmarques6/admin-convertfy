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
import type { SegmentOrigin } from "../shared/prompt-provenance"
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
import { resolveRenderedReference } from "../shared/rendered-reference"
import { DEFAULT_REFERENCE_SKELETON } from "./default-reference"
import { deriveColorRoles, type ColorRoles } from "./color-roles"
import {
  ColorFormatPromptVarsSchema,
  HeroPromptVarsSchema,
  TextFormatPromptVarsSchema,
  TypographyPromptVarsSchema,
} from "./contract"
import { locateBlockRegions } from "./slot-finder"
import { extractColorInventory } from "./color-inventory"
// A classificação por nome mora num módulo PURO: a tela de tipografia
// precisa dela, e importar este arquivo no navegador traria o cliente
// Supabase junto. Reexportada aqui para os call sites antigos não mudarem.
export { classifyFontFamily } from "../typography/font-name"
import { classifyFontFamily } from "../typography/font-name"
import { annotateInventoryPairs } from "./color-contrast"

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
      .select("id, position, block_type, label, content, fields")
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
  /** Hash do `html` que originou o exemplo renderizado (CM-6). */
  rendered_html_source_sha?: string | null
  output_schema: unknown
  block_type: string
  /** Regras de design da variante, escritas por quem a cadastrou. */
  design_system?: string | null
}

export type HeroVariantSource = "slot_map" | "blueprint" | "choices" | null

const isHeroSection = (s: string | null | undefined): boolean =>
  typeof s === "string" && s.toLowerCase().includes("hero")

/**
 * Cascata determinística da escolha do Montador pra hero. Devolve a
 * variante carregada (html + rendered_html + schema) ou null → degradado.
 *
 * ORDEM: blueprint > slot_map > choices. O blueprint vence porque ele é o
 * CONTRATO de endereçamento da copy: `packageBlueprint` deriva
 * `blocks[].fields[]` do `output_schema` da variante que casou e resolve
 * cada `fields.tag` contra o HTML EFETIVO dessa mesma variante
 * (`fieldsFromSchema(schema, tags, effectiveVariantHtml(variant))`). A copy
 * do n8n volta amarrada a esses fields e o `copy_merge` ancora por
 * `fields.tag`. Enxertar uma variante diferente da que gerou os fields
 * deixa as tags do snapshot sem endereço no documento — merge ancora zero.
 *
 * No fluxo natural as duas fontes concordam por construção (o Blueprint
 * recebe os MESMOS `slots` que viram `slot_map`), mas podem divergir quando
 * reference e blueprint são regenerados em momentos diferentes, ou quando o
 * match FIFO deixa o bloco hero sem variante (`variant_id: null` no
 * blueprint) — daí a telemetria de divergência.
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
): Promise<{
  variant: HeroVariantData | null
  source: HeroVariantSource
  /** Blueprint e slot_map apontam variantes diferentes (blueprint vence). */
  mismatch: boolean
}> {
  const { storeId, flowType, emailNumber, slotMap, blueprint } = params

  let variantId: string | null = null
  let source: HeroVariantSource = null

  // 1. blueprint.blocks — packageBlueprint persiste variant_id por bloco, e
  //    é dele que saíram os fields/tags que a copy vai preencher.
  const fromBlueprint = Array.isArray(blueprint?.blocks)
    ? blueprint.blocks.find((b) => b.type === "hero" && b.variant_id)
    : undefined
  if (fromBlueprint?.variant_id) {
    variantId = fromBlueprint.variant_id
    source = "blueprint"
  }

  // 2. slot_map do reference (escolha do Montador por parte do email).
  const fromSlotMap = slotMap?.find(
    (s) => isHeroSection(s.section) && s.variant_id,
  )
  if (!variantId && fromSlotMap?.variant_id) {
    variantId = fromSlotMap.variant_id
    source = "slot_map"
  }

  const mismatch =
    !!fromBlueprint?.variant_id &&
    !!fromSlotMap?.variant_id &&
    fromBlueprint.variant_id !== fromSlotMap.variant_id
  if (mismatch) {
    log.warn("fmt.hero_variant_mismatch", {
      storeId,
      flowType,
      emailNumber,
      blueprintVariantId: fromBlueprint?.variant_id,
      slotMapVariantId: fromSlotMap?.variant_id,
    })
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

  if (!variantId) return { variant: null, source: null, mismatch }

  const { data: variant, error } = await admin
    .from("email_component_variants")
    .select(
      // `rendered_html_source_sha` faltava aqui desde o CM-6: sem a coluna
      // no select, `resolveRenderedReference` via undefined e devolvia
      // `unknown_sha` SEMPRE — o hash de origem nunca chegou a ser
      // comparado, e todo exemplo aparecia como desatualizado.
      "id, html, rendered_html, rendered_html_source_sha, output_schema, block_type, design_system",
    )
    .eq("id", variantId)
    .maybeSingle()
  if (error || !variant) {
    log.warn("fmt.hero_variant_load_failed", {
      variantId,
      source,
      error: error?.message ?? "not_found",
    })
    return { variant: null, source: null, mismatch }
  }
  return { variant: variant as HeroVariantData, source, mismatch }
}

// ── Builders de vars por agente ────────────────────────────────────

/**
 * Vars que o schema exige e o builder não produziu, por agente.
 *
 * Em produção o drift do contrato só virava `log.warn` — e foi assim que
 * `color_surface`/`color_surface_strong` ficaram meses fora do prompt de
 * cores sem ninguém notar: a var era exigida pelo schema, declarada na
 * proveniência, e o builder simplesmente não a montava. O registro aqui é
 * lido pelo runner e vai para a telemetria do run, onde alguém vê.
 *
 * Não lança em produção de propósito: derrubar a geração por causa de uma
 * var faltando é pior que gerar degradado — mas degradar em silêncio, que
 * era o que acontecia, é pior que os dois.
 */
const contractDrift = new Map<string, string[]>()

/** Campos ausentes registrados desde a última leitura (e limpa o registro). */
export function takeContractDrift(agent: string): string[] {
  const missing = contractDrift.get(agent) ?? []
  contractDrift.delete(agent)
  return missing
}

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
      const missing = result.error.issues.map((i) => i.path.join("."))
      contractDrift.set(agent, missing)
      log.warn("contract.drift", {
        agent,
        campos: missing.slice(0, 10),
        issues: result.error.issues.slice(0, 5),
      })
    } else {
      contractDrift.delete(agent)
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
    color_surface: ctx.roles.surface,
    color_surface_strong: ctx.roles.surface_strong,
    font_heading: ctx.fontHeading,
    font_heading_weight: ctx.fontHeadingWeight,
    font_body: ctx.fontBody,
    font_body_weight: ctx.fontBodyWeight,
  }
}

const TAG_IN_HTML = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

function tagsIn(html: string): Set<string> {
  return new Set(Array.from(html.matchAll(TAG_IN_HTML), (m) => m[1]))
}

function blueprintTagsOf(
  ctx: FormatChainContext,
  position: number,
): string[] {
  const bp = Array.isArray(ctx.blueprint?.blocks)
    ? ctx.blueprint.blocks[position - 1]
    : undefined
  return Array.isArray(bp?.tags) ? bp.tags : []
}

/**
 * Blocos de copy cujos placeholders vivem DENTRO da região da hero.
 * Variantes de hero compostas (banner de cupom + logo bar + hero) engolem
 * blocos vizinhos — a copy deles precisa ir pro agente Hero, senão fica
 * órfã (o agente de texto é proibido de tocar na região; caso Luxe Lift:
 * "Use code '' for off"). Fallback: só o bloco type='hero'.
 */
export function blocksInsideHeroRegion(
  ctx: FormatChainContext,
  regionHtml: string,
): BlockWithContent[] {
  if (regionHtml) {
    // 1. Marcadores cfy:block dentro da região (D5) — o caminho canônico
    //    quando a reference veio montada por código. Cada marcador casa
    //    com o bloco do MESMO tipo, na ordem (n-ésima ocorrência), a mesma
    //    convenção sequencial do qa-views. A hero ENXERTADA consome os
    //    marcadores no splice — aí cai nas cascatas abaixo.
    const markers = locateBlockRegions(regionHtml)
    if (markers.length > 0) {
      const nthByType = new Map<string, number>()
      const included: BlockWithContent[] = []
      for (const m of markers) {
        const nth = nthByType.get(m.tipo) ?? 0
        nthByType.set(m.tipo, nth + 1)
        const matches = ctx.blocksWithContent.filter((b) => b.type === m.tipo)
        if (matches[nth]) included.push(matches[nth])
      }
      if (included.length > 0) return included
    }
    // 2. Legado {{TAG}}: região ainda com placeholders do blueprint.
    const regionTags = tagsIn(regionHtml)
    if (regionTags.size > 0) {
      const included = ctx.blocksWithContent.filter((b) =>
        blueprintTagsOf(ctx, b.position).some((t) => regionTags.has(t)),
      )
      if (included.length > 0) return included
    }
  }
  const hero = ctx.blocksWithContent.find((b) => b.type === "hero")
  return hero ? [hero] : []
}

// ── Proveniência: a origem de cada var dos prompts da fase 2 ────────────
//
// Ficam AQUI, ao lado de quem monta as vars: quem sabe de onde o valor veio
// é o builder, não o chain. Constantes (não parâmetros) para não mexer na
// assinatura de `build*Vars`, fixada por 13 testes.

const LOJA_STORE: SegmentOrigin = { cls: "loja", rotulo: "Dados da loja — client_stores" }
const LOJA_BRAND: SegmentOrigin = { cls: "loja", rotulo: "Identidade visual aprovada — store_brand_identity" }
const ROLES: SegmentOrigin = { cls: "sistema", rotulo: "Papéis de cor — deriveColorRoles (código)" }
const EMAIL_ROW: SegmentOrigin = { cls: "sistema", rotulo: "Email — email_flow_emails" }

/** Vars comuns a hero/text/color (identityVars). */
const IDENTITY_ORIGINS: Record<string, SegmentOrigin> = {
  brand_name: LOJA_STORE,
  locale: LOJA_STORE,
  color_bg: ROLES,
  color_text: ROLES,
  color_heading: ROLES,
  color_button_bg: ROLES,
  color_button_text: ROLES,
  color_accent: ROLES,
  color_surface: ROLES,
  color_surface_strong: ROLES,
  font_heading: LOJA_BRAND,
  font_heading_weight: LOJA_BRAND,
  font_body: LOJA_BRAND,
  font_body_weight: LOJA_BRAND,
}

export const HERO_VAR_ORIGINS: Record<string, SegmentOrigin> = {
  ...IDENTITY_ORIGINS,
  logo_light: LOJA_BRAND,
  logo_dark: LOJA_BRAND,
  email_name: EMAIL_ROW,
  subject: EMAIL_ROW,
  hero_region_html: { cls: "upstream", rotulo: "Região da hero — documento montado (Montador + enxerto)" },
  hero_variant_html: { cls: "biblioteca", rotulo: "HTML canônico da variante — email_component_variants" },
  hero_variant_rendered_html: { cls: "biblioteca", rotulo: "Exemplo renderizado da variante" },
  hero_variant_schema_json: { cls: "biblioteca", rotulo: "output_schema da variante" },
  hero_variant_design_system: { cls: "biblioteca", rotulo: "Regras de design da variante" },
  hero_design_system_block: { cls: "biblioteca", rotulo: "Regras de design da variante" },
  hero_source: { cls: "sistema", rotulo: "Origem da região (library/montador) — código" },
  hero_content_json: { cls: "upstream", rotulo: "Copy da hero — callback do n8n" },
  hero_pending_json: { cls: "upstream", rotulo: "Campos que o copy_merge não ancorou" },
  hero_image_url: { cls: "upstream", rotulo: "Imagem gerada — SAÍDA do agente de imagem" },
  hero_image_alt: { cls: "upstream", rotulo: "Alt da imagem gerada" },
  output_contract: { cls: "agente", rotulo: "Contrato de saída — in-code" },
  montador_html: { cls: "upstream", rotulo: "Documento do Montador (var legada, vazia desde o CM-5)" },
}

export const TEXT_FORMAT_VAR_ORIGINS: Record<string, SegmentOrigin> = {
  ...IDENTITY_ORIGINS,
  html: { cls: "upstream", rotulo: "Documento — SAÍDA do step anterior (hero)" },
  email_name: EMAIL_ROW,
  subject: EMAIL_ROW,
  preheader: EMAIL_ROW,
  objective: { cls: "upstream", rotulo: "Objetivo — blueprint da loja" },
  messaging: { cls: "upstream", rotulo: "Direção editorial — blueprint da loja" },
  blocks_with_content_json: { cls: "upstream", rotulo: "Copy por bloco — callback do n8n" },
  fields_json: { cls: "biblioteca", rotulo: "Contrato de campos — schema das variantes casadas" },
  top_products_json: { cls: "loja", rotulo: "Produtos da loja — store_products" },
}

export const TYPOGRAPHY_VAR_ORIGINS: Record<string, SegmentOrigin> = {
  ...IDENTITY_ORIGINS,
  niche: LOJA_STORE,
  tom_de_voz: LOJA_STORE,
  posicionamento: LOJA_STORE,
  classe_principal: { cls: "sistema", rotulo: "Classe da fonte principal — classifyFontFamily (código)" },
  hero_com_texto: { cls: "sistema", rotulo: "Hero com texto embutido — derivado do documento (código)" },
  font_whitelist: { cls: "biblioteca", rotulo: "Fontes de display curadas — font-whitelist.ts" },
  inventario: { cls: "sistema", rotulo: "Inventário tipográfico do documento — extractTypographyInventory" },
  inventario_total: { cls: "sistema", rotulo: "Total de declarações de fonte — código" },
  email_name: EMAIL_ROW,
  subject: EMAIL_ROW,
}

export const COLOR_FORMAT_VAR_ORIGINS: Record<string, SegmentOrigin> = {
  ...IDENTITY_ORIGINS,
  niche: LOJA_STORE,
  tones: { cls: "sistema", rotulo: "Tons derivados do tom de voz — deriveToneKeys" },
  color_inventory_json: { cls: "sistema", rotulo: "Inventário de cores do documento — extractColorInventory" },
  brand_colors: LOJA_BRAND,
  pesquisa_full_text: { cls: "loja", rotulo: "Pesquisa & Diagnóstico — client_stores" },
  email_name: EMAIL_ROW,
  subject: EMAIL_ROW,
}

/**
 * A seção `<design_system>` do prompt do hero, pronta — ou string vazia.
 * Pura: o teste compara o render do template novo com o do antigo
 * (`{{#if}}`) nos DOIS casos, byte a byte.
 */
export function heroDesignSystemBlock(designSystem: string | null | undefined): string {
  const ds = (designSystem ?? "").trim()
  if (!ds) return ""
  return `<design_system>\n${ds}\n</design_system>\n\n`
}

export function buildHeroVars(
  ctx: FormatChainContext,
  params: {
    regionHtml: string
    variant: HeroVariantData | null
    /**
     * A região já É a variante da biblioteca (enxertada por código antes da
     * cadeia). Nesse caso mandar `hero_variant_html` de novo é duplicar o
     * mesmo HTML no prompt — e o `rendered_html` das variantes é mockup de
     * imagem, sem valor estrutural. Ambos saem; o prompt trata a região
     * recebida como verdade estrutural.
     */
    grafted?: boolean
    /**
     * Campos da região que o merge por example NÃO escreveu (sem lugar,
     * ambíguo, copy ausente) — a ÚNICA base legítima para o agente remover
     * uma linha. Vazio = nada pode ser removido.
     */
    heroPending?: Array<{ key: string; motivo: string; tem_valor: boolean }>
  },
): Record<string, string> {
  const heroBlocks = blocksInsideHeroRegion(ctx, params.regionHtml)
  const heroImage = ctx.imageMap.find((e) => e.block_type === "hero")
  const vars = {
    ...identityVars(ctx),
    logo_light: ctx.logoLight,
    logo_dark: ctx.logoDark,
    email_name: ctx.emailRow?.name || "",
    subject: ctx.emailRow?.subject || "",
    // O agente NUNCA recebe o documento inteiro: o splice é por código e a
    // região vai separada em hero_region_html. O `montador_html` existia só
    // para o fallback full_doc, removido no CM-5 (a região é sempre
    // localizável desde a montagem por código).
    hero_region_html: params.regionHtml,
    hero_variant_html: params.grafted ? "" : (params.variant?.html ?? ""),
    // O exemplo renderizado vai SEMPRE que existir, inclusive no modo
    // `library` e inclusive quando é print ou está desatualizado (decisão de
    // 30/jul). Ele é o espelho de ACABAMENTO; a estrutura o agente tira do
    // `html` da variante ou da região enxertada. Classificação e hash viram
    // ressalva na telemetria, não bloqueio.
    hero_variant_rendered_html:
      (params.variant ? resolveRenderedReference(params.variant).html : null) ??
      "",
    hero_source: params.grafted ? "library" : "montador",
    hero_variant_schema_json: params.variant?.output_schema
      ? JSON.stringify(params.variant.output_schema, null, 2)
      : "",
    // Regras de design da variante (cadastro). Vão SEMPRE que existirem —
    // diferente do exemplo renderizado, aqui é texto escrito para ser lido
    // por um modelo, sem ambiguidade de formato.
    hero_variant_design_system: (params.variant?.design_system ?? "").trim(),
    // A SEÇÃO pronta (tag + conteúdo + as duas quebras) ou vazia. Substitui
    // o `{{#if}}` que abria o template do hero: o texto final é o mesmo, e o
    // prompt passa a ser cortável por origem. A var crua acima continua
    // servindo configs customizadas que ainda usam o condicional.
    hero_design_system_block: heroDesignSystemBlock(params.variant?.design_system),
    // ARRAY: todos os blocos da região (hero composta = cupom+logo+hero).
    hero_content_json:
      heroBlocks.length > 0 ? JSON.stringify(heroBlocks, null, 2) : "[]",
    // Campos que o merge por example deixou pendentes na região — decide o
    // que o agente PODE remover (lista vazia = remover nada).
    hero_pending_json: JSON.stringify(params.heroPending ?? [], null, 2),
    hero_image_url: heroImage?.url ?? "",
    hero_image_alt: "",
    // Preenchida pelo chain com o contrato de output — presente aqui só
    // para satisfazer o validador de vars.
    output_contract: "",
  }
  return validateVars(HeroPromptVarsSchema, vars, "hero_section")
}

export function buildTextFormatVars(
  ctx: FormatChainContext,
  html: string,
): Record<string, string> {
  // Só blocos com trabalho REAL neste documento: bloco cujas tags do
  // blueprint não existem mais no HTML já foi preenchido pelo agente Hero
  // (região composta) — mandá-lo de novo convida o modelo a duplicar a
  // copy em outro lugar. Bloco sem tags no blueprint (legado) passa.
  const docTags = tagsIn(html)
  const stillOpen = (b: BlockWithContent): boolean => {
    const tags = blueprintTagsOf(ctx, b.position)
    if (tags.length === 0) return true
    return tags.some((t) => docTags.has(t))
  }
  const nonHeroBlocks = ctx.blocksWithContent.filter(
    (b) => b.type !== "hero" && stillOpen(b),
  )
  const openPositions = new Set(nonHeroBlocks.map((b) => b.position))
  const fields = Array.isArray(ctx.blueprint?.blocks)
    ? ctx.blueprint.blocks
        .map((b, i) => ({
          position: i + 1,
          type: b.type,
          variant_name: b.variant_name ?? null,
          fields: b.fields ?? [],
        }))
        .filter((b) => b.type !== "hero" && openPositions.has(b.position))
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
  // Arquitetura por views (F4): o maior prompt da cadeia (doc inteiro)
  // vira uma lista de ~10-30 cores com contextos — o agente decide QUAIS
  // valores trocar por quais papéis da paleta; o código aplica o recolor
  // global no documento que o agente nunca viu.
  // Com os pares texto↔fundo anotados: sem eles o agente via `#FFFFFF`
  // como uma linha só e não tinha como saber que estava trocando o fundo
  // debaixo de um texto branco (incidente Luxe Lift, 22/08).
  const inventory = annotateInventoryPairs(html, extractColorInventory(html))
  const vars = {
    brand_name: ctx.brandName,
    niche: extras.niche,
    locale: ctx.locale,
    tones: extras.tones,
    color_inventory_json: JSON.stringify(inventory, null, 2),
    brand_colors: serializeBrandColors(extras.brand),
    // Papéis resolvidos via `identityVars` — o MESMO helper da hero, e não
    // uma segunda lista escrita à mão.
    //
    // A lista manual que estava aqui trazia seis dos oito papéis: faltavam
    // `color_surface` e `color_surface_strong`. O prompt chegava com
    // <surface></surface> vazio, e como ele manda painel ir para esses dois
    // papéis e proíbe cor fora de <color_roles>, o agente ficava sem destino
    // legal para QUALQUER painel — os cinzas da biblioteca (600px, 598px,
    // 351px de largura) passavam intactos e o email saía metade na cor do
    // template. Medido: brand_share entre 0,27 e 0,53 em 15 gerações
    // seguidas, enquanto a hero — que usa este helper — saía certa.
    ...identityVars(ctx),
    pesquisa_full_text: extras.pesquisaFullText,
    email_name: ctx.emailRow?.name || "",
    subject: ctx.emailRow?.subject || "",
  }
  return validateVars(ColorFormatPromptVarsSchema, vars, "color_format")
}


// ── TIPÓGRAFO ──────────────────────────────────────────────────────────

/**
 * Classe da fonte pelo NOME — é o que temos: a identidade visual guarda o
 * nome da família, não a classificação tipográfica. A classe decide o par
 * que sobrevive ao substituto (sans+sans desaparece para quem não carrega a
 * webfont), então errar aqui só torna o guard mais conservador.
 */


/**
 * Vars do tipógrafo. O documento NÃO entra: entra o inventário das
 * declarações de fonte, uma linha por item (`typography/inventory.ts`).
 */
export function buildTypographyVars(
  ctx: FormatChainContext,
  html: string,
  extras: {
    niche: string
    tomDeVoz: string
    posicionamento: string
    /** A hero traz texto embutido na imagem? Um grau a menos de ruptura. */
    heroComTexto: boolean
    fontWhitelist: string
    inventario: string
    inventarioTotal: number
  },
): Record<string, string> {
  void html
  const vars = {
    brand_name: ctx.brandName,
    locale: ctx.locale,
    font_heading: ctx.fontHeading,
    font_heading_weight: ctx.fontHeadingWeight,
    font_body: ctx.fontBody,
    font_body_weight: ctx.fontBodyWeight,
    classe_principal: classifyFontFamily(ctx.fontHeading),
    tom_de_voz: extras.tomDeVoz,
    posicionamento: extras.posicionamento,
    niche: extras.niche,
    hero_com_texto: extras.heroComTexto ? "sim" : "não",
    font_whitelist: extras.fontWhitelist,
    inventario: extras.inventario,
    inventario_total: String(extras.inventarioTotal),
    email_name: ctx.emailRow?.name || "",
    subject: ctx.emailRow?.subject || "",
  }
  return validateVars(TypographyPromptVarsSchema, vars, "typography")
}
