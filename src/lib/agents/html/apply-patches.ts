/**
 * apply-patches — aplicador determinístico das operações JSON emitidas
 * pelos agentes image_format e color_format (split do HTML agent).
 *
 * Vocabulário de ops:
 *   {action:"img", tag, url, alt?}     → troca o token {{TAG}} pela URL
 *                                        (e {{TAG_ALT}} pelo alt, se vier).
 *   {action:"remove_slot", tag}        → remove a <tr> que envolve o token
 *                                        {{TAG}} (slot sem imagem gerada).
 *   {action:"replace", find, replace}  → find/replace com `find` ÚNICO no
 *                                        documento (logo no lugar de texto
 *                                        estilizado, crop params, cores).
 *
 * Regras de segurança (nunca corrompem o documento):
 *   - op cujo alcance intersecta a região sentinelada da hero é rejeitada
 *     quando allowHero=false (agente de imagem); o color_format passa
 *     allowHero=true (o botão da hero também entra na paleta).
 *   - `find` ambíguo (0 ou 2+ ocorrências) → op pulada e telemetrizada.
 *   - remove_slot só remove quando a <tr> envolvente é balanceada e não
 *     contém outro token de imagem; senão deixa o token (o
 *     stripUnresolvedPlaceholders limpa no fim da cadeia).
 *
 * Puro (zero deps de server) — testável.
 */

import { extractHeroBySentinels } from "./hero-locator"

export type FormatOp =
  | { action: "img"; tag: string; url: string; alt?: string }
  | { action: "remove_slot"; tag: string }
  | { action: "replace"; find: string; replace: string }

export class OpsParseError extends Error {
  readonly raw: string
  constructor(message: string, raw = "") {
    super(message)
    this.name = "OpsParseError"
    this.raw = raw
  }
}

export interface SkippedOp {
  op: FormatOp
  reason:
    | "tag_not_found"
    | "find_not_found"
    | "find_ambiguous"
    | "hero_protected"
    | "row_not_removable"
}

export interface ApplyOpsResult {
  html: string
  applied: number
  skipped: SkippedOp[]
}

/** Extrai o objeto {"ops":[...]} do output do LLM. Lança OpsParseError. */
export function parseOps(raw: string): FormatOp[] {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) {
    throw new OpsParseError("output sem objeto JSON", raw)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    throw new OpsParseError("JSON inválido", raw)
  }
  const ops = (parsed as { ops?: unknown })?.ops
  if (!Array.isArray(ops)) {
    throw new OpsParseError('JSON sem array "ops"', raw)
  }
  const out: FormatOp[] = []
  for (const op of ops) {
    if (!op || typeof op !== "object") {
      throw new OpsParseError("op não é objeto", raw)
    }
    const o = op as Record<string, unknown>
    if (o.action === "img") {
      if (typeof o.tag !== "string" || typeof o.url !== "string" || !o.url) {
        throw new OpsParseError("op img sem tag/url", raw)
      }
      out.push({
        action: "img",
        tag: normalizeTag(o.tag),
        url: o.url,
        ...(typeof o.alt === "string" && o.alt ? { alt: o.alt } : {}),
      })
    } else if (o.action === "remove_slot") {
      if (typeof o.tag !== "string" || !o.tag) {
        throw new OpsParseError("op remove_slot sem tag", raw)
      }
      out.push({ action: "remove_slot", tag: normalizeTag(o.tag) })
    } else if (o.action === "replace") {
      if (
        typeof o.find !== "string" ||
        !o.find ||
        typeof o.replace !== "string"
      ) {
        throw new OpsParseError("op replace sem find/replace", raw)
      }
      out.push({ action: "replace", find: o.find, replace: o.replace })
    } else {
      throw new OpsParseError(`action desconhecida: ${String(o.action)}`, raw)
    }
  }
  return out
}

/** Aceita "HERO_IMAGE", "{{HERO_IMAGE}}" e "{{ HERO_IMAGE }}". */
function normalizeTag(tag: string): string {
  return tag.replace(/[{}\s]/g, "")
}

function tokenRegex(tag: string): RegExp {
  return new RegExp(`\\{\\{\\s*${escapeRegExp(tag)}\\s*\\}\\}`, "g")
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function findAll(html: string, re: RegExp): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  for (const m of html.matchAll(re)) {
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })
  }
  return out
}

/**
 * Aplica as ops em sequência. Cada op reavalia o documento atual (as
 * posições mudam a cada aplicação); a região da hero é recalculada pelas
 * sentinelas a cada passo.
 */
