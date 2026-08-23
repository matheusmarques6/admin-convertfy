/**
 * apply-patches — aplicador determinístico das operações JSON do
 * color_format (o único formatador LLM que restou na cadeia).
 *
 * Vocabulário de ops (enxuto em 20/08 — texto e imagem viraram código):
 *   {action:"replace", find, replace}  → find/replace com `find` ÚNICO no
 *                                        documento (crop params, ajustes
 *                                        pontuais de estilo).
 *   {action:"recolor", from, to,      → troca por VALOR de cor — todas as
 *              where?}                   formas equivalentes (#AABBCC,
 *                                        #abc, rgb/rgba) viram `to`.
 *                                        `where` (opcional) restringe ao
 *                                        papel da ocorrência (background,
 *                                        color, border…); sem ele a troca
 *                                        é global. Atômico: não muda
 *                                        estrutura.
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
import {
  applyRecolor,
  canonicalHex,
  isColorContext,
  isColorLiteral,
  type ColorContext,
} from "./color-inventory"
import { applySplices, type Splice } from "./dom-locator"
import { auditContrast } from "./color-contrast"
import { contrastingText } from "./color-roles"

export type FormatOp =
  | { action: "replace"; find: string; replace: string; block_id?: string }
  | {
      action: "recolor"
      from: string
      to: string
      /** Restringe ao papel da ocorrência; ausente = global. */
      where?: ColorContext
      block_id?: string
    }
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
    // Escopo resolve papel, não legibilidade: mandar o FUNDO e o TEXTO da
    // mesma cor para o mesmo destino produz texto invisível. A segunda op
    // do par é recusada.
    | "contrast_risk"
}

export interface ApplyOpsResult {
  html: string
  applied: number
  skipped: SkippedOp[]
  /**
   * Ocorrências de cor efetivamente trocadas. `applied` conta OPS — uma op
   * que trocou 1 ocorrência valia o mesmo que uma que trocaria 30, e foi
   * por isso que a Luxe Lift saiu com 11 ops "aplicadas" e o email inteiro
   * fora da marca. Este número é o que diz quanto do email virou marca.
   */
  recoloredOccurrences: number
  /**
   * Declarações de cor de TEXTO reescritas para restaurar a legibilidade
   * sobre um fundo que estas ops acabaram de pintar.
   */
  pairedTextFixes: number
  /**
   * Pares texto/fundo que continuam abaixo do mínimo AA depois do conserto
   * — fundo em foto, ou contraste que já estava quebrado antes deste step e
   * não foi causado por ele.
   */
  contrastRemaining: number
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
      let where: { where?: ColorContext } = {}
      if (o.where != null) {
        if (!isColorContext(o.where)) {
          throw new OpsParseError(`op recolor com where inválido: ${String(o.where)}`, raw)
        }
        where = { where: o.where }
      }
      out.push({ action: "recolor", from: o.from, to: o.to, ...where, ...bid })
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
  const recolors: Array<{
    op: FormatOp
    from: string
    to: string
    where?: ColorContext
  }> = []

  const hero = extractHeroBySentinels(doc)
  const intersectsHero = (start: number, end: number): boolean => {
    if (opts.allowHero || !hero) return false
    return start < hero.end && end > hero.start
  }

  for (const op of ops) {
    if (op.action === "recolor") {
      // Global e atômico por natureza; a hero entra de propósito (recolor
      // nunca muda estrutura, e o botão da hero pertence à paleta).
      recolors.push({
        op,
        from: op.from,
        to: op.to,
        ...(op.where ? { where: op.where } : {}),
      })
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
  //
  // Guard de contraste: escopo separa papéis, mas não garante que dê pra
  // ler. O caso catastrófico é o FUNDO e o TEXTO da mesma cor de origem
  // caírem no mesmo destino — aí a seção inteira fica de uma cor só e a
  // copy some. Recusa a segunda op do par (a primeira já vale) em vez de
  // entregar um email invisível.
  const destinoPorOrigem = new Map<string, string>()
  /** Destinos que ESTE step pintou — escopo do conserto de par abaixo. */
  const pintados = new Set<string>()
  const isPar = (a: ColorContext | undefined, b: string): boolean =>
    (a === "background" && b === "color") || (a === "color" && b === "background")

  let out = res.html
  let recoloredOccurrences = 0
  for (const r of recolors) {
    const chaveOrigem = r.from.toUpperCase()
    const conflito = Array.from(destinoPorOrigem.entries()).find(
      ([k, v]) =>
        k.startsWith(chaveOrigem) &&
        v === r.to.toUpperCase() &&
        isPar(r.where, k.slice(chaveOrigem.length + 1)),
    )
    if (conflito) {
      skipped.push({ op: r.op, reason: "contrast_risk" })
      continue
    }

    const rc = applyRecolor(out, r.from, r.to, r.where)
    if (rc.replaced === 0) {
      skipped.push({ op: r.op, reason: "find_not_found" })
      continue
    }
    out = rc.html
    recoloredOccurrences += rc.replaced
    destinoPorOrigem.set(`${chaveOrigem}:${r.where ?? "global"}`, r.to.toUpperCase())
    pintados.add(canonicalHex(r.to))
    applied++
  }

  // ── Conserto do PAR ────────────────────────────────────────────────
  //
  // O recolor troca por VALOR e o agente não vê o documento: ele não tem
  // como saber o que pousa sobre o fundo que acabou de pintar. Na Luxe Lift
  // (22/08) uma op legítima (`#BEBEBE → #FAF5F3` no fundo de um botão)
  // deixou o `color:#FFFFFF` do rótulo intacto — contraste 1,05:1, texto
  // invisível, e `skipped` vazio porque o guard acima só pega o par
  // mesma-origem/mesmo-destino.
  //
  // Aqui o código mede de verdade (luminância WCAG) e conserta o texto em
  // cima. Escopo deliberado: só ocorrências cujo fundo efetivo é um destino
  // QUE ESTAS OPS PINTARAM. Contraste que já estava ruim antes não é
  // problema deste step consertar em silêncio — vira issue do render-check.
  let pairedTextFixes = 0
  const findings = auditContrast(out)
  const consertar = findings
    .filter((f) => f.bgHex && f.ratio != null && pintados.has(f.bgHex))
    // De trás pra frente: cada splice só desloca offsets maiores que ele.
    .sort((a, b) => b.offset - a.offset)
  for (const f of consertar) {
    const novo = contrastingText(f.bgHex as string)
    out = out.slice(0, f.offset) + novo + out.slice(f.offset + f.textHex.length)
    pairedTextFixes++
  }

  const contrastRemaining = pairedTextFixes
    ? auditContrast(out).filter((f) => f.ratio != null).length
    : findings.filter((f) => f.ratio != null).length

  return {
    html: out,
    applied,
    skipped,
    recoloredOccurrences,
    pairedTextFixes,
    contrastRemaining,
  }
}
