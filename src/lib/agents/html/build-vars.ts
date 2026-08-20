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
import { isAspectKey } from "../image/aspect-ratio"
import { precheckBrandReady, resolveBrandTokens } from "./brand-guards"
import { DEFAULT_REFERENCE_SKELETON } from "./default-reference"
import { deriveColorRoles } from "./color-roles"
import { HtmlPromptVarsSchema } from "./contract"
import { pickBrandLogo, type LogoVariant } from "@/lib/brand/pick-logo"

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

export interface EmailBlockRow {
  id: string
  position: number
  block_type: string
  label: string
  content: Record<string, unknown> | null
  /**
   * Snapshot do contrato de copy do bloco (`email_blocks.fields`, migration
   * 20261065). Opcional porque nem todo consumidor precisa carregá-lo —
   * quem monta o contrato para os formatadores (MC-3) precisa.
   */
  fields?: unknown
}

export interface ImageMapEntry {
  id: string
  url: string
  /**
   * Tag canônica do slot no reference ({{HERO_IMAGE}}, {{REVIEW_1_IMAGE}}...).
   * É a chave de casamento slot↔imagem no prompt do HTML agent. null quando o
   * blueprint não expõe a tag (rows pré-contrato).
   */
  tag: string | null
  block_type: string
  aspect_ratio: string
  /** Largura de RENDER sugerida no HTML (attribute width do <img>). */
  render_width_px: number
  overlay: "needs_html_overlay" | "burned"
}

