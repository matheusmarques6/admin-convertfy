/**
 * dom-locator — localizador de slots por AST com posição de origem.
 *
 * FONTE ÚNICA de endereçamento do documento. Substitui as heurísticas de
 * regex (`<tr>` envolvente adivinhada contando aberturas/fechamentos), que
 * quebram em email HTML — tabelas aninhadas 4-5 níveis são a norma, não a
 * exceção. Sintomas medidos em produção (Luxe Lift, 28/07): 7 ops
 * `row_not_removable` nos reviews e remoção de seções vizinhas erradas.
 *
 * Como funciona:
 *   1. parse5 com `sourceCodeLocationInfo: true` devolve, para cada nó, o
 *      offset EXATO no source original (startOffset/endOffset).
 *   2. A árvore sabe qual <tr>/<td> envolve cada token — nada é adivinhado.
 *   3. As edições são feitas por SPLICE no source original (nunca
 *      re-serializando a árvore): os conditional comments do Outlook
 *      (`<!--[if mso]>`) sobrevivem intactos, e o documento não é
 *      "corrigido" pelo parser.
 *
 * Limite conhecido e tratado: o conteúdo dentro de um comentário MSO não
 * vira árvore (é comentário para o parser). Tokens ali são localizados por
 * varredura textual e marcados com `inMsoComment: true` — o caller decide
 * (troca de texto é segura; remoção de linha é recusada).
 *
 * Puro (zero I/O) — testável.
 */

import { parse } from "parse5"
import type { DefaultTreeAdapterMap } from "parse5"

type Node = DefaultTreeAdapterMap["node"]
type ParentNode = DefaultTreeAdapterMap["parentNode"]
type Element = DefaultTreeAdapterMap["element"]

/** Intervalo [start, end) no source original. */
export interface Range {
  start: number
  end: number
}

export interface SlotLocation {
  /** Tag normalizada (sem chaves/espaços). */
  tag: string
  /** Ocorrência do token `{{TAG}}` no source. */
  token: Range
  /** <tr> envolvente REAL (via árvore). null = fora de tabela / MSO. */
  row: Range | null
  /** <td>/<th> envolvente REAL. null = fora de célula. */
  cell: Range | null
  /**
   * Token dentro de conditional comment do Outlook. Trocar texto é seguro;
   * remover linha NÃO é (a linha não existe na árvore).
   */
  inMsoComment: boolean
}

const TAG_TOKEN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

/** Aceita "TAG", "{{TAG}}" e "{{ TAG }}" — mesma normalização do Integrador. */
export function normalizeTag(tag: string): string {
  return tag.replace(/[{}\s]/g, "")
}

// ── Ranges dos comentários MSO (o parser não entra neles) ──────────────

function msoCommentRanges(html: string): Range[] {
  const out: Range[] = []
  const re = /<!--[\s\S]*?-->/g
  for (const m of html.matchAll(re)) {
    const start = m.index ?? 0
    out.push({ start, end: start + m[0].length })
  }
  return out
}

function inAnyRange(offset: number, ranges: Range[]): boolean {
  return ranges.some((r) => offset >= r.start && offset < r.end)
}

// ── Travessia da árvore ────────────────────────────────────────────────

function isElement(node: Node): node is Element {
  return "tagName" in node
}

function childrenOf(node: Node): Node[] {
  return (node as ParentNode).childNodes ?? []
}

function rangeOf(node: Node): Range | null {
  const loc = node.sourceCodeLocation
  if (!loc || loc.startOffset == null || loc.endOffset == null) return null
  return { start: loc.startOffset, end: loc.endOffset }
}

/**
 * Índice de ELEMENTOS com a pilha de ancestrais. Cobre token em nó de
 * texto (`<td>{{TAG}}</td>`) E em atributo (`src="{{TAG}}"`) — em ambos o
 * offset cai dentro do range do elemento. Uma passada de parse por
 * documento; consultas depois são lineares sobre a lista.
 */
interface ElementEntry {
  tagName: string
  range: Range
  /** Ancestrais do mais interno ao mais externo (sem o próprio). */
  ancestors: Array<{ tagName: string; range: Range }>
}

function indexElements(html: string): ElementEntry[] {
  const doc = parse(html, { sourceCodeLocationInfo: true })
  const out: ElementEntry[] = []
  const stack: Array<{ tagName: string; range: Range }> = []

  const walk = (node: Node) => {
    let pushed = false
    if (isElement(node)) {
      const r = rangeOf(node)
      // Elemento implícito do parser (tree correction) não tem location —
      // não entra na pilha, mas os filhos continuam sendo visitados.
      if (r) {
        const tagName = node.tagName.toLowerCase()
        out.push({ tagName, range: r, ancestors: [...stack].reverse() })
        stack.push({ tagName, range: r })
        pushed = true
      }
    }
    for (const child of childrenOf(node)) walk(child)
    if (pushed) stack.pop()
  }

  walk(doc)
  return out
}

