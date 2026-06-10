/**
 * Builder de variaveis para o HTML Agent v2 (Master Prompt).
 *
 * Separado de `buildAllVars` (multi-agent legacy) pra nao regredir copy
 * e isolar a logica especifica do HTML: color roles, logo SVG inline,
 * objective/messaging do blueprint, image_map_json com {id, url,
 * aspect_ratio, overlay}, blocks_with_content_json com `purpose`.
 *
 * Contrato (21 vars). Manter em sincronia com `PLACEHOLDERS_BY_AGENT.html`
 * em src/components/agents/prompt-editor.tsx:
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

import { languageLabelToCode } from "@/lib/i18n/store-language"
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

import { loadGlobalReferenceTemplate } from "../reference-template"
import { precheckBrandReady, resolveBrandTokens } from "./brand-guards"
import { deriveColorRoles } from "./color-roles"
import { HtmlPromptVarsSchema } from "./contract"

// Re-export pra que phase2-runner possa fazer instanceof sem importar
// brand-guards diretamente — preserva o ponto unico de entrada do agente.
export { BrandIncompleteError } from "./brand-guards"

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
  /**
   * Quando true (TestTab), o precheck so falha se brand=null. Cores e
   * logo faltando degradam pra defaults em vez de bloquear a geracao.
   */
  relaxedBrandCheck?: boolean
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

type LogoFetchReason = "missing_url" | "non_ok" | "not_svg" | "timeout" | "network"

/**
 * Fetch e inline do SVG markup a partir da URL do Supabase Storage.
 * Falha graciosamente: retorna string vazia em qualquer erro. Log
 * categoriza o motivo (`reason`) pra facilitar debug em prod — sem
 * isso, "logo_svg vazio" e' indistinguivel de "brand sem logo" vs
 * "URL invalida" vs "storage cold start timeout".
 *
 * Timeout 10s: 5s era apertado pra Supabase Storage cold start.
 */
