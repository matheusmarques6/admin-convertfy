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
 *   3. null — não localizável: o caller cai no modo full-doc (o agente hero
 *      devolve o documento inteiro com guard estrutural).
 *
 * No splice o código injeta as sentinelas <!-- cfy:hero:start/end --> — a
 * partir daí os agentes seguintes têm uma região determinística pra
 * preservar, e o guard consegue re-splicar se o modelo mexer nela.
 *
 * Puro (zero deps de server) — testável.
 */

import { lookupTag } from "@/lib/email-workspace/tag-registry"

// SYNC: mesmo formato de BLOCK_MARKER_PATTERN em component-assembler.service.ts.
const CFY_BLOCK_MARKER =
  /<!--\s*cfy:block:(\d+):([A-Za-z0-9_-]+):(start|end)\s*-->/g

export const HERO_SENTINEL_START = "<!-- cfy:hero:start -->"
export const HERO_SENTINEL_END = "<!-- cfy:hero:end -->"

// Mesmo formato de placeholder do reference-structure ({{TAG_MAIUSCULA}}).
const TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

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

/** Tags canônicas com seção (META/desconhecidas ficam de fora). */
function collectSectionTags(html: string): SectionTag[] {
  const out: SectionTag[] = []
  for (const m of html.matchAll(TAG_PATTERN)) {
    const spec = lookupTag(m[1])
    if (!spec || !spec.blockType) continue
    out.push({
      raw: m[1],
      section: spec.section,
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
    // Balanceamento (defensivo — scanBalancedTable já garante por tabela).
    const opens = (region.match(/<table\b/gi) ?? []).length
    const closes = (region.match(/<\/table\s*>/gi) ?? []).length
    if (opens === 0 || opens !== closes) continue

    return { start, end, mode: "tag" }
  }
  return null
}

/**
 * Localiza a região da hero no documento do Montador.
 * Cascata: marcadores cfy:block → tags canônicas → null (full-doc).
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
