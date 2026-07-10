/**
 * guards — cinto-e-suspensório do Refinador Tipográfico (fail-open).
 *
 * A aplicação do delta já é mecânica (apenas valores de font-family/
 * weight/tracking mudam), mas estes checks garantem que NENHUMA violação
 * chega ao email: qualquer guard reprovado → o caller descarta o refinado
 * e mantém o HTML original.
 *
 * Módulo puro (zero I/O) — testável.
 */

import { findWhitelistFont } from "./font-whitelist"
import type { RefinerDelta } from "./apply-delta"

export interface GuardResult {
  ok: boolean
  violations: string[]
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

export function runRefinerGuards(
  before: string,
  after: string,
  delta: RefinerDelta,
  opts: { currentFontHeading?: string | null; occurrenceCount: number },
): GuardResult {
  const violations: string[] = []

  // 0. Delta bem-formado: índices no range do inventário, teto de targets.
  if (delta.targets.length > 12) {
    violations.push(`targets_excede_teto:${delta.targets.length}`)
  }
  for (const t of delta.targets) {
    if (!Number.isInteger(t.index) || t.index < 0 || t.index >= opts.occurrenceCount) {
      violations.push(`target_index_fora_do_range:${t.index}`)
    }
  }

  // 1. Texto inalterado.
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
  if (delta.strategy !== "none" && delta.strategy !== "mono_weight_contrast") {
    const family = delta.display_font?.family ?? ""
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
  // folga ABSOLUTA de 2KB além dos 30%: o @import + fallback stacks são
  // adição legítima de tamanho fixo e estourariam o percentual em emails
  // curtos. Encolhimento não ganha folga — conteúdo perdido é perda.
  if (before.length > 0) {
    const ratio = after.length / before.length
    const growthOk = after.length <= before.length * 1.3 + 2000
    if (ratio < 0.7 || !growthOk) {
      violations.push(`tamanho_fora_da_faixa:${ratio.toFixed(2)}`)
    }
  }

  return { ok: violations.length === 0, violations }
}
