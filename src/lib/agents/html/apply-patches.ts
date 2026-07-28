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
import { applyRecolor, isColorLiteral } from "./color-inventory"
import {
  enclosingRow as locateEnclosingRow,
  locateSlots,
} from "./dom-locator"

export type FormatOp =
  | { action: "img"; tag: string; url: string; alt?: string; block_id?: string }
  | { action: "remove_slot"; tag: string; block_id?: string }
  | { action: "replace"; find: string; replace: string; block_id?: string }
  // ── Fase A (arquitetura por slots) ─────────────────────────────────
  // set_text: troca TODAS as ocorrências de {{TAG}} pelo texto (tags se
  // repetem legitimamente em branches MSO). remove_row: remove a <tr> do
  // slot de TEXTO vazio (mesma validação do remove_slot).
  | { action: "set_text"; tag: string; value: string; block_id?: string }
  | { action: "remove_row"; tag: string; block_id?: string }
  // ── Arquitetura por views (F4, color_format) ───────────────────────
  // recolor: troca GLOBAL por VALOR de cor — todas as formas textuais
  // equivalentes (#AABBCC, #abc, rgb/rgba) viram `to`. Atômico: não tem
  // como quebrar estrutura HTML. from/to validados como literais de cor.
  | { action: "recolor"; from: string; to: string; block_id?: string }
// block_id (opcional em toda op): amarra a op ao email_blocks.id de origem —
// a MESMA chave do callback do n8n. Não muda a aplicação (que é por tag);
// existe pra telemetria/auditoria ponta a ponta (n8n → view → op → HTML).
// Ops sem o campo continuam válidas (retrocompat com prompts/replays antigos).

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
    // Matriz de posse (Fase A): op numa tag fora da alçada do estágio.
    | "ownership_rejected"
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
    if (o.action === "img") {
      if (typeof o.tag !== "string" || typeof o.url !== "string" || !o.url) {
        throw new OpsParseError("op img sem tag/url", raw)
      }
      out.push({
        action: "img",
        tag: normalizeTag(o.tag),
        url: o.url,
        ...(typeof o.alt === "string" && o.alt ? { alt: o.alt } : {}),
        ...bid,
      })
    } else if (o.action === "remove_slot") {
      if (typeof o.tag !== "string" || !o.tag) {
        throw new OpsParseError("op remove_slot sem tag", raw)
      }
      out.push({ action: "remove_slot", tag: normalizeTag(o.tag), ...bid })
    } else if (o.action === "set_text") {
      if (typeof o.tag !== "string" || !o.tag || typeof o.value !== "string") {
        throw new OpsParseError("op set_text sem tag/value", raw)
      }
      out.push({ action: "set_text", tag: normalizeTag(o.tag), value: o.value, ...bid })
    } else if (o.action === "remove_row") {
      if (typeof o.tag !== "string" || !o.tag) {
        throw new OpsParseError("op remove_row sem tag", raw)
      }
      out.push({ action: "remove_row", tag: normalizeTag(o.tag), ...bid })
    } else if (o.action === "recolor") {
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
  opts: {
    allowHero: boolean
    /**
     * Matriz de posse (Fase A): quando presente, ops com tag só aplicam se
     * a tag está na alçada do estágio — fora dela → ownership_rejected.
     * Ops replace (find/replace, sem tag) não passam por esta checagem.
     */
    allowedTags?: ReadonlySet<string>
  },
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
    // Posse por tag (Fase A): vale para toda op ancorada em tag
    // (replace e recolor não têm tag — ficam fora da matriz).
    if (
      op.action !== "replace" &&
      op.action !== "recolor" &&
      opts.allowedTags &&
      !opts.allowedTags.has(op.tag)
    ) {
      skipped.push({ op, reason: "ownership_rejected" })
      continue
    }
    if (op.action === "recolor") {
      // Global e atômico por natureza; a matriz de posse por tag não se
      // aplica (op sem tag) e a hero entra de propósito (allowHero do
      // color_format é true; recolor nunca muda estrutura).
      const r = applyRecolor(doc, op.from, op.to)
      if (r.replaced === 0) {
        skipped.push({ op, reason: "find_not_found" })
        continue
      }
      doc = r.html
      applied++
    } else if (op.action === "img" || op.action === "set_text") {
      const spots = findAll(doc, tokenRegex(op.tag))
      if (spots.length === 0) {
        skipped.push({ op, reason: "tag_not_found" })
        continue
      }
      if (spots.some((s) => intersectsHero(s.start, s.end))) {
        skipped.push({ op, reason: "hero_protected" })
        continue
      }
      if (op.action === "img") {
        const url = op.url
        doc = doc.replace(tokenRegex(op.tag), () => url)
        if (op.alt) {
          const alt = op.alt
          doc = doc.replace(tokenRegex(`${op.tag}_ALT`), () => alt)
        }
      } else {
        // Texto plano no lugar do token: neutraliza < e > pra copy nunca
        // injetar markup (entidades existentes ficam como estão). Função
        // no replace: valor com "$" (R$ 100) nunca vira grupo de captura.
        const safe = op.value.replace(/</g, "&lt;").replace(/>/g, "&gt;")
        doc = doc.replace(tokenRegex(op.tag), () => safe)
      }
      applied++
    } else if (op.action === "remove_slot" || op.action === "remove_row") {
      // Âncora do slot pelo MESMO localizador que monta a view do agente
      // (dom-locator): a ocorrência ancorada na árvore vence a que vive em
      // conditional comment do Outlook. Pegar a primeira ocorrência TEXTUAL
      // fazia o aplicador mirar no branch MSO enquanto o agente julgava a
      // linha real — view e edição divergiam.
      const anchor = locateSlots(doc, [op.tag]).get(normalizeTag(op.tag))
      if (!anchor) {
        skipped.push({ op, reason: "tag_not_found" })
        continue
      }
      const spot = anchor.token
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
 * <tr> envolvente do token — resolvida pela ÁRVORE (parse5 com posição de
 * origem), não por contagem de tags. A heurística anterior contava
 * `<tr>`/`</tr>` numa fatia de texto e, em tabela aninhada (a norma nos
 * componentes da biblioteca), ou desistia (`row_not_removable`) ou pegava
 * a linha EXTERNA e removia a seção vizinha inteira.
 *
 * Continua validando que a linha não carrega OUTRO token de imagem além do
 * removido (o `{{TAG_ALT}}` companheiro é permitido). null → não removível
 * (inclusive quando o token vive em conditional comment do Outlook, onde
 * não existe linha na árvore — recusar é correto, adivinhar não).
 */
function enclosingRow(
  doc: string,
  tokenStart: number,
  tokenEnd: number,
  tag: string,
): { start: number; end: number } | null {
  void tokenEnd // a âncora é o início do token; a árvore resolve o resto
  const row = locateEnclosingRow(doc, tokenStart)
  if (!row) return null
  const { start: rowStart, end: rowEnd } = row

  const region = doc.slice(rowStart, rowEnd)

  // A <tr> não pode carregar OUTRO token de imagem além do removido
  // (e seu {{TAG_ALT}} companheiro).
  const allowed = new Set([tag, `${tag}_ALT`])
  const tokens = region.match(IMAGE_TOKEN) ?? []
  const foreign = tokens.filter((t) => !allowed.has(t.replace(/[{}\s]/g, "")))
  if (foreign.length > 0) return null

  return { start: rowStart, end: rowEnd }
}
