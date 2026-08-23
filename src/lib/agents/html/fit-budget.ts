/**
 * fit-budget — quantos caracteres CABEM no slot, medidos no CSS dele.
 *
 * Por que existe: o `max_len` do cadastro conta caracteres, e caractere não
 * mede largura. Na Luxe Lift (23/08) o botão final recebeu "SHOP THE
 * COMFORT LIFT COLLECTION" — 32 caracteres num campo de limite 34, portanto
 * DENTRO do cadastro — e quebrou em duas linhas, vazando da faixa.
 *
 * A caixa era `width:556px; height:58px; line-height:58px` com
 * `font-size:25px; font-weight:700; letter-spacing:0.15em`. Em caixa alta
 * isso gasta ~21px por caractere: 32 deles pedem ~672px numa caixa de 556.
 * O limite real daquele botão é ~26 — e nem o exemplo da própria guidance
 * ("SHOP THE NURSE WEEK COLLECTION", 30) caberia.
 *
 * ESCOPO DELIBERADO: só slot de UMA LINHA, e só quando o documento diz que
 * é de uma linha (altura declarada ≈ line-height). Numa célula de corpo com
 * 5 linhas, a largura de uma linha não é o limite, e chutar quantas linhas
 * cabem sem altura declarada produziria um número pior que o cadastro. Sem
 * certeza, esta função devolve null e o cadastro continua valendo.
 *
 * A medida é aproximada por construção — não há renderizador aqui. O erro
 * fica na casa de ±5%, e a margem de segurança abaixo cobre isso. É a
 * diferença entre "34, um palpite" e "26, medido no elemento".
 *
 * Puro (zero I/O) — client-safe.
 */

import { buildAncestorChain, type Range } from "./dom-locator"

/**
 * Avanço médio por caractere, em fração do font-size.
 *
 * Dois números por família porque a diferença que importa é CAIXA ALTA vs
 * caixa mista — maiúscula é ~35% mais larga, e é justamente nela que os
 * botões vivem. Variação entre famílias sans é pequena perto disso.
 */
const ADVANCE = {
  sans: { upper: 0.7, mixed: 0.52 },
  serif: { upper: 0.72, mixed: 0.5 },
  mono: { upper: 0.6, mixed: 0.6 },
} as const

/** Margem: a média subestima palavras de maiúsculas largas (M, W). */
const SAFETY = 0.95

function familyOf(stack: string): keyof typeof ADVANCE {
  const s = stack.toLowerCase()
  if (/mono|courier|consolas/.test(s)) return "mono"
  if (/serif|georgia|times|garamond|playfair/.test(s) && !/sans-serif/.test(s)) {
    return "serif"
  }
  return "sans"
}

/** `font-size:25px` → 25. Só px: em/rem não resolvem sem a cascata inteira. */
function px(decl: string, prop: string): number | null {
  const m = new RegExp(`(?:^|[^-\\w])${prop}\\s*:\\s*(-?[\\d.]+)px`, "i").exec(decl)
  const v = m ? Number(m[1]) : NaN
  return Number.isFinite(v) ? v : null
}

/** `letter-spacing` aceita px OU em — em é o comum nos botões da biblioteca. */
function tracking(decl: string, fontSize: number): number {
  const emMatch = /letter-spacing\s*:\s*(-?[\d.]+)em/i.exec(decl)
  if (emMatch) return Number(emMatch[1]) * fontSize
  return px(decl, "letter-spacing") ?? 0
}

