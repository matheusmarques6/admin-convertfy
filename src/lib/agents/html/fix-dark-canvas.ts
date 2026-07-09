/**
 * Correção cirúrgica do canvas escuro em HTML de email JÁ GERADO (legado).
 *
 * Contexto: até o guard de luminance em `deriveColorRoles` (color-roles.ts),
 * lojas com paleta toda escura recebiam `--bg` escuro — o canvas em volta do
 * container 600px branco virava faixas pretas nas laterais. O guard corrige
 * gerações novas; emails antigos ficam com o HTML contaminado no banco.
 *
 * Este transform troca APENAS a cor do canvas por branco, sem tocar em
 * copy, imagens, botões ou seções:
 *   1. Declarações `--bg: #escuro` (root vars) → `--bg: #FFFFFF`.
 *   2. `background`/`background-color`/`bgcolor` escuros na tag <body>.
 *   3. `background-color`/`bgcolor` com o MESMO hex escuro do canvas em
 *      tabelas full-width (width="100%") — o wrapper externo do email.
 *      Restrito ao hex do canvas pra nunca clarear um footer/section escuro
 *      intencional que use outra cor.
 *
 * Botões/CTAs pretos ficam intactos: vivem em <td>/<a> dentro do container,
 * fora dos três contextos acima.
 */

import { relativeLuminance } from "./color-roles"

const DARK_LUMINANCE_MAX = 0.55
const WHITE = "#FFFFFF"

const HEX_PATTERN = "#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})"

function isDark(hex: string): boolean {
  return relativeLuminance(hex) < DARK_LUMINANCE_MAX
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export interface FixDarkCanvasResult {
  html: string
  changed: boolean
  /** Hexes escuros de canvas encontrados e substituídos. */
  replaced_hexes: string[]
}

export function fixDarkCanvas(html: string): FixDarkCanvasResult {
  if (!html) return { html, changed: false, replaced_hexes: [] }

  let out = html
  const replaced = new Set<string>()

  // ── 1. Declarações --bg escuras ────────────────────────────────────
  out = out.replace(
    new RegExp(`(--bg\\s*:\\s*)(${HEX_PATTERN})`, "g"),
    (full, prefix: string, hex: string) => {
      if (!isDark(hex)) return full
      replaced.add(hex.toUpperCase())
      return `${prefix}${WHITE}`
    },
  )

  // ── 2. Canvas na tag <body> ────────────────────────────────────────
  const bodyTagMatch = out.match(/<body[^>]*>/i)
  if (bodyTagMatch) {
    const original = bodyTagMatch[0]
    const fixed = original
      .replace(
        new RegExp(`(background(?:-color)?\\s*:\\s*)(${HEX_PATTERN})`, "gi"),
        (full, prefix: string, hex: string) => {
          if (!isDark(hex)) return full
          replaced.add(hex.toUpperCase())
          return `${prefix}${WHITE}`
        },
      )
      .replace(
        new RegExp(`(bgcolor\\s*=\\s*["'])(${HEX_PATTERN})(["'])`, "gi"),
        (full, prefix: string, hex: string, suffix: string) => {
          if (!isDark(hex)) return full
          replaced.add(hex.toUpperCase())
          return `${prefix}${WHITE}${suffix}`
        },
      )
    if (fixed !== original) out = out.replace(original, fixed)
  }

  // ── 3. Wrapper full-width com o MESMO hex do canvas ───────────────
  // Só roda quando já identificamos hex(es) de canvas nos passos 1-2 —
  // nunca escurece/clareia seções que usam outras cores escuras.
  if (replaced.size > 0) {
    const canvasHexes = [...replaced]
    out = out.replace(/<table[^>]*>/gi, (tag) => {
      if (!/width\s*=\s*["']100%["']/i.test(tag)) return tag
      let fixedTag = tag
      for (const hex of canvasHexes) {
        const esc = escapeRegExp(hex)
        fixedTag = fixedTag
          .replace(
            new RegExp(`(background(?:-color)?\\s*:\\s*)${esc}`, "gi"),
            `$1${WHITE}`,
          )
          .replace(
            new RegExp(`(bgcolor\\s*=\\s*["'])${esc}(["'])`, "gi"),
            `$1${WHITE}$2`,
          )
      }
      return fixedTag
    })
  }

  return {
    html: out,
    changed: replaced.size > 0,
    replaced_hexes: [...replaced],
  }
}
