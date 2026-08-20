/**
 * hero-locator — localização determinística da região da HERO no documento
 * do Montador + splice do fragmento gerado pelo agente hero_section.
 *
 * Cascata de modos (split do agente HTML, migration 20261039):
 *   1. "marker" — o Montador (prompt novo) envolve cada bloco com
 *      <!-- cfy:block:{i}:{section}:start/end -->; a região da hero é o par
 *      cuja section normalizada é "hero". SYNC: o mesmo formato vive em
 *      BLOCK_MARKER_PATTERN (component-assembler.service.ts).
 *   2. "tag" — referências legadas sem marcador: acha os offsets das tags
 *      canônicas de seção HERO (tag-registry), testa candidatos de `<table`
 *      entre o bloco anterior e a primeira tag da hero, expande por siblings
 *      balanceados até cobrir todas as tags HERO, e valida (nenhuma tag de
 *      outra seção dentro, tabelas balanceadas, não invade o próximo bloco).
 *   3. null — não localizável: o step FALHA (`hero_region_not_found`). O
 *      modo full-doc, em que o agente devolvia o documento inteiro, foi
 *      removido no CM-5: com a montagem por código os marcadores são sempre
 *      válidos, então região ausente virou sinal de bug — e autorizar a
 *      reescrita do email todo era a maior superfície de risco da cadeia.
 *
 * No splice o código injeta as sentinelas <!-- cfy:hero:start/end --> — a
 * partir daí os agentes seguintes têm uma região determinística pra
 * preservar, e o guard consegue re-splicar se o modelo mexer nela.
 *
 * Puro (zero deps de server) — testável.
 */


// SYNC: mesmo formato de BLOCK_MARKER_PATTERN em component-assembler.service.ts.
const CFY_BLOCK_MARKER =
  /<!--\s*cfy:block:(\d+):([A-Za-z0-9_-]+):(start|end)\s*-->/g

export const HERO_SENTINEL_START = "<!-- cfy:hero:start -->"
export const HERO_SENTINEL_END = "<!-- cfy:hero:end -->"

// Mesmo formato de placeholder do reference-structure ({{TAG_MAIUSCULA}}).
const TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

/**
 * Teto da fração do documento que a região da hero pode ocupar no modo
 * `tag`. Guard contra o candidato mais externo (a tabela container) ser
 * aceito quando os blocos vizinhos não têm tag canônica para denunciá-lo.
 *
 * 0.7 é folgado de propósito: uma hero grande num email curto (hero +
 * footer) fica em torno de 50-60%; o container só é rejeitado porque leva
 * junto tudo o que vem depois. Falso positivo aqui custa uma falha do step
 * — falso negativo apaga o resto do email.
 */
const MAX_REGION_RATIO = 0.7

export interface HeroRegion {
  /** Offset inclusivo do início da região. */
  start: number
  /** Offset EXCLUSIVO do fim da região. */
  end: number
  mode: "marker" | "tag"
}

interface SectionTag {
  raw: string
  section: string
  start: number
  end: number
}

