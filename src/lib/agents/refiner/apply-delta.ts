/**
 * apply-delta — aplicação MECÂNICA dos deltas do Refinador (v2).
 *
 * O LLM nunca reescreve o HTML: o código extrai inventários NUMERADOS do
 * <body> (font-family, border-radius, espaçamentos verticais e junções
 * entre seções), o LLM devolve um delta JSON com índices, e as funções
 * apply* trocam apenas os alvos — replace com contador sobre o MESMO
 * regex da extração (contrato interno de ordenação), determinístico.
 * O <style> do <head> (base + media queries) fica intacto; o @import da
 * fonte escolhida entra via injectFontImport.
 *
 * Módulo puro (zero I/O) — testável.
 */

import type { WhitelistFont } from "./font-whitelist"
import { fixOrphanSpacerDivs } from "../html/orphan-spacer"

export interface FontOccurrence {
  index: number
  tag: string
  currentFamily: string
  fontSizePx: number | null
  textSnippet: string
}

export interface RefinerTarget {
  index: number
  role:
    | "brand_name"
    | "hero_headline"
    | "price"
    | "testimonial"
    | "section_title"
  font_weight?: number
  letter_spacing?: string
}

/** Seção de tipografia do delta (era o delta inteiro no v1). */
export interface RefinerDelta {
  strategy:
    | "serif_luxury"
    | "personality_sans"
    | "mono_weight_contrast"
    | "none"
  rationale: string
  display_font: { family: string; weights: number[] } | null
  targets: RefinerTarget[]
}

// ── Formas (border-radius) ─────────────────────────────────────────────

export interface RadiusOccurrence {
  index: number
  tag: string
  hasRadius: boolean
  currentPx: number | null
  textSnippet: string
}

export interface ShapesTarget {
  index: number
  radius_px: number
}

export interface ShapesDelta {
  stance: "angular_premium" | "rounded_warm" | "disciplined_minimal" | "none"
  rationale: string
  targets: ShapesTarget[]
}

// ── Espaçamento / ritmo vertical ───────────────────────────────────────

export type SpacingProp =
  | "padding-top"
  | "padding-bottom"
  | "margin-top"
  | "margin-bottom"
  | "height"

export interface SpacingOccurrence {
  index: number
  prop: SpacingProp
  tag: string
  currentPx: number
  textSnippet: string
}

export interface SpacingAdjust {
  index: number
  value_px: number
}

export interface SpacingInsert {
  junction: number
  height_px: number
}

export interface SpacingDelta {
  rhythm: "intimate_uniform" | "editorial_spaced" | "contrast_peaks" | "none"
  rationale: string
  adjust: SpacingAdjust[]
  insert: SpacingInsert[]
}

export interface SectionJunction {
  junction: number
  beforeSnippet: string
  afterSnippet: string
  /** background-color da seção ANTES da junção (null = não detectado). */
  beforeBg: string | null
  /** background-color da seção DEPOIS da junção (null = não detectado). */
  afterBg: string | null
}

/** Delta completo do Refinador v2 — 3 seções independentes. */
export interface RefinerDeltaV2 {
  typography: RefinerDelta
  shapes: ShapesDelta
  spacing: SpacingDelta
}

export const NONE_TYPOGRAPHY: RefinerDelta = {
  strategy: "none",
  rationale: "",
  display_font: null,
  targets: [],
}
export const NONE_SHAPES: ShapesDelta = { stance: "none", rationale: "", targets: [] }
export const NONE_SPACING: SpacingDelta = {
  rhythm: "none",
  rationale: "",
  adjust: [],
  insert: [],
}

// Limites mecânicos (clamps na aplicação; guards validam índices/tetos).
export const RADIUS_MAX_PX = 24
export const SPACING_MAX_PX = 160
export const SPACER_MIN_PX = 8
export const MAX_SPACER_INSERTS = 6
// Teto próprio para spacers INSERIDOS — menor que o de ajuste de valores
// existentes. Respiros de 100-160px num email de 600px são desproporcionais
// (Luxe Lift w#1, jul/2026: faixas de 100/120px entre seções).
export const SPACER_INSERT_MAX_PX = 64