export function applyOps(
  html: string,
  ops: FormatOp[],
  opts: { allowHero: boolean },
): ApplyOpsResult {
  let doc = html
  let applied = 0
  const skipped: SkippedOp[] = []

  const heroRange = (): { start: number; end: number } | null => {
    const region = extractHeroBySentinels(doc)
    return region ? { start: region.start, end: region.end } : null
  }
  const intersectsHero = (start: number, end: number): boolean => {
    if (opts.allowHero) return false
    const hero = heroRange()
    if (!hero) return false
    return start < hero.end && end > hero.start
  }

  for (const op of ops) {
    if (op.action === "img") {
      const spots = findAll(doc, tokenRegex(op.tag))
      if (spots.length === 0) {
        skipped.push({ op, reason: "tag_not_found" })
        continue
      }
      if (spots.some((s) => intersectsHero(s.start, s.end))) {
        skipped.push({ op, reason: "hero_protected" })
        continue
      }
      doc = doc.replace(tokenRegex(op.tag), op.url)
      if (op.alt) {
        doc = doc.replace(tokenRegex(`${op.tag}_ALT`), op.alt)
      }
      applied++
    } else if (op.action === "remove_slot") {
      const spots = findAll(doc, tokenRegex(op.tag))
      if (spots.length === 0) {
        skipped.push({ op, reason: "tag_not_found" })
        continue
      }
      const spot = spots[0]
      if (intersectsHero(spot.start, spot.end)) {
        skipped.push({ op, reason: "hero_protected" })
        continue
      }
      const row = enclosingRow(doc, spot.start, spot.end, op.tag)
      if (!row || intersectsHero(row.start, row.end)) {
        skipped.push({ op, reason: "row_not_removable" })
        continue
      }
      doc = doc.slice(0, row.start) + doc.slice(row.end)
      applied++
    } else {
      const idx = doc.indexOf(op.find)
      if (idx === -1) {
        skipped.push({ op, reason: "find_not_found" })
        continue
      }
      if (doc.indexOf(op.find, idx + 1) !== -1) {
        skipped.push({ op, reason: "find_ambiguous" })
        continue
      }
      if (intersectsHero(idx, idx + op.find.length)) {
        skipped.push({ op, reason: "hero_protected" })
        continue
      }
      doc = doc.slice(0, idx) + op.replace + doc.slice(idx + op.find.length)
      applied++
    }
  }

  return { html: doc, applied, skipped }
}

// Token de imagem canônico ({{X_IMAGE}}, {{X_THUMB_2}}...) — pra impedir que
// remove_slot leve junto o slot de OUTRA imagem que viva na mesma <tr>.
const IMAGE_TOKEN = /\{\{\s*[A-Z][A-Z0-9_]*(?:IMAGE|THUMB)[A-Z0-9_]*\s*\}\}/g

/**
 * <tr> envolvente do token, validada: balanceada (sem <tr> aninhada no
 * meio) e sem OUTRO token de imagem dentro (o {{TAG_ALT}} companheiro do
 * slot removido é permitido). null → não removível.
 */
function enclosingRow(
  doc: string,
  tokenStart: number,
  tokenEnd: number,
  tag: string,
): { start: number; end: number } | null {
  const openRe = /<tr\b[^>]*>/gi
  let rowStart = -1
  for (const m of doc.matchAll(openRe)) {
    const idx = m.index ?? 0
    if (idx >= tokenStart) break
    rowStart = idx
  }
  if (rowStart === -1) return null

  const closeIdx = doc.indexOf("</tr>", tokenEnd)
  if (closeIdx === -1) return null
  const rowEnd = closeIdx + "</tr>".length

  const region = doc.slice(rowStart, rowEnd)
  // Aninhamento: exatamente uma abertura e um fechamento de <tr> na região.
  const opens = (region.match(/<tr\b/gi) ?? []).length
  const closes = (region.match(/<\/tr\s*>/gi) ?? []).length
  if (opens !== 1 || closes !== 1) return null

  // A <tr> não pode carregar OUTRO token de imagem além do removido
  // (e seu {{TAG_ALT}} companheiro).
  const allowed = new Set([tag, `${tag}_ALT`])
  const tokens = region.match(IMAGE_TOKEN) ?? []
  const foreign = tokens.filter((t) => !allowed.has(t.replace(/[{}\s]/g, "")))
  if (foreign.length > 0) return null

  return { start: rowStart, end: rowEnd }
}