// ── LEGADO (D10, 20/08): mapa tag→seção da cascata 2 ─────────────────
// A cascata por tags só serve a documentos ANTIGOS com {{TAG}} (a
// biblioteca por example nunca os teve; o caminho normal é o marcador
// cfy:block). Snapshot do tag-registry no dia da sua remoção — apagar
// quando a telemetria mostrar a cascata 2 zerada (`mode: "tag"`).
const LEGACY_HERO_TAG_SECTIONS: Record<string, string> = {
  LOGO: "HEADER", LOGO_URL: "HEADER",
  HEADER_LINK_N_LABEL: "HEADER", HEADER_LINK_N_URL: "HEADER",
  HERO_EYEBROW: "HERO", HERO_HEADLINE: "HERO", HERO_HEADLINE_LINE_N: "HERO",
  HERO_SUBHEAD: "HERO", HERO_BODY: "HERO", HERO_CTA_LABEL: "HERO",
  HERO_CTA_N_LABEL: "HERO", HERO_CTA_URL: "HERO", HERO_CTA_N_URL: "HERO",
  HERO_IMAGE: "HERO", HERO_IMAGE_ALT: "HERO",
  BODY_TITLE: "BODY", BODY_SUBHEAD: "BODY", BODY_TEXT: "BODY",
  BODY_TEXT_N: "BODY", BODY_QUOTE_LINE_N: "BODY", BODY_CTA_LABEL: "BODY",
  BODY_CTA_URL: "BODY", BODY_IMAGE: "BODY", BODY_IMAGE_N: "BODY",
  BODY_IMAGE_ALT: "BODY", BODY_BG_IMAGE: "BODY",
  OFFER_EYEBROW: "OFFER", OFFER_HEADLINE: "OFFER", OFFER_BODY: "OFFER",
  OFFER_VALUE: "OFFER", COUPON_CODE: "OFFER", COUPON_HINT: "OFFER",
  OFFER_CTA_LABEL: "OFFER", OFFER_CTA_URL: "OFFER",
  PRODUCTS_TITLE: "PRODUCTS", PRODUCTS_SUBHEAD: "PRODUCTS",
  PRODUCTS_CTA_LABEL: "PRODUCTS", PRODUCTS_CTA_URL: "PRODUCTS",
  PRODUCTS_IMAGE: "PRODUCTS", PRODUCTS_IMAGE_ALT: "PRODUCTS",
  PRODUCTS_BG_IMAGE: "PRODUCTS", PRODUCT_CTA_LABEL: "PRODUCTS",
  PRODUCT_N_NAME: "PRODUCTS", PRODUCT_N_PRICE: "PRODUCTS",
  PRODUCT_N_COMPARE_PRICE: "PRODUCTS", PRODUCT_N_REVIEWS_COUNT: "PRODUCTS",
  PRODUCT_N_DESC: "PRODUCTS", PRODUCT_N_DESC_N: "PRODUCTS",
  PRODUCT_N_SUBHEAD: "PRODUCTS", PRODUCT_N_USP_N: "PRODUCTS",
  PRODUCT_N_CTA_LABEL: "PRODUCTS", PRODUCT_N_URL: "PRODUCTS",
  PRODUCT_N_IMAGE: "PRODUCTS", PRODUCT_N_IMAGE_ALT: "PRODUCTS",
  PRODUCT_N_THUMB_N: "PRODUCTS",
  USP_HEADLINE: "USP", USP_N_TITLE: "USP", USP_N_SUBHEAD: "USP",
  USP_N_TEXT: "USP", USP_N_ICON: "USP", USP_ICON: "USP",
  USP_N_IMAGE: "USP", USP_N_IMAGE_ALT: "USP",
  STEP_N_TITLE: "USP", STEP_N_TEXT: "USP", STEP_N_IMAGE: "USP",
  STEP_N_NUMBER: "USP",
  REVIEWS_TITLE: "REVIEWS", REVIEWS_TEXT: "REVIEWS",
  REVIEWS_CTA_LABEL: "REVIEWS", REVIEWS_CTA_URL: "REVIEWS",
  REVIEWS_IMAGE: "REVIEWS", REVIEWS_IMAGE_ALT: "REVIEWS",
  REVIEW_N_TEXT: "REVIEWS", REVIEW_N_NAME: "REVIEWS",
  REVIEW_N_META: "REVIEWS", REVIEW_VERIFIED_LABEL: "REVIEWS",
  REVIEW_N_RATING: "REVIEWS", REVIEW_N_IMAGE: "REVIEWS",
  REVIEW_N_INITIAL: "REVIEWS", REVIEW_N_PHOTOS: "REVIEWS",
  REVIEW_N_URL: "REVIEWS", BADGE_N_TEXT: "REVIEWS", BADGE_N_ICON: "REVIEWS",
  URGENCY_HEADLINE: "URGENCY", URGENCY_TEXT: "URGENCY",
  COUNTDOWN_DD: "URGENCY", COUNTDOWN_HH: "URGENCY", COUNTDOWN_MM: "URGENCY",
  COUNTDOWN_SS: "URGENCY", COUNTDOWN_DD_LABEL: "URGENCY",
  COUNTDOWN_HH_LABEL: "URGENCY", COUNTDOWN_MM_LABEL: "URGENCY",
  COUNTDOWN_SS_LABEL: "URGENCY",
  FINAL_CTA_HEADLINE: "CTA", FINAL_CTA_TEXT: "CTA", FINAL_CTA_LABEL: "CTA",
  FINAL_CTA_URL: "CTA", CTA_LABEL: "CTA", CTA_URL: "CTA",
  FOOTER_TAGLINE: "FOOTER", FOOTER_TEXT: "FOOTER", FOOTER_ADDRESS: "FOOTER",
  FOOTER_LINK_N_LABEL: "FOOTER", FOOTER_LINK_N_URL: "FOOTER",
  INSTAGRAM_URL: "FOOTER", FACEBOOK_URL: "FOOTER", TIKTOK_URL: "FOOTER",
  PINTEREST_URL: "FOOTER", YOUTUBE_URL: "FOOTER", INSTAGRAM_ICON: "FOOTER",
  FACEBOOK_ICON: "FOOTER", TIKTOK_ICON: "FOOTER", PINTEREST_ICON: "FOOTER",
  YOUTUBE_ICON: "FOOTER", UNSUBSCRIBE_LABEL: "FOOTER",
  UNSUBSCRIBE_URL: "FOOTER", PREFERENCES_LABEL: "FOOTER",
  PREFERENCES_URL: "FOOTER",
}