async function fetchLogoSvgInline(url: string | null | undefined): Promise<string> {
  if (!url) {
    log.debug("logo_svg.skipped", { reason: "missing_url" satisfies LogoFetchReason })
    return ""
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      log.warn("logo_svg.fetch_failed", {
        url,
        reason: "non_ok" satisfies LogoFetchReason,
        status: res.status,
      })
      return ""
    }
    const text = await res.text()
    const trimmed = text.trim()
    if (!trimmed.toLowerCase().startsWith("<svg")) {
      log.warn("logo_svg.fetch_failed", {
        url,
        reason: "not_svg" satisfies LogoFetchReason,
        contentTypeHead: res.headers.get("content-type") ?? null,
        head: trimmed.slice(0, 40),
      })
      return ""
    }
    return trimmed
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError"
    log.warn("logo_svg.fetch_failed", {
      url,
      reason: (isAbort ? "timeout" : "network") satisfies LogoFetchReason,
      error: err instanceof Error ? err.message : String(err),
    })
    return ""
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch do PNG e conversao pra data URI inline (base64). Usado quando
 * a loja so subiu logo PNG (sem SVG). Inline base64 funciona em todos
 * os clients modernos (Gmail, Outlook, Apple Mail) e elimina dependencia
 * de URL remota — image hotlinking e bloqueado por padrao em muitos
 * clients de email.
 *
 * Warning em logs se PNG > 80KB: Gmail clipa mensagens em ~102KB total,
 * e base64 cresce ~33%. Logo > 80KB pode comer espaco do resto do email.
 */
async function fetchPngAsDataUriImg(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      log.warn("logo_png.fetch_failed", { url, status: res.status })
      return ""
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 80 * 1024) {
      log.warn("logo_png.too_large_for_gmail", { url, bytes: buf.length })
    }
    const b64 = buf.toString("base64")
    return `<img src="data:image/png;base64,${b64}" alt="" style="display:block;max-width:100%;height:auto;" />`
  } catch (err) {
    log.warn("logo_png.fetch_failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    })
    return ""
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Decide o formato do markup do logo: SVG inline se disponivel,
 * <img> com data URI base64 se so PNG, string vazia se nenhum.
 * A var `logo_svg` no contract aceita qualquer markup HTML.
 */
async function fetchLogoMarkup(
  brand: StoreBrandIdentity | null,
): Promise<string> {
  if (!brand) return ""
  if (brand.logo_main_svg) {
    return await fetchLogoSvgInline(brand.logo_main_svg)
  }
  if (brand.logo_main_png) {
    return await fetchPngAsDataUriImg(brand.logo_main_png)
  }
  return ""
}

function purposeOf(
  blueprint: EmailBlueprint | null,
  position: number,
  fallbackLabel: string,
): string {
  if (!blueprint) return fallbackLabel
  const idx = position - 1
  const bp: BlueprintBlock | undefined = blueprint.blocks?.[idx]
  return bp?.purpose?.trim() || fallbackLabel
}

function buildImageMap(
  blocks: EmailBlockRow[],
  blueprint: EmailBlueprint | null,
): ImageMapEntry[] {
  const aspect = blueprint?.image_aspect ?? "4:5"
  // NULL/undefined cai em "needs_html_overlay" (default conservador):
  // text overlay funciona sobre qualquer imagem, mas "burned" sobre
  // uma imagem que precisa de overlay perde a copy. Blueprints legacy
  // sem o campo (criados antes de 20260623) sao tratados como "precisa
  // de overlay" ate o backfill rodar.
  const overlay: "needs_html_overlay" | "burned" =
    blueprint?.image_overlay_reserve_bottom === false ? "burned" : "needs_html_overlay"

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
  brandName: string,
): BlockWithContent[] {
  return blocks.map((blk) => ({
    position: blk.position,
    type: blk.block_type,
    label: blk.label,
    // Defesa em camadas — webhook /api/webhooks/n8n/email-copy ja sanitiza
    // antes de gravar, mas emails gerados antes do fix podem ter
    // `{{BRAND_NAME}}` literal no DB. resolveBrandTokens e' no-op se nao
    // encontrar nenhum token.
    content: resolveBrandTokens(blk.content ?? {}, brandName) as Record<string, unknown>,
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
    relaxedBrandCheck,
  } = input

  // Pre-check: brand identity precisa estar completa antes de gastar
  // tokens no LLM. Lanca BrandIncompleteError com lista de campos
  // faltantes — phase2-runner trata como `failure_reason='brand_incomplete'`.
  // Em modo relaxed (TestTab) so falha se brand=null.
  const storeId = (storeRaw?.id as string | undefined) ?? null
  precheckBrandReady(brand, storeId, { relaxed: relaxedBrandCheck })

  // ── Queries paralelas: email row + blocks + reference ─────────────
  // O reference montado por loja (store_email_references, Component
  // Assembler) tem precedência sobre o template global curado.
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
          .select("html")
          .eq("store_id", storeId)
          .eq("flow_type", flowType)
          .eq("email_number", emailNumber)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Template global curado (fallback). Mesma fonte que o Montador recebe
    // como inspiração — ver lib/agents/reference-template.ts.
    loadGlobalReferenceTemplate(admin, flowType, emailNumber),
  ])

  const emailRow = emailRes.data as
    | { name: string; subject: string; preheader: string }
    | null
  const blocks = (blocksRes.data as EmailBlockRow[] | null) ?? []
  // Reference por loja (assembler) vence; fallback no template global.
  const storeRefHtml =
    ((storeRefRes as { data: { html?: string | null } | null }).data
      ?.html as string | null) ?? null
  const referenceHtml = storeRefHtml || globalRefHtml || ""

  // ── Color roles ────────────────────────────────────────────────────
  const roles = deriveColorRoles(
    brand?.colors_primary ?? [],
    brand?.colors_secondary ?? [],
  )

  // ── Logo markup (SVG inline OU PNG como data URI img) ──────────────
  const logoSvg = await fetchLogoMarkup(brand)

  // ── Locale ─────────────────────────────────────────────────────────
  // Normaliza via languageLabelToCode (aceita "Portugues" -> "pt-BR",
  // "Espanhol" -> "es-ES", etc) e cai pra valor cru se ja for codigo
  // ISO bem-formado. Sem normalizar, valores como "Portugues" no DB
  // vazariam pro prompt como labels nao-padrao.
  const rawLanguage = storeRaw?.language as string | undefined
  const normalizedCode = languageLabelToCode(rawLanguage)
  const looksLikeIsoCode =
    typeof rawLanguage === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLanguage)
  const locale =
    normalizedCode ?? (looksLikeIsoCode ? rawLanguage : DEFAULT_LOCALE)

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
      buildBlocksWithContent(blocks, blueprint, brandName),
      null,
      2,
    ),
  }

  // Validacao runtime do contrato. Throw em dev/test forca o autor a
  // alinhar a forma do output com o schema. Em prod, log warn sem
  // throw — corretude do shape ja foi enforcada antes do deploy.
  if (process.env.NODE_ENV !== "production") {
    HtmlPromptVarsSchema.parse(vars)
  } else {
    const result = HtmlPromptVarsSchema.safeParse(vars)
    if (!result.success) {
      log.warn("contract.drift", {
        emailId,
        issues: result.error.issues.slice(0, 5),
      })
    }
  }

  return vars
}
