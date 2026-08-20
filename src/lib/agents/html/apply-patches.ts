/**
 * apply-patches — aplicador determinístico das operações JSON do
 * color_format (o único formatador LLM que restou na cadeia).
 *
 * Vocabulário de ops (enxuto em 20/08 — texto e imagem viraram código):
 *   {action:"replace", find, replace}  → find/replace com `find` ÚNICO no
 *                                        documento (crop params, ajustes
 *                                        pontuais de estilo).
 *   {action:"recolor", from, to}       → troca GLOBAL por VALOR de cor —
 *                                        todas as formas equivalentes
 *                                        (#AABBCC, #abc, rgb/rgba) viram
 *                                        `to`. Atômico: não muda estrutura.
 *
 * Regras de segurança (nunca corrompem o documento):
 *   - op replace cujo alcance intersecta a região sentinelada da hero é
 *     rejeitada quando allowHero=false (o color_format passa true — o
 *     botão da hero também entra na paleta).
 *   - `find` ambíguo (0 ou 2+ ocorrências) → op pulada e telemetrizada.
 *   - splices sobrepostos: o da direita vence, o outro é rejeitado.
 *
 * Puro (zero deps de server) — testável.
 */

import { extractHeroBySentinels } from "./hero-locator"
import { applyRecolor, isColorLiteral } from "./color-inventory"
import { applySplices, type Splice } from "./dom-locator"

export type FormatOp =
  | { action: "replace"; find: string; replace: string; block_id?: string }
  | { action: "recolor"; from: string; to: string; block_id?: string }
// block_id (opcional): amarra a op ao email_blocks.id de origem — a MESMA
// chave do callback do n8n. Não muda a aplicação; existe pra telemetria.

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
    | "find_not_found"
    | "find_ambiguous"
    | "hero_protected"
    // Duas ops disputam a mesma região do documento: a da direita vence; a
    // outra é rejeitada em vez de corromper o documento.
    | "overlapping_edit"
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
    const bid: { block_id?: string } =
      typeof o.block_id === "string" && o.block_id ? { block_id: o.block_id } : {}
    if (o.action === "recolor") {
      if (
        typeof o.from !== "string" ||
        typeof o.to !== "string" ||
        !isColorLiteral(o.from) ||
        !isColorLiteral(o.to)
      ) {
        throw new OpsParseError("op recolor com from/to não-cor", raw)
      }
      out.push({ action: "recolor", from: o.from, to: o.to, ...bid })
    } else if (o.action === "replace") {
      if (
        typeof o.find !== "string" ||
        !o.find ||
        typeof o.replace !== "string"
      ) {
        throw new OpsParseError("op replace sem find/replace", raw)
      }
      out.push({ action: "replace", find: o.find, replace: o.replace, ...bid })
    } else {
      // img/set_text/remove_slot/remove_row morreram com o merge por código
      // (20/08) — um prompt antigo que ainda as emita é erro de config.
      throw new OpsParseError(`action desconhecida: ${String(o.action)}`, raw)
    }
  }
  return out
}

/**
 * Aplica as ops contra um SNAPSHOT IMUTÁVEL do documento (todo endereço é
 * resolvido no HTML que o agente viu); as edições viram splices aplicados
 * de trás pra frente — offsets não se invalidam entre si.
 */
export function applyOps(
  html: string,
  ops: FormatOp[],
  opts: { allowHero: boolean },
): ApplyOpsResult {
  const doc = html
  let applied = 0
  const skipped: SkippedOp[] = []
  const splices: Array<Splice & { op: FormatOp }> = []
  const recolors: Array<{ op: FormatOp; from: string; to: string }> = []

  const hero = extractHeroBySentinels(doc)
  const intersectsHero = (start: number, end: number): boolean => {
    if (opts.allowHero || !hero) return false
    return start < hero.end && end > hero.start
  }

  for (const op of ops) {
    if (op.action === "recolor") {
      // Global e atômico por natureza; a hero entra de propósito (recolor
      // nunca muda estrutura, e o botão da hero pertence à paleta).
      recolors.push({ op, from: op.from, to: op.to })
      continue
    }
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
    splices.push({
      op,
      start: idx,
      end: idx + op.find.length,
      replacement: op.replace,
    })
    applied++
  }

  // Aplica todas as edições de uma vez, de trás pra frente. Edições que se
  // sobrepõem são rejeitadas em vez de corromper o documento.
  const res = applySplices(doc, splices)
  const rejectedOps = new Set(
    res.rejected.map((r) => (r as Splice & { op: FormatOp }).op),
  )
  for (const op of rejectedOps) {
    skipped.push({ op, reason: "overlapping_edit" })
    applied--
  }

  // Recolors por último: troca por VALOR, não compete por posição.
  let out = res.html
  for (const r of recolors) {
    const rc = applyRecolor(out, r.from, r.to)
    if (rc.replaced === 0) {
      skipped.push({ op: r.op, reason: "find_not_found" })
      continue
    }
    out = rc.html
    applied++
  }

  return { html: out, applied, skipped }
}
