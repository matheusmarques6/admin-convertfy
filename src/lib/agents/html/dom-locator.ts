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
 * Consulta reutilizável "elemento MAIS INTERNO no offset" — parseia UMA vez
 * e devolve a função de lookup. Para varreduras com muitas consultas no
 * mesmo documento (slots de imagem); consulta avulsa usa `elementAt`.
 * null em comentário MSO — ali não há árvore, e o caller decide o que
 * fazer com isso (troca de texto é segura; estrutura, não).
 */
export function buildElementLookup(
  html: string,
): (offset: number) => { tagName: string; range: Range } | null {
  const entries = indexElements(html)
  const mso = msoCommentRanges(html)
  return (offset) => {
    if (inAnyRange(offset, mso)) return null
    const entry = entryAt(entries, offset)
    return entry ? { tagName: entry.tagName, range: entry.range } : null
  }
}

/**
 * Cadeia `[próprio, ...ancestrais]` que contém o offset, do mais interno ao
 * mais externo. Mesma indexação de `buildElementLookup` — uma passada de
 * parse por documento, consultas lineares depois.
 *
 * Existe porque decidir contraste exige subir a árvore: a cor do texto está
 * num `<a style="color:…">` e o fundo em que ele pousa costuma estar num
 * `<td bgcolor>` ou `<table style="background:…">` acima. `contextOf` do
 * inventário de cores olha 60 chars para trás e por isso só sabe o PAPEL da
 * declaração, nunca sobre o quê ela está.
 *
 * null em comentário MSO, pela mesma razão de `buildElementLookup`: ali não
 * há árvore.
 */
export function buildAncestorChain(
  html: string,
): (offset: number) => Array<{ tagName: string; range: Range }> | null {
  const entries = indexElements(html)
  const mso = msoCommentRanges(html)
  return (offset) => {
    if (inAnyRange(offset, mso)) return null
    const entry = entryAt(entries, offset)
    if (!entry) return null
    return [{ tagName: entry.tagName, range: entry.range }, ...entry.ancestors]
  }
}

/** Conveniência de `buildElementLookup` para consulta única. */
export function elementAt(
  html: string,
  offset: number,
): { tagName: string; range: Range } | null {
  return buildElementLookup(html)(offset)
}

/** Ranges dos comentários (MSO conditional incluído) — o parser não entra neles. */
export function commentRanges(html: string): Range[] {
  return msoCommentRanges(html)
}

export interface TextNodeEntry {
  /** Range do nó de texto no source original. */
  range: Range
  /** Texto CRU do source (entidades não decodificadas). */
  text: string
}

/**
 * Nós de TEXTO do documento, em ordem, com o range de origem. É a matéria-
 * prima do casamento por `example`: a frase do schema é procurada dentro de
 * UM nó (frase que atravessa markup não tem range contíguo e é recusada —
 * nunca adivinhada). Conteúdo de <script>/<style> fica fora — não é texto
 * que o cliente de email lê. Comentários nem chegam aqui: para o parser são
 * nós próprios, não texto.
 */
export function textNodes(html: string): TextNodeEntry[] {
  const doc = parse(html, { sourceCodeLocationInfo: true })
  const out: TextNodeEntry[] = []
  const SKIP = new Set(["script", "style"])

  const walk = (node: Node, insideSkipped: boolean) => {
    if (node.nodeName === "#text") {
      const r = rangeOf(node)
      const value = (node as { value?: string }).value ?? ""
      if (r && !insideSkipped && value.trim().length > 0) {
        out.push({ range: r, text: html.slice(r.start, r.end) })
      }
      return
    }
    const skipChildren =
      insideSkipped || (isElement(node) && SKIP.has(node.tagName.toLowerCase()))
    for (const child of childrenOf(node)) walk(child, skipChildren)
  }

  walk(doc, false)
  out.sort((a, b) => a.range.start - b.range.start)
  return out
}

/**
 * A linha ainda tem texto de verdade depois de tirar os placeholders?
 *
 * Guard compartilhado da remoção de linha (nasceu em apply-patches; movido
 * para cá porque o merge determinístico de imagem também precisa dele).
 * Slot preenchido já é texto no documento; tirados tokens `{{}}`, tags e
 * entidades, o que sobrar de alfanumérico é conteúdo que o cliente leria —
 * e remover a linha o destruiria (foi assim que os dois depoimentos da
 * Luxe Lift sumiram em 12/08). Pontuação, estrelas (`&#9733;`) e aspas
 * decorativas não contam: são moldura da variante, não copy.
 */
export function rowHasFilledCopy(region: string): boolean {
  const text = region
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, " ")
  return /[\p{L}\p{N}]/u.test(text)
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