export interface BlockWithContent {
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

// Bucket e TTL da signed URL do logo. 365d espelha image.chain.ts (imagens
// de produto): o arquivo do logo e' permanente no Storage; so' a URL
// armazenada (7d) expira, entao renovamos pra 1 ano na hora de montar o HTML.
const LOGO_BUCKET = "onboarding-visual-assets"
const LOGO_SIGNED_URL_TTL = 365 * 24 * 60 * 60

/**
 * Largura de render da logo no email. O que está cadastrado é o asset de
 * ORIGEM (arquivo grande), não uma versão para email — sem limite explícito
 * o `<img>` ocupa a largura da célula, que na coluna de 600px significa uma
 * logo de 600px. 180px é a faixa usual de logo em cabeçalho de email.
 */
const LOGO_EMAIL_WIDTH_PX = 180

/**
 * Extrai o path interno do Storage de uma signed URL do Supabase.
 * Formato: .../object/sign/{bucket}/{path}?token=... → retorna {path}.
 * null se a URL nao for uma signed URL do nosso bucket.
 */
function extractStoragePath(signedUrl: string): string | null {
  const marker = `/object/sign/${LOGO_BUCKET}/`
  const i = signedUrl.indexOf(marker)
  if (i === -1) return null
  const rest = signedUrl.slice(i + marker.length).split("?")[0]
  if (!rest) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

/**
 * Logo PNG como `<img src="url">` — referencia por LINK, nao base64 inline.
 *
 * O output do HTML e' um mock pro Figma (renderizado em browser), entao URL
 * funciona; embutir o PNG como base64 inflava o prompt em ~330k tokens (um
 * PNG de 1MB = ~$5/geracao). O arquivo e' permanente no Storage; so' a signed
 * URL armazenada (7d) expira, entao renovamos pra 365d na hora (mesmo TTL das
 * imagens de produto). Sem download do arquivo. Fallback defensivo: se o path
 * nao for extraivel ou o createSignedUrl falhar, usa a URL armazenada direto.
 */
async function pngImgTagFromUrl(
  storedUrl: string,
  admin: SupabaseClient,
): Promise<string> {
  let src = storedUrl
  const path = extractStoragePath(storedUrl)
  if (path) {
    try {
      const { data } = await admin.storage
        .from(LOGO_BUCKET)
        .createSignedUrl(path, LOGO_SIGNED_URL_TTL)
      if (data?.signedUrl) src = data.signedUrl
    } catch (err) {
      log.warn("logo_png.signed_url_failed", {
        path,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  // Largura MÁXIMA obrigatória. Sem ela o `<img>` herda a largura da célula
  // e a logo sai com 600px — foi o que aconteceu no email da Luxe Lift, com
  // o wordmark ocupando a coluna inteira. O arquivo cadastrado costuma ser
  // grande (é o asset de origem, não uma versão para email), então a única
  // defesa é limitar aqui. 180px é a faixa usual de logo em cabeçalho de
  // email; `width` em atributo cobre o Outlook, que ignora `max-width`.
  return `<img src="${src}" alt="" width="${LOGO_EMAIL_WIDTH_PX}" style="display:block;width:100%;max-width:${LOGO_EMAIL_WIDTH_PX}px;height:auto;" />`
}

/**
 * Decide o formato do markup do logo: SVG inline se disponivel, `<img src>`
 * (URL renovada pra 365d) se so PNG, string vazia se nenhum. A var `logo_svg`
 * no contract aceita qualquer markup HTML.
 *
 * Fallback multi-variante via pickBrandLogo (prefer "svg" pra manter o path
 * inline nitido): varre main→alt→monogram→reverse. Nao-regressao: uma marca
 * com logo_main_svg/png resolve pra variante "main" (1a da cadeia) e segue o
 * mesmo caminho de antes. So ADICIONA cobertura pras demais variantes.
 */
export async function fetchLogoMarkup(
  brand: StoreBrandIdentity | null,
  admin: SupabaseClient,
): Promise<string> {
  if (!brand) return ""
  const picked = pickBrandLogo(brand, "svg")
  if (!picked) return ""

  if (picked.format === "svg") {
    const svg = await fetchLogoSvgInline(picked.url)
    if (svg) return svg
    // T3.2: SVG falhou (404/timeout/nao-SVG) -> nao desistir do logo: cai pro
    // PNG DA MESMA VARIANTE se houver. Antes retornava "" e o email saia sem
    // marca.
    const siblingPng = brand[`logo_${picked.variant satisfies LogoVariant}_png`]
    if (siblingPng) {
      log.warn("logo_svg.fallback_to_png", { variant: picked.variant })
      return await pngImgTagFromUrl(siblingPng, admin)
    }
    return ""
  }
  // format === "png": nao havia SVG nessa variante (nem na cadeia antes dela).
  return await pngImgTagFromUrl(picked.url, admin)
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

/**
 * Largura de render do <img> no email (600px de coluna útil): thumbs e
 * ícones 1:1 de features são pequenos; o resto ocupa a coluna inteira.
 */
function renderWidthFor(tag: string | null, blockType: string): number {
  if (tag && /THUMB/.test(tag)) return 120
  if (blockType === "features") return 120
  return 600
}

export function buildImageMap(
  blocks: EmailBlockRow[],
  blueprint: EmailBlueprint | null,
): ImageMapEntry[] {
  const globalAspect = blueprint?.image_aspect ?? "4:5"
  // Hero v5 (jul/2026): a imagem do hero é um <img> full-width de altura
  // natural (NUNCA background-image/overlay/cover) e o texto é HTML separado.
  // Logo o hero é "burned" (imagem colocada como-está, sem texto sobreposto),
  // igual a products/reviews/body. O flag image_overlay_reserve_bottom não
  // tem mais efeito no hero.
  const heroOverlay: "needs_html_overlay" | "burned" = "burned"

  // Casa email_block (position 1-based) com blueprint.blocks[position-1],
  // guardado por type + fallback pro próprio índice (rows legadas 0-based) —
  // mesma convenção do dispatch de copy e do aspect por bloco.
  const bpBlocks = blueprint?.blocks
  const bpFor = (position: number, type: string): BlueprintBlock | null => {
    if (!Array.isArray(bpBlocks)) return null
    const byIndex = (i: number) => {
      const cand = bpBlocks[i]
      return cand && cand.type === type ? cand : null
    }
    return byIndex(position - 1) ?? byIndex(position)
  }

  const entries: ImageMapEntry[] = []
  for (const blk of blocks) {
    const content = blk.content ?? {}
    const bp = bpFor(blk.position, blk.block_type)
    const imageTag =
      // Forma da tag de imagem legada ({{X_IMAGE}}/{{X_THUMB_2}}) — o
      // registry morreu; blueprints novos nem carregam tags.
      bp?.tags?.find(
        (t) => /(?:IMAGE|THUMB)(?:_\d+)?$/.test(t) && !t.endsWith("_ALT"),
      ) ?? null

    const url = (content.image_url as string | undefined)?.trim()
    if (url) {
      // Aspecto POR BLOCO (tags do template via registry) vence o global —
      // o achatamento pro nível-email mandava toda imagem como 4:5.
      const blockAspect =
        bp?.image_aspect && isAspectKey(bp.image_aspect) ? bp.image_aspect : null
      entries.push({
        id: `IMG_${blk.position}`,
        url,
        tag: imageTag,
        block_type: blk.block_type,
        aspect_ratio: blockAspect ?? globalAspect,
        render_width_px: renderWidthFor(imageTag, blk.block_type),
        overlay: blk.block_type === "hero" ? heroOverlay : "burned",
      })
    }

    // Avatares de testimonial: o phase2-runner grava em items[].avatar_url
    // (1 avatar POR depoimento), não em content.image_url — sem esta leitura
    // as imagens eram geradas (e pagas) mas nunca chegavam ao HTML agent.
    const items = Array.isArray(content.items)
      ? (content.items as Array<Record<string, unknown>>)
      : []
    items.forEach((item, idx) => {
      const avatarUrl =
        typeof item?.avatar_url === "string" ? item.avatar_url.trim() : ""
      if (!avatarUrl) return
      entries.push({
        id: `IMG_${blk.position}_AVATAR_${idx + 1}`,
        url: avatarUrl,
        tag: `REVIEW_${idx + 1}_IMAGE`,
        block_type: blk.block_type,
        aspect_ratio: "1:1",
        render_width_px: 96,
        overlay: "burned",
      })
    })
  }
  return entries
}

export function buildBlocksWithContent(
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

export function buildTopProductsJson(products: TopProduct[]): string {
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

  // Observabilidade: apenas LOGA campos de brand faltantes — NAO bloqueia.
  // A geração segue com os dados que a loja tem; o resto degrada pra defaults
  // (cores via deriveColorRoles, logo via fetchLogoMarkup, fontes via DEFAULT_*).
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
  // Reference por loja (assembler) vence; fallback no template global;
  // último recurso é o esqueleto default embutido. Reference VAZIA nunca
  // chega ao agente: o system prompt é um "Repainter" e, sem estrutura
  // pra repintar, o modelo improvisa o layout inteiro — emails
  // inconsistentes/mal formatados (batch Radiantlyhers, jul/2026).
  const storeRefHtml =
    ((storeRefRes as { data: { html?: string | null } | null }).data
      ?.html as string | null) ?? null
  const referenceHtml =
    storeRefHtml || globalRefHtml || DEFAULT_REFERENCE_SKELETON

  // T3.1: sinaliza a FONTE do reference. Sem o reference do Montador
  // (store_email_references), o HTML agent nao tem estrutura por-loja pra
  // substituir e acaba REGENERANDO do zero (perde o "repaint"). Logar a fonte
  // deixa visivel quando o Montador nao persistiu pra essa loja/email.
  const referenceSource = storeRefHtml
    ? "assembler"
    : globalRefHtml
      ? "global"
      : "default_skeleton"
  if (referenceSource !== "assembler") {
    log.warn("html.reference_not_from_assembler", {
      emailId,
      flowType,
      emailNumber,
      source: referenceSource,
    })
  }

  // ── Color roles ────────────────────────────────────────────────────
  const roles = deriveColorRoles(
    brand?.colors_primary ?? [],
    brand?.colors_secondary ?? [],
  )

  // ── Logo markup (SVG inline OU PNG como <img src> renovado 365d) ───
  const logoSvg = await fetchLogoMarkup(brand, admin)

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