// font-family DENTRO de style="" inline. O lookbehind não é necessário:
// varremos só o corpo (após </head>) e o <style> block nunca aparece lá.
const FONT_FAMILY_RE = /font-family\s*:\s*([^;"}<]+)/gi

/** Divide em head+resto para nunca tocar o <style> block do head. */
function splitAtBody(html: string): { head: string; body: string } {
  const m = /<body[^>]*>/i.exec(html)
  if (!m || m.index === undefined) return { head: "", body: html }
  const cut = m.index + m[0].length
  return { head: html.slice(0, cut), body: html.slice(cut) }
}

/** textContent aproximado do elemento host da ocorrência (80 chars). */
function snippetAround(body: string, matchIndex: number): string {
  // Fim da tag que contém o style: primeiro '>' após o match.
  const tagEnd = body.indexOf(">", matchIndex)
  if (tagEnd === -1) return ""
  const after = body.slice(tagEnd + 1, tagEnd + 1200)
  const text = after
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.slice(0, 80)
}

function tagAround(body: string, matchIndex: number): string {
  const before = body.slice(Math.max(0, matchIndex - 300), matchIndex)
  const m = before.match(/<([a-zA-Z][a-zA-Z0-9]*)[^<]*$/)
  return m ? m[1].toLowerCase() : "?"
}

function fontSizeAround(body: string, matchIndex: number): number | null {
  // font-size no MESMO style attr: procura na vizinhança imediata.
  const windowStr = body.slice(Math.max(0, matchIndex - 400), matchIndex + 400)
  const m = windowStr.match(/font-size\s*:\s*([\d.]+)px/i)
  return m ? Math.round(parseFloat(m[1])) : null
}

/**
 * Inventário numerado das ocorrências de font-family no corpo do email.
 * O índice é a ordem da ocorrência — applyRefinerDelta usa o MESMO regex
 * e a MESMA ordem para aplicar (contrato interno).
 */
export function extractFontOccurrences(html: string): FontOccurrence[] {
  const { body } = splitAtBody(html)
  const occurrences: FontOccurrence[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(FONT_FAMILY_RE.source, FONT_FAMILY_RE.flags)
  let index = 0
  while ((match = re.exec(body)) !== null) {
    occurrences.push({
      index,
      tag: tagAround(body, match.index),
      currentFamily: match[1].trim().slice(0, 80),
      fontSizePx: fontSizeAround(body, match.index),
      textSnippet: snippetAround(body, match.index),
    })
    index++
  }
  return occurrences
}

const clampTracking = (raw: string): string | null => {
  const m = raw.trim().match(/^(-?[\d.]+)px$/)
  if (!m) return null
  const v = Math.max(-3, Math.min(2, parseFloat(m[1])))
  return `${v}px`
}

/**
 * Aplica o delta: nos índices alvo, troca a família (exceto
 * mono_weight_contrast, que mantém) e faz patch de font-weight /
 * letter-spacing no mesmo trecho de style. Demais ocorrências ficam
 * byte-a-byte idênticas.
 */
export function applyRefinerDelta(
  html: string,
  delta: RefinerDelta,
  fontEntry: WhitelistFont | null,
): string {
  if (delta.strategy === "none" || delta.targets.length === 0) return html
  const { head, body } = splitAtBody(html)
  const targetByIndex = new Map(delta.targets.map((t) => [t.index, t]))

  let counter = -1
  const newBody = body.replace(FONT_FAMILY_RE, (full, family: string) => {
    counter++
    const target = targetByIndex.get(counter)
    if (!target) return full

    const parts: string[] = []
    if (delta.strategy === "mono_weight_contrast" || !fontEntry) {
      // Mantém a família; só peso/tracking mudam.
      parts.push(`font-family: ${family.trim()}`)
    } else {
      parts.push(`font-family: '${fontEntry.family}', ${fontEntry.fallbackStack}`)
    }
    if (target.font_weight !== undefined) {
      const weights = fontEntry?.availableWeights
      const w =
        weights && !weights.includes(target.font_weight)
          ? // peso indisponível na fonte → mais próximo disponível
            weights.reduce((a, b) =>
              Math.abs(b - target.font_weight!) < Math.abs(a - target.font_weight!) ? b : a,
            )
          : target.font_weight
      parts.push(`font-weight: ${w}`)
    }
    if (target.letter_spacing !== undefined) {
      const clamped = clampTracking(target.letter_spacing)
      if (clamped) parts.push(`letter-spacing: ${clamped}`)
    }
    return parts.join("; ")
  })

  return head + newBody
}

/**
 * Injeta a rule @import no primeiro <style> do <head> (idempotente).
 * Sem <style> → cria um antes do </head>.
 */
export function injectFontImport(html: string, importRule: string): string {
  if (!importRule || html.includes(importRule)) return html
  const styleMatch = /<style[^>]*>/i.exec(html)
  if (styleMatch && styleMatch.index !== undefined) {
    const cut = styleMatch.index + styleMatch[0].length
    return `${html.slice(0, cut)}\n    ${importRule}${html.slice(cut)}`
  }
  const headClose = /<\/head>/i.exec(html)
  if (headClose && headClose.index !== undefined) {
    return `${html.slice(0, headClose.index)}<style>\n    ${importRule}\n  </style>\n${html.slice(headClose.index)}`
  }
  return html
}

// ═════════════════════════ FORMAS (border-radius) ═════════════════════

// Elementos com style inline no body. Ordem de match = índice do inventário
// (contrato entre extractRadiusOccurrences e applyShapesDelta).
const STYLED_ELEMENT_RE = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?style\s*=\s*"([^"]*)"[^>]*>/gi

function parseRadiusPx(styleContent: string): { has: boolean; px: number | null; isPercent: boolean } {
  const m = styleContent.match(/border-radius\s*:\s*([^;"]+)/i)
  if (!m) return { has: false, px: null, isPercent: false }
  const value = m[1].trim()
  if (value.includes("%")) return { has: true, px: null, isPercent: true }
  const px = value.match(/([\d.]+)\s*px/)
  return { has: true, px: px ? Math.round(parseFloat(px[1])) : value.startsWith("0") ? 0 : null, isPercent: false }
}

/**
 * Inventário de candidatos a ajuste de raio: elementos com border-radius
 * inline OU <a> com style (candidatos a GANHAR raio). Exclusões por lei
 * do estudo de formas: <img> nunca arredonda (fica fora do inventário) e
 * radius em % (avatares circulares) não é tocado.
 */
export function extractRadiusOccurrences(html: string): RadiusOccurrence[] {
  const { body } = splitAtBody(html)
  const occurrences: RadiusOccurrence[] = []
  const re = new RegExp(STYLED_ELEMENT_RE.source, STYLED_ELEMENT_RE.flags)
  let match: RegExpExecArray | null
  let index = 0
  while ((match = re.exec(body)) !== null) {
    const tag = match[1].toLowerCase()
    if (tag === "img") continue
    const { has, px, isPercent } = parseRadiusPx(match[2])
    if (isPercent) continue
    if (!has && tag !== "a") continue
    occurrences.push({
      index,
      tag,
      hasRadius: has,
      currentPx: px,
      textSnippet: snippetAround(body, match.index),
    })
    index++
  }
  return occurrences
}

const clampRadius = (v: number): number => Math.max(0, Math.min(RADIUS_MAX_PX, Math.round(v)))

/**
 * Aplica o delta de formas: nos índices alvo, substitui o border-radius
 * existente ou apende um novo ao style. Percorre o MESMO regex e as
 * MESMAS exclusões da extração para manter o contrato de índices.
 */
export function applyShapesDelta(html: string, targets: ShapesTarget[]): string {
  if (targets.length === 0) return html
  const { head, body } = splitAtBody(html)
  const byIndex = new Map(targets.map((t) => [t.index, t]))

  let counter = -1
  const newBody = body.replace(
    STYLED_ELEMENT_RE,
    (full: string, tag: string, styleContent: string) => {
      const tagLower = tag.toLowerCase()
      if (tagLower === "img") return full
      const { has, isPercent } = parseRadiusPx(styleContent)
      if (isPercent) return full
      if (!has && tagLower !== "a") return full
      counter++
      const target = byIndex.get(counter)
      if (!target) return full

      const radius = `border-radius: ${clampRadius(target.radius_px)}px`
      let newStyle: string
      if (has) {
        newStyle = styleContent.replace(/border-radius\s*:\s*[^;"]+/i, radius)
      } else {
        const sep = styleContent.trim() === "" || styleContent.trim().endsWith(";") ? " " : "; "
        newStyle = `${styleContent}${sep}${radius};`
      }
      // Troca apenas o conteúdo do PRIMEIRO style attr do match (o mesmo
      // capturado pelo regex lazy) — tolera `style = "..."` com espaços.
      return full.replace(/style\s*=\s*"[^"]*"/i, `style="${newStyle}"`)
    },
  )
  return head + newBody
}

// ═══════════════════ ESPAÇAMENTO (ritmo vertical) ═════════════════════

// Longhand verticais + height (spacers). O lookbehind bloqueia line-height,
// min-height e max-height. Shorthand `padding:` fica fora do v1 (ambíguo).
const SPACING_PROP_RE =
  /(?<![-\w])(padding-top|padding-bottom|margin-top|margin-bottom|height)\s*:\s*([\d.]+)px/gi

/**
 * Inventário de espaçamentos verticais inline no body (valores >= 8px —
 * abaixo disso é ajuste fino de cluster, não ritmo entre fases).
 */
export function extractSpacingOccurrences(html: string): SpacingOccurrence[] {
  const { body } = splitAtBody(html)
  const occurrences: SpacingOccurrence[] = []
  const re = new RegExp(SPACING_PROP_RE.source, SPACING_PROP_RE.flags)
  let match: RegExpExecArray | null
  let index = 0
  while ((match = re.exec(body)) !== null) {
    const px = Math.round(parseFloat(match[2]))
    if (px < SPACER_MIN_PX) continue
    occurrences.push({
      index,
      prop: match[1].toLowerCase() as SpacingProp,
      tag: tagAround(body, match.index),
      currentPx: px,
      textSnippet: snippetAround(body, match.index),
    })
    index++
  }
  return occurrences
}

const clampSpacing = (v: number): number => Math.max(0, Math.min(SPACING_MAX_PX, Math.round(v)))
const clampSpacerHeight = (v: number): number =>
  Math.max(SPACER_MIN_PX, Math.min(SPACER_INSERT_MAX_PX, Math.round(v)))

// Void elements não abrem escopo no scanner de seções.
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
])

interface SectionSpan {
  start: number
  end: number
}

/**
 * Localiza o wrapper central (~600px) e devolve os spans dos filhos
 * diretos (as "seções" do email). Junção i = fronteira entre o filho i
 * e o i+1 — é onde applySpacingDelta pode inserir um spacer.
 */
function scanSections(html: string): SectionSpan[] {
  const wrapperMatch =
    /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*style\s*=\s*"[^"]*(?:max-)?width\s*:\s*600px[^"]*"[^>]*>/i.exec(
      html,
    )
  if (!wrapperMatch || wrapperMatch.index === undefined) return []
  const contentStart = wrapperMatch.index + wrapperMatch[0].length

  const sections: SectionSpan[] = []
  const tokenRe = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9]*(?:"[^"]*"|'[^']*'|[^"'>])*>/g
  tokenRe.lastIndex = contentStart
  let depth = 0
  let currentStart = -1
  let token: RegExpExecArray | null
  while ((token = tokenRe.exec(html)) !== null) {
    const t = token[0]
    if (t.startsWith("<!--")) continue
    const isClose = t.startsWith("</")
    const tagName = (t.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/)?.[1] ?? "").toLowerCase()
    const isVoid = VOID_TAGS.has(tagName) || t.endsWith("/>")

    if (isClose) {
      depth--
      if (depth === 0 && currentStart !== -1) {
        sections.push({ start: currentStart, end: token.index + t.length })
        currentStart = -1
      }
      if (depth < 0) break // fechou o wrapper
    } else if (!isVoid) {
      if (depth === 0) currentStart = token.index
      depth++
    } else if (depth === 0 && tagName !== "br" && tagName !== "hr") {
      // void element solto no nível das seções (ex.: <img> full-width):
      // conta como seção própria.
      sections.push({ start: token.index, end: token.index + t.length })
    }
  }
  return sections
}

/**
 * background-color "da seção": a PRIMEIRA declaração dentro do span — em
 * emails de tabela a cor da linha é declarada no <td> de abertura, antes
 * de qualquer elemento interno. Heurística: pode pegar um bg interno
 * quando a linha não declara cor (aceitável; null quando não há nenhum).
 */
function sectionBg(html: string, span: SectionSpan): string | null {
  const m = html.slice(span.start, span.end).match(/background-color\s*:\s*([^;"'<>]+)/i)
  return m ? m[1].trim() : null
}

function edgeSnippet(html: string, span: SectionSpan, edge: "head" | "tail"): string {
  const text = html
    .slice(span.start, span.end)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return edge === "head" ? text.slice(0, 60) : text.slice(-60)
}

/**
 * Junções numeradas entre as seções do wrapper central, com trechos de
 * texto das bordas para o LLM entender o contexto de cada fronteira.
 */
export function extractSectionJunctions(html: string): SectionJunction[] {
  const sections = scanSections(html)
  const junctions: SectionJunction[] = []
  for (let i = 0; i < sections.length - 1; i++) {
    junctions.push({
      junction: i,
      beforeSnippet: edgeSnippet(html, sections[i], "tail"),
      afterSnippet: edgeSnippet(html, sections[i + 1], "head"),
      beforeBg: sectionBg(html, sections[i]),
      afterBg: sectionBg(html, sections[i + 1]),
    })
  }
  return junctions
}

/**
 * Aplica o delta de espaçamento: `adjust` troca valores existentes por
 * índice (mesmo regex da extração); `insert` injeta spacers
 * `<div style="height:Npx"></div>` nas junções entre seções (recomputadas
 * no HTML já ajustado; aplicadas em ordem decrescente para preservar
 * offsets). Teto de MAX_SPACER_INSERTS inserções.
 */
export function applySpacingDelta(
  html: string,
  adjust: SpacingAdjust[],
  insert: SpacingInsert[],
): string {
  let out = html
  if (adjust.length > 0) {
    const byIndex = new Map(adjust.map((a) => [a.index, a]))
    const { head, body } = splitAtBody(out)
    let counter = -1
    const newBody = body.replace(
      SPACING_PROP_RE,
      (full: string, prop: string, px: string, offset: number) => {
        if (Math.round(parseFloat(px)) < SPACER_MIN_PX) return full
        counter++
        const target = byIndex.get(counter)
        if (!target) return full
        // Guard: `height` de elemento com background-image é MÍDIA (hero
        // overlay), não respiro — o Refinador chegou a encolher o hero de
        // 320px para 160px (Luxe Lift w#3), esmagando a imagem e estourando
        // o texto do overlay. Ocorrência continua contando no índice (sync
        // com o inventário do LLM), só a mudança é recusada.
        if (prop.toLowerCase() === "height") {
          const tagStart = body.lastIndexOf("<", offset)
          if (
            tagStart !== -1 &&
            body.slice(tagStart, offset).includes("background-image")
          ) {
            return full
          }
        }
        return `${prop}: ${clampSpacing(target.value_px)}px`
      },
    )
    out = head + newBody
  }

  const inserts = insert.slice(0, MAX_SPACER_INSERTS)
  if (inserts.length > 0) {
    const sections = scanSections(out)
    const valid = inserts
      .filter((i) => Number.isInteger(i.junction) && i.junction >= 0 && i.junction < sections.length - 1)
      .sort((a, b) => b.junction - a.junction)
    for (const ins of valid) {
      const at = sections[ins.junction].end
      // Spacer HERDA a cor de fundo das vizinhas: iguais → essa cor (respiro
      // invisível dentro do bloco); diferentes → cor da seção SEGUINTE (lê
      // como padding-top do próximo bloco). Sem cor detectada → sem bg (fica
      // o fundo do wrapper). Sem isto, respiro dentro de seção escura virava
      // faixa clara cortando o bloco (rodapé Luxe Lift w#1, jul/2026).
      const prevBg = sectionBg(out, sections[ins.junction])
      const nextBg = sectionBg(out, sections[ins.junction + 1])
      const bg = prevBg && nextBg ? (prevBg === nextBg ? prevBg : nextBg) : (nextBg ?? prevBg)
      const spacer = `<div style="height:${clampSpacerHeight(ins.height_px)}px${bg ? `;background-color:${bg}` : ""}"></div>`
      out = out.slice(0, at) + spacer + out.slice(at)
    }
    // Junção DENTRO de <table> (</tr>…<tr>): a div solta sofre foster
    // parenting no cliente de email — é arrancada da tabela e empilhada no
    // TOPO do documento (~430px de gap na Luxe Lift w#3, 5 spacers), e o
    // respiro pedido nunca acontece. Normaliza pro spacer de tabela válido
    // no MESMO ponto. Junções fora de tabela mantêm a div.
    out = fixOrphanSpacerDivs(out)
  }
  return out
}