/** Soma o padding horizontal declarado (shorthand ou lados). */
function paddingX(decl: string): number {
  const left = px(decl, "padding-left")
  const right = px(decl, "padding-right")
  if (left != null || right != null) return (left ?? 0) + (right ?? 0)
  const sh = /(?:^|[^-\w])padding\s*:\s*([^;"]+)/i.exec(decl)
  if (!sh) return 0
  const partes = sh[1]
    .trim()
    .split(/\s+/)
    // `0` sem unidade é CSS válido e é a forma mais comum em e-mail
    // (`padding:0 30px`). Recusá-la fazia o shorthand inteiro ser ignorado.
    .map((p) =>
      /^-?[\d.]+px$/.test(p) ? parseFloat(p) : /^-?0+(\.0+)?$/.test(p) ? 0 : null,
    )
  if (partes.some((p) => p == null)) return 0
  const v = partes as number[]
  // 1 valor = todos; 2 = v/h; 3 = top/h/bottom; 4 = top/right/bottom/left.
  if (v.length === 1) return v[0] * 2
  if (v.length === 2 || v.length === 3) return v[1] * 2
  if (v.length >= 4) return v[1] + v[3]
  return 0
}

function openTagOf(html: string, range: Range): string {
  const end = html.indexOf(">", range.start)
  return end === -1 || end > range.end
    ? html.slice(range.start, range.end)
    : html.slice(range.start, end + 1)
}

function styleOf(openTag: string): string {
  return /style\s*=\s*"([^"]*)"/i.exec(openTag)?.[1] ?? ""
}

/** `width="556"` como atributo — padrão antigo de e-mail. */
function widthAttr(openTag: string): number | null {
  const m = /\swidth\s*=\s*"?(\d+)"?/i.exec(openTag)
  const v = m ? Number(m[1]) : NaN
  return Number.isFinite(v) && v > 0 ? v : null
}

export interface SlotMeasure {
  /** Caracteres que cabem em uma linha. */
  chars: number
  /** Largura útil (px) já descontado o padding do caminho. */
  widthPx: number
  fontSizePx: number
  /** Espaço extra por caractere (px), de `letter-spacing`. */
  trackingPx: number
  uppercase: boolean
}

/**
 * Mede o slot que contém `offset`, subindo pelos ancestrais.
 *
 * Regra do "mais interno vence" para fonte (é o que o cliente de e-mail
 * pinta) e do PRIMEIRO ancestral com largura declarada para a caixa —
 * descontando o padding de cada elemento no caminho.
 *
 * Devolve null quando falta o essencial (largura ou font-size) ou quando o
 * slot não é comprovadamente de uma linha.
 */
export function measureSlot(
  html: string,
  offset: number,
  texto: string,
  chainAt: ReturnType<typeof buildAncestorChain>,
): SlotMeasure | null {
  const chain = chainAt(offset)
  if (!chain) return null

  let fontSize: number | null = null
  let fontStack = ""
  let letterSpacing: number | null = null
  let width: number | null = null
  let umaLinha = false
  let padAcumulado = 0

  for (const el of chain) {
    const tag = openTagOf(html, el.range)
    const style = styleOf(tag)

    if (fontSize == null) fontSize = px(style, "font-size")
    if (!fontStack) {
      fontStack = /font-family\s*:\s*([^;"]+)/i.exec(style)?.[1] ?? ""
    }
    if (letterSpacing == null && /letter-spacing/i.test(style)) {
      letterSpacing = tracking(style, fontSize ?? 16)
    }

    // Uma linha: altura declarada bate com o line-height. É o que o
    // designer escreve quando a caixa NÃO pode crescer.
    if (!umaLinha) {
      const h = px(style, "height")
      const lh = px(style, "line-height")
      if (h != null && lh != null && Math.abs(h - lh) <= 2) umaLinha = true
    }

    if (width == null) {
      const w = px(style, "width") ?? widthAttr(tag)
      if (w != null && w > 0) width = w - padAcumulado
    }
    padAcumulado += paddingX(style)
  }

  if (width == null || width <= 0 || fontSize == null || !umaLinha) return null

  const uppercase = texto.length > 0 && texto === texto.toUpperCase()
  const avanco =
    ADVANCE[familyOf(fontStack)][uppercase ? "upper" : "mixed"] * fontSize
  const porChar = avanco + (letterSpacing ?? 0)
  if (porChar <= 0) return null

  return {
    chars: Math.max(1, Math.floor((width * SAFETY) / porChar)),
    widthPx: width,
    fontSizePx: fontSize,
    trackingPx: letterSpacing ?? 0,
    uppercase,
  }
}
