/**
 * guards — cinto-e-suspensório do Refinador (fail-open).
 *
 * A aplicação dos deltas já é mecânica (só valores de font-family/weight/
 * tracking, border-radius e espaçamentos mudam; spacers vazios podem ser
 * inseridos entre seções), mas estes checks garantem que NENHUMA violação
 * chega ao email: qualquer guard reprovado → o caller descarta o refinado
 * e mantém o HTML original (as 3 dimensões são atômicas).
 *
 * Módulo puro (zero I/O) — testável.
 */

import { findWhitelistFont } from "./font-whitelist"
import { MAX_SPACER_INSERTS } from "./apply-delta"
import type { RefinerDeltaV2 } from "./apply-delta"

export interface GuardResult {
  ok: boolean
  violations: string[]
}

export interface GuardOpts {
  currentFontHeading?: string | null
  /** Tamanho do inventário de font-family (compat: nome herdado do v1). */
  occurrenceCount: number
  /** Tamanho do inventário de border-radius. */
  radiusOccurrenceCount?: number
  /** Tamanho do inventário de espaçamentos. */
  spacingOccurrenceCount?: number
  /** Quantidade de junções entre seções (inserção de spacer). */
  junctionCount?: number
}

/** textContent normalizado: remove <style>/<script>, tags e colapsa espaços. */
function normalizeText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function attrSet(html: string, attr: "href" | "src"): Set<string> {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "gi")
  const set = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) set.add(m[1])
  return set
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function checkIndexRange(
  violations: string[],
  label: string,
  indices: number[],
  count: number | undefined,
  ceiling: number,
): void {
  if (indices.length > ceiling) {
    violations.push(`${label}_excede_teto:${indices.length}`)
  }
  const max = count ?? 0
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= max) {
      violations.push(`${label}_index_fora_do_range:${idx}`)
    }
  }
}

export function runRefinerGuards(
  before: string,
  after: string,
  delta: RefinerDeltaV2,
  opts: GuardOpts,
): GuardResult {
  const violations: string[] = []
  const { typography, shapes, spacing } = delta

  // 0. Delta bem-formado: índices no range dos inventários, tetos por seção.
  checkIndexRange(
    violations,
    "target",
    typography.targets.map((t) => t.index),
    opts.occurrenceCount,
    12,
  )
  checkIndexRange(
    violations,
    "shapes",
    shapes.targets.map((t) => t.index),
    opts.radiusOccurrenceCount,
    12,
  )
  checkIndexRange(
    violations,
    "spacing_adjust",
    spacing.adjust.map((a) => a.index),
    opts.spacingOccurrenceCount,
    12,
  )
  if (spacing.insert.length > MAX_SPACER_INSERTS) {
    violations.push(`spacing_insert_excede_teto:${spacing.insert.length}`)
  }
  for (const ins of spacing.insert) {
    const max = opts.junctionCount ?? 0
    if (!Number.isInteger(ins.junction) || ins.junction < 0 || ins.junction >= max) {
      violations.push(`spacing_junction_fora_do_range:${ins.junction}`)
    }
  }

  // 1. Texto inalterado (spacers são divs vazios — não adicionam texto).
  if (normalizeText(before) !== normalizeText(after)) {
    violations.push("texto_alterado")
  }

  // 2/3. Links e imagens inalterados.
  if (!setsEqual(attrSet(before, "href"), attrSet(after, "href"))) {
    violations.push("hrefs_alterados")
  }
  if (!setsEqual(attrSet(before, "src"), attrSet(after, "src"))) {
    violations.push("srcs_alterados")
  }

  // 4. Fonte na whitelist, diferente da identidade, e @import presente.
  if (
    typography.strategy !== "none" &&
    typography.strategy !== "mono_weight_contrast" &&
    typography.targets.length > 0
  ) {
    const family = typography.display_font?.family ?? ""
    const entry = findWhitelistFont(family)
    if (!entry) {
      violations.push(`fonte_fora_da_whitelist:${family}`)
    } else {
      const current = (opts.currentFontHeading ?? "").replace(/["']/g, "").trim().toLowerCase()
      if (current && entry.family.toLowerCase() === current) {
        violations.push(`fonte_igual_identidade:${entry.family}`)
      }
      if (!after.includes(`family=${entry.googleParam}`)) {
        violations.push(`import_ausente:${entry.family}`)
      }
    }
  }

  // 5. Output completo.
  if (!/<\/html>\s*$/i.test(after.trim())) {
    violations.push("html_incompleto")
  }

  // 6. Tamanho dentro da faixa (anti-regeneração). Crescimento ganha
  // folga ABSOLUTA além dos 30%: @import + fallback stacks (2KB) e cada
  // spacer inserido (~120 bytes) são adição legítima de tamanho fixo.
  // Encolhimento não ganha folga — conteúdo perdido é perda.
  if (before.length > 0) {
    const growthAllowance = 2000 + spacing.insert.length * 120
    const ratio = after.length / before.length
    const growthOk = after.length <= before.length * 1.3 + growthAllowance
    if (ratio < 0.7 || !growthOk) {
      violations.push(`tamanho_fora_da_faixa:${ratio.toFixed(2)}`)
    }
  }

  return { ok: violations.length === 0, violations }
}
