/**
 * Derivacao das 6 color roles funcionais do HTML Agent v2.
 *
 * Entrada: arrays `colors_primary` / `colors_secondary` de
 * `store_brand_identities`, com `BrandColor { hex, name, role }`. O campo
 * `role` aceita rotulos livres mas a UI de captura aplica o vocabulario
 * "Principal" | "Fundo" | "Destaque".
 *
 * Saida: 6 hex strings com papeis explicitos que o user_template injeta
 * em CSS variables (--bg, --text, --heading, --button-bg, --button-text,
 * --accent).
 *
 * Regra de derivacao (em ordem):
 *   bg          ← role="Fundo" da paleta primaria; senao cor mais clara
 *                  de qualquer paleta; senao "#FFFFFF".
 *   text        ← contraste WCAG vs bg: "#1F1F1F" ou "#FFFFFF" pelo brilho.
 *   heading     ← role="Principal" se contrastar com bg (>= 4.5:1); senao
 *                  igual a text.
 *   button_bg   ← role="Principal" da primaria; senao primeira cor primaria;
 *                  senao "#1F1F1F".
 *   button_text ← contraste WCAG vs button_bg.
 *   accent      ← role="Destaque" (primaria ou secundaria); senao segunda
 *                  cor primaria; senao igual a button_bg.
 *
 * Brilho: formula relative-luminance simplificada (WCAG 2.1). Threshold
 * 0.5 separa fundos claros (text/button_text preto) de fundos escuros
 * (text/button_text branco).
 */

import type { BrandColor } from "@/types/email-workspace"

export interface ColorRoles {
  bg: string
  text: string
  heading: string
  button_bg: string
  button_text: string
  accent: string
}

const DEFAULT_DARK = "#1F1F1F"
const DEFAULT_LIGHT = "#FFFFFF"
const DEFAULT_BG = "#FFFFFF"

function normalizeHex(hex: string): string {
  const trimmed = hex.trim()
  if (!trimmed) return ""
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const r = withHash[1]
    const g = withHash[2]
    const b = withHash[3]
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toUpperCase()
  }
  return ""
}

function relativeLuminance(hex: string): number {
  const norm = normalizeHex(hex)
  if (!norm) return 0
  const r = parseInt(norm.slice(1, 3), 16) / 255
  const g = parseInt(norm.slice(3, 5), 16) / 255
  const b = parseInt(norm.slice(5, 7), 16) / 255
  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function contrastingText(bg: string): string {
  return relativeLuminance(bg) > 0.5 ? DEFAULT_DARK : DEFAULT_LIGHT
}

function findByRole(
  colors: BrandColor[],
  role: string,
): BrandColor | undefined {
  return colors.find(
    (c) => c.role?.trim().toLowerCase() === role.toLowerCase(),
  )
}

function lightest(colors: BrandColor[]): BrandColor | undefined {
  if (colors.length === 0) return undefined
  return colors.reduce((acc, c) =>
    relativeLuminance(c.hex) > relativeLuminance(acc.hex) ? c : acc,
  )
}

/**
 * Aplica shift de luminance no espaco HSL. Usado para garantir que
 * accent != button_bg quando a paleta e' mono. Delta positivo clareia,
 * negativo escurece. Clamp em [0, 1] na luminance final.
 */
function shiftLuminance(hex: string, delta: number): string {
  const norm = normalizeHex(hex)
  if (!norm) return hex
  const r = parseInt(norm.slice(1, 3), 16) / 255
  const g = parseInt(norm.slice(3, 5), 16) / 255
  const b = parseInt(norm.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
  let h = 0
  if (max !== min) {
    const d = max - min
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  const newL = Math.max(0, Math.min(1, l + delta))
  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let nr: number, ng: number, nb: number
  if (s === 0) {
    nr = ng = nb = newL
  } else {
    const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s
    const p = 2 * newL - q
    nr = hueToRgb(p, q, h + 1 / 3)
    ng = hueToRgb(p, q, h)
    nb = hueToRgb(p, q, h - 1 / 3)
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0").toUpperCase()
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`
}

export function deriveColorRoles(
  primary: BrandColor[] = [],
  secondary: BrandColor[] = [],
): ColorRoles {
  const validPrimary = primary
    .filter((c) => normalizeHex(c.hex))
    .map((c) => ({ ...c, hex: normalizeHex(c.hex) }))
  const validSecondary = secondary
    .filter((c) => normalizeHex(c.hex))
    .map((c) => ({ ...c, hex: normalizeHex(c.hex) }))
  const all = [...validPrimary, ...validSecondary]

  // bg
  const bgRole =
    findByRole(validPrimary, "Fundo") ?? findByRole(validSecondary, "Fundo")
  const bg =
    bgRole?.hex ??
    lightest(all)?.hex ??
    DEFAULT_BG

  // text
  const text = contrastingText(bg)

  // heading
  const principalForHeading =
    findByRole(validPrimary, "Principal") ??
    findByRole(validSecondary, "Principal")
  const heading =
    principalForHeading && contrastRatio(principalForHeading.hex, bg) >= 4.5
      ? principalForHeading.hex
      : text

  // button_bg
  const principalForButton =
    findByRole(validPrimary, "Principal") ?? validPrimary[0] ?? validSecondary[0]
  const button_bg = principalForButton?.hex ?? DEFAULT_DARK

  // button_text
  const button_text = contrastingText(button_bg)

  // accent — primeira cor que nao foi usada como bg nem como button_bg.
  // Em paleta mono (so' uma cor primaria sem role) cai em button_bg —
  // o que faz CTAs secundarios e marcacoes de destaque sumirem.
  // Forca variacao por shift de luminance pra preservar contraste.
  const destaque =
    findByRole(validPrimary, "Destaque") ??
    findByRole(validSecondary, "Destaque")
  const distinctFallback = all.find(
    (c) => c.hex !== bg && c.hex !== button_bg,
  )
  let accent = destaque?.hex ?? distinctFallback?.hex ?? button_bg
  if (accent.toLowerCase() === button_bg.toLowerCase()) {
    const isDark = relativeLuminance(button_bg) < 0.5
    accent = shiftLuminance(button_bg, isDark ? 0.2 : -0.2)
  }

  return { bg, text, heading, button_bg, button_text, accent }
}