/**
 * Elementos de "casca" que ficaram SEM CONTEÚDO — `<a>`, `<span>`, `<table>`
 * e `<tr>`.
 *
 * Existe por causa do email da Luxe Lift (12/08). O
 * `stripUnresolvedPlaceholders` troca `{{TAG}}` por string vazia e mantém a
 * marcação em volta; o `remove_row` dos formatadores tira a linha e mantém a
 * tabela. Num parágrafo isso é invisível; num botão ou numa seção, não:
 *
 *   - `<a style="border:1.5px solid #000">{{FOOTER_LINK_1_LABEL}}</a>`
 *     virou retângulo com borda, altura e padding e nenhum texto — seis
 *     deles no rodapé, mais a pílula vazia do logo;
 *   - a seção de depoimentos virou duas `<table>` vazias com o padding
 *     original, ocupando espaço no meio do email.
 *
 * Conta como CONTEÚDO: texto, entidade (`&nbsp;` inclusive — spacer
 * deliberado não é lixo), imagem COM `src` e elemento que desenha por si
 * (`hr`, `input`, VML). Imagem sem endereço não conta: `<img src="">` é
 * ícone quebrado, e foi o que sobrou nas redes sociais do rodapé.
 *
 * `<table>`/`<tr>` têm uma guarda a mais: altura declarada (`height="20"`,
 * `height:20px`) marca espaçamento deliberado e a linha fica. Sem isso a
 * poda comeria os spacers que o template pede de propósito.
 *
 * Devolve a casca MAIS EXTERNA: achou vazia, não desce nos filhos. Sem isso
 * `<a><span></span></a>` emitiria dois ranges aninhados, e o `applySplices`
 * — que rejeita sobreposição — removeria só o `<span>`, deixando um `<a>`
 * vazio no lugar do problema que a gente veio resolver.
 */
export function locateEmptyShells(html: string): Range[] {
  const doc = parse(html, { sourceCodeLocationInfo: true })
  const mso = msoCommentRanges(html)
  const out: Range[] = []

  const walk = (node: Node) => {
    if (isElement(node) && SHELL_TAGS.has(node.tagName.toLowerCase())) {
      const loc = node.sourceCodeLocation
      // Sem posição de fechamento não dá pra saber onde o conteúdo termina —
      // e casca sem `</a>` no source é correção do parser, não do documento.
      if (
        loc?.startTag &&
        loc.endTag &&
        loc.startOffset != null &&
        loc.endOffset != null &&
        !inAnyRange(loc.startOffset, mso)
      ) {
        const inner = html.slice(loc.startTag.endOffset, loc.endTag.startOffset)
        const tag = node.tagName.toLowerCase()
        // Linha/tabela que declara altura é spacer deliberado: `<td height="20">`
        // vazio existe para ocupar espaço, e podá-lo muda o layout de propósito.
        const isSpacer =
          STRUCTURAL_TAGS.has(tag) && DECLARES_HEIGHT.test(inner)
        if (!hasRenderedContent(inner) && !isSpacer) {
          out.push({ start: loc.startOffset, end: loc.endOffset })
          return
        }
      }
    }
    for (const child of childrenOf(node)) walk(child)
  }

  walk(doc)
  return out
}

/**
 * Cascas podáveis. `a`/`span` carregam a moldura de um botão; `table`/`tr`
 * carregam o espaçamento de uma seção. As quatro ficam ocupando espaço
 * quando o conteúdo que justificava sua existência não chegou.
 */
const SHELL_TAGS = new Set(["a", "span", "table", "tr"])

/** Estruturais: podados só quando também não declaram altura (spacer). */
const STRUCTURAL_TAGS = new Set(["table", "tr"])

/** Imagem só desenha com endereço: `src=""` é ícone quebrado, não conteúdo. */
const IMG_WITH_SRC = /<img\b[^>]*\ssrc\s*=\s*["'][^"']+["']/i

/** Elementos que desenham sozinhos mesmo sem texto nem imagem. */
const SELF_RENDERING = /<(?:hr|input|v:[a-z]+)\b/i

/** Altura declarada = espaçamento deliberado, não sobra. */
const DECLARES_HEIGHT = /\sheight\s*=\s*["']?\d|height\s*:\s*\d+(?:px|%)/i

/** Há algo que o cliente de email veria dentro deste trecho? */
function hasRenderedContent(inner: string): boolean {
  if (IMG_WITH_SRC.test(inner) || SELF_RENDERING.test(inner)) return true
  // Entidade sobrevive ao strip de tags como texto literal ("&nbsp;"), então
  // conta como conteúdo — é exatamente o que distingue spacer de casca oca.
  return (
    inner
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]*>/g, "")
      .trim().length > 0
  )
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