/** Mesma normalização do registry morto: dígitos indexados viram N. */
function legacySectionOf(tag: string): string | null {
  return (
    LEGACY_HERO_TAG_SECTIONS[tag] ??
    LEGACY_HERO_TAG_SECTIONS[tag.replace(/_\d+/g, "_N")] ??
    null
  )
}

/** Tags canônicas com seção (META/desconhecidas ficam de fora). */
function collectSectionTags(html: string): SectionTag[] {
  const out: SectionTag[] = []
  for (const m of html.matchAll(TAG_PATTERN)) {
    const section = legacySectionOf(m[1])
    if (!section) continue
    out.push({
      raw: m[1],
      section,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    })
  }
  return out
}

/** Fim (exclusivo) da `<table>` balanceada que começa em `start`. -1 se aberta. */
function scanBalancedTable(html: string, start: number): number {
  const token = /<table\b|<\/table\s*>/gi
  token.lastIndex = start
  let depth = 0
  for (let m = token.exec(html); m; m = token.exec(html)) {
    if (m[0].toLowerCase().startsWith("<table")) depth++
    else {
      depth--
      if (depth === 0) return m.index + m[0].length
    }
    if (depth < 0) return -1
  }
  return -1
}

function findHeroByMarkers(html: string): HeroRegion | null {
  let startIdx = -1
  let endIdx = -1
  for (const m of html.matchAll(CFY_BLOCK_MARKER)) {
    if (m[2].toLowerCase() !== "hero") continue
    if (m[3] === "start") {
      if (startIdx !== -1) return null // dois blocos hero marcados → ambíguo
      startIdx = m.index ?? -1
    } else {
      endIdx = (m.index ?? -1) + m[0].length
    }
  }
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null
  return { start: startIdx, end: endIdx, mode: "marker" }
}

