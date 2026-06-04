/**
 * Builder de variaveis para o HTML Agent v2 (Master Prompt).
 *
 * Separado de `buildAllVars` (multi-agent legacy) pra nao regredir copy
 * e isolar a logica especifica do HTML: color roles, logo SVG inline,
 * objective/messaging do blueprint, image_map_json com {id, url,
 * aspect_ratio, overlay}, blocks_with_content_json com `purpose`.
 *
 * Contrato (14 vars):
 *   brand_name, locale
 *   color_bg, color_text, color_heading, color_button_bg,
 *     color_button_text, color_accent
 *   font_heading, font_body
 *   logo_svg, logo_width
 *   email_name, subject, preheader
 *   objective, messaging
 *   reference_html
 *   image_map_json, top_products_json, blocks_with_content_json
 *
 * Erros recuperaveis (logo fetch 404, blueprint sem hint) caem em
 * fallback gracioso. Erros nao-recuperaveis (sem email_blocks) propagam.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"
import type {
  BlueprintBlock,
  EmailBlueprint,
} from "@/types/email-generation"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"

import { deriveColorRoles } from "./color-roles"

const log = logger.child("HtmlBuildVars")

const DEFAULT_LOCALE = "pt-BR"
const DEFAULT_LOGO_WIDTH = 120
const DEFAULT_FONT_HEADING = "Inter"
const DEFAULT_FONT_BODY = "Inter"

export interface HtmlPromptVarsInput {
  emailId: string
  brand: StoreBrandIdentity | null
  briefing: StoreBriefing | null
  blueprint: EmailBlueprint | null
  topProducts: TopProduct[]
  storeRaw: Record<string, unknown>
  flowType: string | null
  emailNumber: number | null
  admin: SupabaseClient
}

interface EmailBlockRow {
  id: string
  position: number
  block_type: string
  label: string
  content: Record<string, unknown> | null
}

interface ImageMapEntry {
  id: string
  url: string
  aspect_ratio: string
  overlay: "needs_html_overlay" | "burned"
}

interface BlockWithContent {
  position: number
  type: string
  label: string
  content: Record<string, unknown>
  purpose: string
}

/**
 * Fetch e inline do SVG markup a partir da URL do Supabase Storage.
 * Falha graciosamente: retorna string vazia em qualquer erro (404,
 * timeout, conteudo nao-SVG). O template trata logo_svg vazio mantendo
 * o slot sem logo (mock continua renderizavel).
 */
async function fetchLogoSvgInline(url: string | null | undefined): Promise<string> {
  if (!url) return ""
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) {
      log.warn("logo_svg.fetch_non_ok", { url, status: res.status })
      return ""
    }
    const text = await res.text()
    const trimmed = text.trim()
    if (!trimmed.toLowerCase().startsWith("<svg")) {
      log.warn("logo_svg.fetch_not_svg", { url, head: trimmed.slice(0, 40) })
      return ""
    }
    return trimmed
  } catch (err) {
    log.warn("logo_svg.fetch_error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    })
    return ""
  }
}

function purposeOf(
  blueprint: EmailBlueprint | null,
  position: number,
  fallbackLabel: string,
): string {
  if (!blueprint) return fallbackLabel
  const idx = position - 1
  const bp: BlueprintBlock | undefined = blueprint.blocks?.[idx]
  return bp?.hint?.trim() || fallbackLabel
}

function buildImageMap(
  blocks: EmailBlockRow[],
  blueprint: EmailBlueprint | null,
): ImageMapEntry[] {
  const aspect = blueprint?.image_aspect ?? "4:5"
  const overlay: "needs_html_overlay" | "burned" =
    blueprint?.image_overlay_reserve_bottom ? "needs_html_overlay" : "burned"

  const entries: ImageMapEntry[] = []
  for (const blk of blocks) {
    const content = blk.content ?? {}
    const url = (content.image_url as string | undefined)?.trim()
    if (!url) continue
    entries.push({
      id: `IMG_${blk.position}`,
      url,
      aspect_ratio: aspect,
      overlay,
    })
  }
  return entries
}

function buildBlocksWithContent(
  blocks: EmailBlockRow[],
  blueprint: EmailBlueprint | null,
): BlockWithContent[] {
  return blocks.map((blk) => ({
    position: blk.position,
    type: blk.block_type,
    label: blk.label,
    content: blk.content ?? {},
    purpose: purposeOf(blueprint, blk.position, blk.label),
  }))
}

function buildTopProductsJson(products: TopProduct[]): string {
  if (products.length === 0) return "[]"
  const slim = products.slice(0, 5).map((p) => ({
    id: p.id ?? "",
    name: p.name,
    price: p.price,
    image_url: p.image_url,
    url: p.url ?? "",
  }))
  return JSON.stringify(slim, null, 2)
}

export async function buildHtmlPromptVars(
  input: HtmlPromptVarsInput,
): Promise<Record<string, string>> {
  const {
    emailId,
    brand,
    blueprint,
    topProducts,
    storeRaw,
    flowType,
    emailNumber,
    admin,
  } = input

  // ── Queries paralelas: email row + blocks + reference template ────
  const [emailRes, blocksRes, refRes] = await Promise.all([
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
    flowType && emailNumber != null
      ? admin
          .from("email_reference_templates")
          .select("html")
          .eq("flow_type", flowType)
          .eq("email_number", emailNumber)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const emailRow = emailRes.data as
    | { name: string; subject: string; preheader: string }
    | null
  const blocks = (blocksRes.data as EmailBlockRow[] | null) ?? []
  const referenceHtml =
    ((refRes as { data: { html?: string | null } | null }).data?.html as
      | string
      | null) ?? ""

  // ── Color roles ────────────────────────────────────────────────────
  const roles = deriveColorRoles(
    brand?.colors_primary ?? [],
    brand?.colors_secondary ?? [],
  )

  // ── Logo SVG inline ────────────────────────────────────────────────
  const logoSvg = await fetchLogoSvgInline(brand?.logo_main_svg ?? null)

  // ── Locale ─────────────────────────────────────────────────────────
  const locale = (storeRaw?.language as string | undefined) || DEFAULT_LOCALE

  // ── Brand name ─────────────────────────────────────────────────────
  const brandName = (storeRaw?.store_name as string | undefined) || "Loja"

  // ── Build vars ─────────────────────────────────────────────────────
  const vars: Record<string, string> = {
    brand_name: brandName,
    locale,
    color_bg: roles.bg,
    color_text: roles.text,
    color_heading: roles.heading,
    color_button_bg: roles.button_bg,
    color_button_text: roles.button_text,
    color_accent: roles.accent,
    font_heading: brand?.font_heading || DEFAULT_FONT_HEADING,
    font_body: brand?.font_body || DEFAULT_FONT_BODY,
    logo_svg: logoSvg,
    logo_width: String(DEFAULT_LOGO_WIDTH),
    email_name: emailRow?.name || "",
    subject: emailRow?.subject || "",
    preheader: emailRow?.preheader || "",
    objective: blueprint?.objective || "",
    messaging: blueprint?.messaging || "",
    reference_html: referenceHtml,
    image_map_json: JSON.stringify(buildImageMap(blocks, blueprint), null, 2),
    top_products_json: buildTopProductsJson(topProducts),
    blocks_with_content_json: JSON.stringify(
      buildBlocksWithContent(blocks, blueprint),
      null,
      2,
    ),
  }

  return vars
}
