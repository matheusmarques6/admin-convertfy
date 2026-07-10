/**
 * font-whitelist — fontes de DISPLAY aprovadas para o Refinador Tipográfico.
 *
 * Curadoria por TOM (estudo tipográfico dos 5 templates Figma, jul/2026):
 * a fonte de display (nome da marca, headline do herói, preços, depoimentos)
 * é a "voz da marca" — serifada = luxo/tradição/devoção; sans com
 * personalidade = moda moderna; mono-fonte com contraste de peso =
 * clínico/minimalista. Todas EXISTEM no Google Fonts (o @import css2 é
 * gerado daqui) e têm fallback stack email-safe para clientes que bloqueiam
 * fontes remotas.
 *
 * Módulo puro (zero I/O) — testável e importável pelo prompt seed.
 */

export type FontTone =
  | "luxury_serif"
  | "modern_sans"
  | "editorial"
  | "warm_serif"
  | "minimal_functional"

export interface WhitelistFont {
  family: string
  tone: FontTone
  availableWeights: number[]
  /** Stack anexada após a família: clientes sem a webfont degradam bem. */
  fallbackStack: string
  /** Param `family=` da URL css2 (espaços viram +). */
  googleParam: string
}

const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif"
const SANS_FALLBACK = "Arial, Helvetica, sans-serif"

const font = (
  family: string,
  tone: FontTone,
  availableWeights: number[],
  fallbackStack: string,
): WhitelistFont => ({
  family,
  tone,
  availableWeights,
  fallbackStack,
  googleParam: family.replace(/ /g, "+"),
})

export const FONT_WHITELIST: readonly WhitelistFont[] = [
  // ── Luxo / tradição / devoção (serifadas) ─────────────────────────
  font("Playfair Display", "luxury_serif", [400, 500, 600, 700, 800, 900], SERIF_FALLBACK),
  font("Cormorant Garamond", "luxury_serif", [300, 400, 500, 600, 700], SERIF_FALLBACK),
  font("EB Garamond", "luxury_serif", [400, 500, 600, 700, 800], SERIF_FALLBACK),
  font("DM Serif Display", "luxury_serif", [400], SERIF_FALLBACK),
  font("Fraunces", "luxury_serif", [300, 400, 500, 600, 700, 800, 900], SERIF_FALLBACK),
  font("Libre Caslon Text", "luxury_serif", [400, 700], SERIF_FALLBACK),
  font("Marcellus", "luxury_serif", [400], SERIF_FALLBACK),
  font("Prata", "luxury_serif", [400], SERIF_FALLBACK),
  // ── Moda moderna / tech (sans com personalidade) ──────────────────
  font("Red Hat Display", "modern_sans", [300, 400, 500, 600, 700, 800, 900], SANS_FALLBACK),
  font("Sora", "modern_sans", [200, 300, 400, 500, 600, 700, 800], SANS_FALLBACK),
  font("Space Grotesk", "modern_sans", [300, 400, 500, 600, 700], SANS_FALLBACK),
  font("Outfit", "modern_sans", [200, 300, 400, 500, 600, 700, 800, 900], SANS_FALLBACK),
  font("Manrope", "modern_sans", [200, 300, 400, 500, 600, 700, 800], SANS_FALLBACK),
  font("Syne", "modern_sans", [400, 500, 600, 700, 800], SANS_FALLBACK),
  font("Unbounded", "modern_sans", [200, 300, 400, 500, 600, 700, 800, 900], SANS_FALLBACK),
  // ── Editorial ──────────────────────────────────────────────────────
  font("Archivo", "editorial", [200, 300, 400, 500, 600, 700, 800], SANS_FALLBACK),
  font("Libre Franklin", "editorial", [200, 300, 400, 500, 600, 700, 800, 900], SANS_FALLBACK),
  font("Newsreader", "editorial", [300, 400, 500, 600, 700, 800], SERIF_FALLBACK),
  font("Bitter", "editorial", [200, 300, 400, 500, 600, 700, 800, 900], SERIF_FALLBACK),
  font("Source Serif 4", "editorial", [300, 400, 500, 600, 700], SERIF_FALLBACK),
  // ── Serifadas quentes / humanas ────────────────────────────────────
  font("Lora", "warm_serif", [400, 500, 600, 700], SERIF_FALLBACK),
  font("Crimson Pro", "warm_serif", [300, 400, 500, 600, 700, 800], SERIF_FALLBACK),
  // ── Funcionais (para mono_weight_contrast — reforçar pesos) ───────
  font("Montserrat", "minimal_functional", [200, 300, 400, 500, 600, 700, 800], SANS_FALLBACK),
  font("Inter", "minimal_functional", [200, 300, 400, 500, 600, 700, 800], SANS_FALLBACK),
  font("IBM Plex Sans", "minimal_functional", [200, 300, 400, 500, 600, 700], SANS_FALLBACK),
  font("Figtree", "minimal_functional", [300, 400, 500, 600, 700, 800, 900], SANS_FALLBACK),
]

const TONE_LABEL: Record<FontTone, string> = {
  luxury_serif: "Luxo / tradição / devoção (serifadas)",
  modern_sans: "Moda moderna / streetwear / tech (sans com personalidade)",
  editorial: "Editorial / conteúdo",
  warm_serif: "Quente / humano / artesanal (serifadas suaves)",
  minimal_functional: "Funcional / clínico / minimalista (para contraste de peso)",
}

/** Busca case-insensitive, tolerante a aspas e espaços extras. */
export function findWhitelistFont(family: string): WhitelistFont | null {
  const normalized = family.replace(/["']/g, "").trim().toLowerCase()
  if (!normalized) return null
  return (
    FONT_WHITELIST.find((f) => f.family.toLowerCase() === normalized) ?? null
  )
}

/**
 * URL @import do Google Fonts css2 para a fonte, restrita aos weights
 * disponíveis. weights vazio/inválido → [400, 700].
 */
export function buildGoogleFontsImport(
  fontEntry: WhitelistFont,
  weights: number[],
): string {
  const valid = Array.from(
    new Set(weights.filter((w) => fontEntry.availableWeights.includes(w))),
  ).sort((a, b) => a - b)
  const finalWeights = valid.length > 0 ? valid : [400, 700]
  return `@import url('https://fonts.googleapis.com/css2?family=${fontEntry.googleParam}:wght@${finalWeights.join(";")}&display=swap');`
}

/** Whitelist agrupada por tom, em texto — embutida no prompt do Refinador. */
export function renderWhitelistForPrompt(): string {
  const byTone = new Map<FontTone, WhitelistFont[]>()
  for (const f of FONT_WHITELIST) {
    const arr = byTone.get(f.tone) ?? []
    arr.push(f)
    byTone.set(f.tone, arr)
  }
  const lines: string[] = []
  for (const [tone, fonts] of byTone) {
    lines.push(`- ${TONE_LABEL[tone]}: ${fonts.map((f) => f.family).join(", ")}`)
  }
  return lines.join("\n")
}