function findHeroByTags(html: string): HeroRegion | null {
  const tags = collectSectionTags(html)
  const heroTags = tags.filter((t) => t.section === "HERO")
  if (heroTags.length === 0) return null

  const firstHero = heroTags[0]
  const lastHero = heroTags[heroTags.length - 1]

  // Nenhuma tag de outra seção pode viver ENTRE as tags da hero — se vive,
  // a hero não é um run contíguo e o recorte seria incorreto.
  const foreign = tags.filter((t) => t.section !== "HERO")
  if (foreign.some((t) => t.start > firstHero.start && t.end < lastHero.end)) {
    return null
  }

  const prevKnownEnd = foreign
    .filter((t) => t.end <= firstHero.start)
    .reduce((acc, t) => Math.max(acc, t.end), 0)
  const nextKnownStart = foreign
    .filter((t) => t.start >= lastHero.end)
    .reduce((acc, t) => Math.min(acc, t.start), html.length)

  // Candidatos de início: cada `<table` entre o fim do bloco anterior e a
  // primeira tag da hero. Wrappers externos falham na validação (contêm
  // tags de outras seções ou invadem o próximo bloco) — segue-se tentando
  // candidatos mais internos.
  const candidates: number[] = []
  const open = /<table\b/gi
  open.lastIndex = prevKnownEnd
  for (let m = open.exec(html); m && m.index < firstHero.start; m = open.exec(html)) {
    candidates.push(m.index)
  }

  for (const start of candidates) {
    let end = scanBalancedTable(html, start)
    if (end === -1) continue

    // Hero pode ser composta por tabelas irmãs (imagem + texto): consome
    // siblings enquanto ainda houver tags HERO fora da região.
    let guard = 0
    while (end < lastHero.end && guard++ < 12) {
      const sibling = /<table\b/gi
      sibling.lastIndex = end
      const m = sibling.exec(html)
      if (!m || m.index >= nextKnownStart) break
      // O trecho entre as tabelas precisa ser "cola" inerte (whitespace,
      // comentários, fechamentos/aberturas de tr/td) — nunca conteúdo de
      // outra seção.
      const gap = html.slice(end, m.index)
      if (/\{\{/.test(gap)) break
      const next = scanBalancedTable(html, m.index)
      if (next === -1) break
      end = next
    }

    if (end < lastHero.end) continue
    if (end > nextKnownStart) continue
    const region = html.slice(start, end)
    // Todas as tags HERO dentro; nenhuma tag de outra seção dentro.
    if (heroTags.some((t) => t.start < start || t.end > end)) continue
    if (foreign.some((t) => t.start >= start && t.end <= end)) continue
    // A checagem de `foreign` acima só enxerga blocos que TÊM tag canônica.
    // Um footer sem tag nenhuma não aparece ali, então o candidato mais
    // externo — a própria tabela container de 600px — passava por todas as
    // validações e a região engolia o resto do email; o splice então o
    // apagava. Proporção é o sinal que resta sem tags: uma hero legítima não
    // ocupa quase o documento inteiro.
    if (region.length > html.length * MAX_REGION_RATIO) continue
    // Balanceamento (defensivo — scanBalancedTable já garante por tabela).
    const opens = (region.match(/<table\b/gi) ?? []).length
    const closes = (region.match(/<\/table\s*>/gi) ?? []).length
    if (opens === 0 || opens !== closes) continue

    return { start, end, mode: "tag" }
  }
  return null
}

/**
 * Localiza a região da hero no documento.
 * Cascata: marcadores cfy:block → tags canônicas → null (step falha).
 */
export function locateHeroRegion(html: string): HeroRegion | null {
  if (!html) return null
  return findHeroByMarkers(html) ?? findHeroByTags(html)
}

/**
 * Substitui a região pelo fragmento gerado, envolvido nas sentinelas
 * cfy:hero. O fragmento vem SEM sentinelas (o chain as remove se o modelo
 * ecoar).
 */
export function spliceHero(
  html: string,
  region: { start: number; end: number },
  fragment: string,
): string {
  return (
    html.slice(0, region.start) +
    `${HERO_SENTINEL_START}\n${fragment.trim()}\n${HERO_SENTINEL_END}` +
    html.slice(region.end)
  )
}

export interface SentinelRegion {
  /** Offset do início da sentinela de abertura. */
  start: number
  /** Offset exclusivo do fim da sentinela de fechamento. */
  end: number
  /** Conteúdo ENTRE as sentinelas (sem elas). */
  inner: string
}

/** Região delimitada pelas sentinelas cfy:hero. null se ausentes/inválidas. */
export function extractHeroBySentinels(html: string): SentinelRegion | null {
  const start = html.indexOf(HERO_SENTINEL_START)
  if (start === -1) return null
  const innerStart = start + HERO_SENTINEL_START.length
  const endMark = html.indexOf(HERO_SENTINEL_END, innerStart)
  if (endMark === -1) return null
  // Sentinela duplicada → ambíguo, não confiar.
  if (html.indexOf(HERO_SENTINEL_START, innerStart) !== -1) return null
  return {
    start,
    end: endMark + HERO_SENTINEL_END.length,
    inner: html.slice(innerStart, endMark),
  }
}

/** Remove as sentinelas (mantendo o conteúdo) antes de persistir o final. */
export function stripSentinels(html: string): string {
  return html
    .replaceAll(`${HERO_SENTINEL_START}\n`, "")
    .replaceAll(`\n${HERO_SENTINEL_END}`, "")
    .replaceAll(HERO_SENTINEL_START, "")
    .replaceAll(HERO_SENTINEL_END, "")
}

/** A hero (entre sentinelas) ficou byte-idêntica entre dois documentos? */
export function heroUnchanged(before: string, after: string): boolean {
  const a = extractHeroBySentinels(before)
  const b = extractHeroBySentinels(after)
  if (!a || !b) return false
  return a.inner === b.inner
}

/**
 * Re-splice determinístico: substitui a região sentinelada de `html` pela
 * hero canônica (inner de `canonical`). null quando algum lado perdeu as
 * sentinelas — o caller trata como falha do step.
 */
export function respliceHero(html: string, canonical: string): string | null {
  const target = extractHeroBySentinels(html)
  const source = extractHeroBySentinels(canonical)
  if (!target || !source) return null
  return (
    html.slice(0, target.start) +
    `${HERO_SENTINEL_START}${source.inner}${HERO_SENTINEL_END}` +
    html.slice(target.end)
  )
}
