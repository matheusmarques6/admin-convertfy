/**
 * slot-annotate — endereço DECLARADO para cada slot (Fase 2).
 *
 * Depois que o Montador devolve a arquitetura, o código varre os
 * `{{TAGS}}` e injeta, por offset exato (dom-locator), os atributos:
 *
 *   <tr data-cfy-row="REVIEW_1_TEXT">
 *     <td data-cfy-slot="REVIEW_1_TEXT">{{REVIEW_1_TEXT}}</td>
 *
 * Por que por CÓDIGO e não pedindo ao LLM: o Montador esquece, erra a
 * grafia e não tem como garantir 1:1 — anotar é mecânico, então é código.
 *
 * O que isso destrava (além de endereço estável):
 *   1. O slot continua endereçável DEPOIS que a copy substitui o token —
 *      hoje, assim que `{{TAG}}` vira texto, o slot some do mapa e nenhum
 *      agente posterior consegue se referir a ele.
 *   2. Remoção de linha vira lookup de atributo, não busca por conteúdo.
 *   3. As views ficam idênticas entre agentes (mesmo seletor, mesma fatia).
 *
 * Os atributos são internos: `stripSlotAttributes` os remove na limpeza
 * final, junto com os marcadores cfy:block.
 *
 * Puro (zero I/O) — testável.
 */

import { locateAllSlots, applySplices, type Range, type Splice } from "./dom-locator"

export const SLOT_ATTR = "data-cfy-slot"
export const ROW_ATTR = "data-cfy-row"

/** Fim da tag de ABERTURA que começa em `start` (posição do `>`). */
function openTagEnd(html: string, start: number): number | null {
  // Atributos podem conter `>` dentro de aspas — respeitar o quoting.
  let quote: '"' | "'" | null = null
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c as '"' | "'"
      continue
    }
    if (c === ">") return i
  }
  return null
}

function tagHasAttr(html: string, start: number, end: number, attr: string): boolean {
  return new RegExp(`\\s${attr}\\s*=`, "i").test(html.slice(start, end + 1))
}

/**
 * Injeta `data-cfy-slot` no elemento do slot (td/th) e `data-cfy-row` na
 * linha. Elemento com mais de um slot recebe os nomes separados por espaço
 * (mesma semântica de `class`). Idempotente: rodar duas vezes não duplica.
 */
export function annotateSlots(html: string): {
  html: string
  annotated: number
} {
  const slots = locateAllSlots(html)
  // Agrupa por elemento-alvo: um <td> com 2 tags recebe UM atributo com as 2.
  const byTarget = new Map<number, { range: Range; tags: string[]; attr: string }>()

  const add = (range: Range | null, tag: string, attr: string) => {
    if (!range) return
    const key = range.start * 2 + (attr === ROW_ATTR ? 1 : 0)
    const cur = byTarget.get(key)
    if (cur) {
      if (!cur.tags.includes(tag)) cur.tags.push(tag)
    } else {
      byTarget.set(key, { range, tags: [tag], attr })
    }
  }

  for (const s of slots) {
    if (s.inMsoComment) continue // branch condicional não é endereçável
    add(s.cell, s.tag, SLOT_ATTR)
    add(s.row, s.tag, ROW_ATTR)
  }

  const splices: Splice[] = []
  for (const t of byTarget.values()) {
    const gt = openTagEnd(html, t.range.start)
    if (gt == null) continue
    if (tagHasAttr(html, t.range.start, gt, t.attr)) continue // idempotência
    // Insere antes do `>` (respeitando `/>` de tag auto-fechada).
    const selfClosing = html[gt - 1] === "/"
    const at = selfClosing ? gt - 1 : gt
    splices.push({
      start: at,
      end: at,
      replacement: ` ${t.attr}="${t.tags.join(" ")}"`,
    })
  }

  const res = applySplices(html, splices)
  return { html: res.html, annotated: res.applied }
}

/** Remove os atributos internos (limpeza final, antes de entregar). */
export function stripSlotAttributes(html: string): string {
  return html.replace(
    new RegExp(`\\s(?:${SLOT_ATTR}|${ROW_ATTR})="[^"]*"`, "gi"),
    "",
  )
}

export interface AnnotatedSlot {
  tag: string
  /** Range do elemento que declara o slot (td/th). */
  cell: Range | null
  /** Range da linha declarada. */
  row: Range | null
}

const ATTR_RE = (attr: string) =>
  new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\s${attr}="([^"]*)"`, "gi")

/**
 * Lê os slots DECLARADOS no documento (via atributo), sem depender do
 * token `{{TAG}}` existir — é o que permite endereçar o slot depois que a
 * copy já foi aplicada. Devolve os ranges completos dos elementos.
 */
export function readAnnotatedSlots(html: string): Map<string, AnnotatedSlot> {
  const out = new Map<string, AnnotatedSlot>()
  const collect = (attr: string, kind: "cell" | "row") => {
    for (const m of html.matchAll(ATTR_RE(attr))) {
      const start = m.index ?? 0
      const tagName = m[1].toLowerCase()
      const gt = openTagEnd(html, start)
      if (gt == null) continue
      const close = `</${tagName}>`
      // Fim do elemento: fechamento correspondente considerando aninhamento.
      let depth = 1
      let i = gt + 1
      let end = -1
      const openRe = new RegExp(`<${tagName}\\b`, "gi")
      while (i < html.length) {
        openRe.lastIndex = i
        const nextOpen = openRe.exec(html)
        const nextClose = html.indexOf(close, i)
        if (nextClose === -1) break
        if (nextOpen && nextOpen.index < nextClose) {
          depth++
          i = nextOpen.index + 1
          continue
        }
        depth--
        if (depth === 0) {
          end = nextClose + close.length
          break
        }
        i = nextClose + close.length
      }
      if (end === -1) continue
      const range: Range = { start, end }
      for (const tag of m[2].split(/\s+/).filter(Boolean)) {
        const cur = out.get(tag) ?? { tag, cell: null, row: null }
        cur[kind] = range
        out.set(tag, cur)
      }
    }
  }
  collect(SLOT_ATTR, "cell")
  collect(ROW_ATTR, "row")
  return out
}

/**
 * Região de um slot com a cascata canônica de endereçamento — a MESMA
 * para todo consumidor (view do agente, aplicador de ops, telemetria):
 *
 *   1. endereço DECLARADO (`data-cfy-*`) — estável, sobrevive à copy;
 *   2. árvore (`{{TAG}}` ainda presente) — Fase 1;
 *   3. null — sem endereço: quem remove deve RECUSAR, nunca adivinhar.
 *
 * `annotated` (opcional) evita reler as anotações a cada chamada num loop.
 */
export function resolveSlotRegion(
  html: string,
  tag: string,
  annotated?: ReadonlyMap<string, AnnotatedSlot>,
): { row: Range | null; cell: Range | null; source: "declared" | "tree" | "none" } {
  const key = tag.replace(/[{}\s]/g, "")
  const declared = (annotated ?? readAnnotatedSlots(html)).get(key)
  if (declared && (declared.row || declared.cell)) {
    return { row: declared.row, cell: declared.cell, source: "declared" }
  }
  const located = locateAllSlots(html).find((s) => s.tag === key && !s.inMsoComment)
  if (located && (located.row || located.cell)) {
    return { row: located.row, cell: located.cell, source: "tree" }
  }
  return { row: null, cell: null, source: "none" }
}
