/**
 * Derivacao das 6 color roles funcionais do HTML Agent v2.
 *
 * Entrada: arrays `colors_primary` / `colors_secondary` de
 * `store_brand_identity`, com `BrandColor { hex, name, role }`. O campo
 * `role` aceita rotulos livres mas a UI de captura aplica o vocabulario
 * "Principal" | "Fundo" | "Destaque".
 *
 * Saida: 6 hex strings com papeis explicitos que o user_template injeta
 * em CSS variables (--bg, --text, --heading, --button-bg, --button-text,
 * --accent).
 *
 * Regra de derivacao (em ordem):
 *   bg          ← role="Fundo" da paleta primaria; senao cor mais clara
 *                  de qualquer paleta; senao "#FFFFFF". GUARD: se a cor
 *                  resolvida for escura (luminance < 0.55), cai em branco —
 *                  canvas de email escuro em container branco = faixas
 *                  pretas nas laterais, nunca e' intencional aqui.
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
  /**
   * Fundo de PAINEL — o card, a faixa de destaque, a coluna que precisa se
   * separar do canvas sem virar bloco escuro. Derivado do `bg`, sempre mais
   * escuro que ele.
   *
   * Por que existe: a paleta da loja é registrada com pouquíssimas cores (a
   * Luxe Lift tem DUAS), e o prompt do agente de cor proíbe inventar valor
   * fora dos papéis. Com um único valor claro, todo cinza de painel da
   * biblioteca tinha um destino legal só — o próprio `bg`. Em quatro
   * gerações seguidas o agente mandou de 6 a 10 cinzas para o mesmo hex do
   * canvas: figura e fundo viram a mesma cor e o destaque some. Ele obedeceu
   * a regra; faltava lugar para onde mandar.
   */
  surface: string
  /** Segundo nível: painel DENTRO de painel, ou destaque mais afirmativo. */
  surface_strong: string
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