/** Elemento MAIS INTERNO que contém o offset (menor range que o cobre). */
function entryAt(entries: ElementEntry[], offset: number): ElementEntry | null {
  let best: ElementEntry | null = null
  for (const e of entries) {
    if (offset < e.range.start || offset >= e.range.end) continue
    if (!best || e.range.end - e.range.start < best.range.end - best.range.start) {
      best = e
    }
  }
  return best
}

/** Procura na cadeia [próprio, ...ancestrais] o primeiro elemento pedido. */
function nearestAncestor(
  entry: ElementEntry | null,
  tagNames: string[],
): Range | null {
  if (!entry) return null
  if (tagNames.includes(entry.tagName)) return entry.range
  for (const a of entry.ancestors) {
    if (tagNames.includes(a.tagName)) return a.range
  }
  return null
}

// ── API pública ────────────────────────────────────────────────────────

/**
 * Localiza TODAS as ocorrências de `{{TAG}}` no documento, com a <tr>/<td>
 * envolvente resolvida pela árvore. Uma única passada de parse — os
 * consumidores (views de texto, de imagem, do QA, e o aplicador de ops)
 * usam o MESMO resultado, garantindo que todo agente enxergue exatamente
 * a mesma fatia do documento.
 */
export function locateAllSlots(html: string): SlotLocation[] {
  const entries = indexElements(html)
  const mso = msoCommentRanges(html)
  const out: SlotLocation[] = []

  for (const m of html.matchAll(TAG_TOKEN)) {
    const start = m.index ?? 0
    const token: Range = { start, end: start + m[0].length }
    const isMso = inAnyRange(start, mso)
    const entry = isMso ? null : entryAt(entries, start)
    out.push({
      tag: m[1],
      token,
      row: isMso ? null : nearestAncestor(entry, ["tr"]),
      cell: isMso ? null : nearestAncestor(entry, ["td", "th"]),
      inMsoComment: isMso,
    })
  }
  return out
}

/**
 * Primeira ocorrência de cada tag pedida (a "âncora" do slot). Tags que se
 * repetem em branches MSO são resolvidas pela ocorrência REAL da árvore
 * quando existir — a duplicata condicional nunca vira a âncora.
 */
export function locateSlots(
  html: string,
  tags: string[],
): Map<string, SlotLocation> {
  const wanted = new Set(tags.map(normalizeTag))
  const all = locateAllSlots(html)
  const map = new Map<string, SlotLocation>()
  for (const loc of all) {
    if (!wanted.has(loc.tag)) continue
    const prev = map.get(loc.tag)
    // Prefere a ocorrência ancorada na árvore à que vive em comentário MSO.
    if (!prev || (prev.inMsoComment && !loc.inMsoComment)) {
      map.set(loc.tag, loc)
    }
  }
  return map
}

/**
 * <tr> envolvente de um offset arbitrário (usado pelo aplicador de ops).
 * null quando não há linha na árvore — remoção deve ser RECUSADA nesse
 * caso, nunca adivinhada.
 */
export function enclosingRow(html: string, offset: number): Range | null {
  const mso = msoCommentRanges(html)
  if (inAnyRange(offset, mso)) return null
  return nearestAncestor(entryAt(indexElements(html), offset), ["tr"])
}

/**
 * Texto visível de um trecho do source (tags e comentários removidos).
 * Usado pelas views que mostram ao agente o que o cliente de email vê.
 */
export function visibleTextOf(html: string, range: Range): string {
  return html
    .slice(range.start, range.end)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export interface Splice {
  start: number
  end: number
  replacement: string
}

/**
 * Aplica edições no source por offset — SEM re-serializar a árvore.
 *
 * Ordena por offset DECRESCENTE: editar de trás para frente mantém válidos
 * os offsets ainda não aplicados (padrão de patch textual). É o que elimina
 * a classe de erro "a op 5 invalidou o endereço da op 12".
 * Splices sobrepostos: o primeiro (mais à direita) vence; os demais são
 * devolvidos em `rejected` para telemetria — nunca aplicados por cima.
 */
export function applySplices(
  html: string,
  splices: Splice[],
): { html: string; applied: number; rejected: Splice[] } {
  const sorted = [...splices].sort((a, b) => b.start - a.start)
  const rejected: Splice[] = []
  let out = html
  let lastStart = Number.POSITIVE_INFINITY
  let applied = 0

  for (const s of sorted) {
    if (s.end > lastStart) {
      rejected.push(s) // sobrepõe uma edição já aplicada à direita
      continue
    }
    if (s.start < 0 || s.end > html.length || s.start > s.end) {
      rejected.push(s)
      continue
    }
    out = out.slice(0, s.start) + s.replacement + out.slice(s.end)
    lastStart = s.start
    applied++
  }
  return { html: out, applied, rejected }
}
