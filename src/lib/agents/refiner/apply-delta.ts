/**
 * apply-delta — aplicação MECÂNICA do delta tipográfico do Refinador.
 *
 * O LLM nunca reescreve o HTML: o código extrai um inventário NUMERADO das
 * ocorrências de `font-family` inline do <body> (extractFontOccurrences),
 * o LLM devolve índices + fonte/peso/tracking, e applyRefinerDelta troca
 * apenas os alvos — replace com contador sobre o MESMO regex, determinístico.
 * O <style> do <head> (base + media queries) fica intacto; o @import da
 * fonte escolhida entra via injectFontImport.
 *
 * Módulo puro (zero I/O) — testável.
 */

import type { WhitelistFont } from "./font-whitelist"

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