export function relativeLuminance(hex: string): number {
  const norm = normalizeHex(hex)
  if (!norm) return 0
  const r = parseInt(norm.slice(1, 3), 16) / 255
  const g = parseInt(norm.slice(3, 5), 16) / 255
  const b = parseInt(norm.slice(5, 7), 16) / 255
  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function contrastingText(bg: string): string {
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

// ── Superfícies ───────────────────────────────────────────────────────

/**
 * Distância mínima entre canvas e painel para o painel EXISTIR aos olhos.
 * 1.08:1 é pouco em termos de WCAG — e é de propósito: painel não precisa
 * ser legível contra o fundo, precisa ser percebido como uma área. Os
 * cinzas que a biblioteca usa hoje (#EFEFEF, #D9D9D9 sobre branco) ficam
 * nessa ordem de grandeza.
 */
const SURFACE_MIN_RATIO = 1.08

/** Piso de leitura do texto EM CIMA do painel (AA texto normal). */
const SURFACE_TEXT_MIN = 4.5

/** Mistura linear de dois hex. `t` = quanto de `b` entra (0..1). */
function mixHex(a: string, b: string, t: number): string {
  const na = normalizeHex(a)
  const nb = normalizeHex(b)
  if (!na || !nb) return a
  const canal = (i: number) => {
    const va = parseInt(na.slice(1 + i * 2, 3 + i * 2), 16)
    const vb = parseInt(nb.slice(1 + i * 2, 3 + i * 2), 16)
    return Math.round(va * (1 - t) + vb * t)
  }
  const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase()
  return `#${hex(canal(0))}${hex(canal(1))}${hex(canal(2))}`
}

/**
 * Ajusta a dose até o tom (a) se separar do canvas e (b) ainda deixar o
 * texto legível em cima.
 *
 * A ordem importa: separação primeiro, leitura depois — o piso de leitura
 * VENCE. Painel discreto demais é decisão de design que ninguém nota;
 * painel com texto ilegível é o bug que estamos consertando, e trocar um
 * pelo outro não seria conserto nenhum. No limite a dose cai a zero e o
 * painel vira o próprio canvas: o pipeline volta ao comportamento de hoje
 * em vez de entregar algo pior.
 */
function tonalizar(
  bg: string,
  text: string,
  base: number,
  make: (dose: number) => string,
): string {
  let dose = base
  let tom = make(dose)
  for (let i = 0; i < 12 && contrastRatio(bg, tom) < SURFACE_MIN_RATIO; i++) {
    dose += base / 2
    tom = make(dose)
  }
  for (let i = 0; i < 12 && contrastRatio(text, tom) < SURFACE_TEXT_MIN; i++) {
    dose *= 0.7
    tom = make(dose)
  }
  return tom
}

/**
 * As duas fórmulas em avaliação (a perdedora sai antes do merge).
 *
 *   luminance — escurece o próprio `bg` no espaço HSL, preservando matiz e
 *               saturação. Previsível em qualquer paleta; é o que o código
 *               já faz para o `accent` quando a paleta é mono.
 *   mix       — puxa o `bg` na direção da cor mais escura da marca. O painel
 *               fica "mais da marca", mas em paleta de dois matizes distantes
 *               o resultado pode sujar o bege.
 */
export type SurfaceFormula = "luminance" | "mix"

/** Doses base de cada nível. A segunda mira a faixa dos #D9D9D9 da biblioteca. */
const SURFACE_DOSE: Record<SurfaceFormula, [number, number]> = {
  luminance: [0.05, 0.11],
  mix: [0.06, 0.14],
}

export function deriveSurfaces(
  bg: string,
  text: string,
  darkest: string,
  formula: SurfaceFormula,
): { surface: string; surface_strong: string } {
  const make =
    formula === "mix"
      ? (dose: number) => mixHex(bg, darkest, Math.min(1, dose))
      : (dose: number) => shiftLuminance(bg, -dose)
  const [d1, d2] = SURFACE_DOSE[formula]
  return {
    surface: tonalizar(bg, text, d1, make),
    surface_strong: tonalizar(bg, text, d2, make),
  }
}

/** Cor mais escura da paleta — origem da mistura. */
function darkest(colors: BrandColor[]): string | undefined {
  if (colors.length === 0) return undefined
  return colors.reduce((acc, c) =>
    relativeLuminance(c.hex) < relativeLuminance(acc.hex) ? c : acc,
  ).hex
}

export function deriveColorRoles(
  primary: BrandColor[] = [],
  secondary: BrandColor[] = [],
  surfaceFormula: SurfaceFormula = "luminance",
): ColorRoles {
  const validPrimary = primary
    .filter((c) => normalizeHex(c.hex))
    .map((c) => ({ ...c, hex: normalizeHex(c.hex) }))
  const validSecondary = secondary
    .filter((c) => normalizeHex(c.hex))
    .map((c) => ({ ...c, hex: normalizeHex(c.hex) }))
  const all = [...validPrimary, ...validSecondary]

  // bg — canvas do email. PRECISA ser claro: o container 600px é branco
  // fixo no reference, então um --bg escuro nunca vira "email dark" — vira
  // faixas pretas nas laterais do email (paleta toda preta/grafite de loja
  // de moda caía exatamente nisso: `lightest()` de cores escuras ainda é
  // escuro, e role "Fundo" capturado do site dark também). Cor resolvida
  // escura → força branco.
  const bgRole =
    findByRole(validPrimary, "Fundo") ?? findByRole(validSecondary, "Fundo")
  const bgCandidate = bgRole?.hex ?? lightest(all)?.hex ?? DEFAULT_BG
  const LIGHT_BG_MIN_LUMINANCE = 0.55
  const bg =
    relativeLuminance(bgCandidate) >= LIGHT_BG_MIN_LUMINANCE
      ? bgCandidate
      : DEFAULT_BG

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

  // Superfícies — derivadas do canvas já resolvido, nunca da paleta crua:
  // o painel tem de ser um degrau do fundo que ele mora, não uma terceira
  // cor solta.
  const { surface, surface_strong } = deriveSurfaces(
    bg,
    text,
    darkest(all) ?? text,
    surfaceFormula,
  )

  return {
    bg,
    text,
    heading,
    button_bg,
    button_text,
    accent,
    surface,
    surface_strong,
  }
}
