/**
 * Largura canônica dos blocos de email — 600px.
 *
 * Todo bloco da biblioteca (`email_component_variants.html`) tem de carregar
 * a largura do email de forma EXPLÍCITA, porque é ela que o Montador, o
 * enxerto da hero e o preview assumem. As variantes vieram de origens
 * diferentes: umas nasceram com o container em 598/620px, e TODAS trazem o
 * boilerplate de email com `body { width:100% }` e a calha
 * `<table width="100%">`. No bloco, 100% não quer dizer nada — o bloco tem
 * uma largura só, 600px, e é ela que precisa estar escrita.
 *
 * Quatro correções, todas conservadoras:
 *
 *  1. `<table>` cuja largura numérica está PERTO de 600 (560–640) vira 600 —
 *     é a assinatura de "tentou ser o container e errou o número". Coluna
 *     interna (350, 200…) NUNCA é tocada.
 *  2. `<table>` de NÍVEL RAIZ com `width="100%"` (a calha) vira 600. Tabela
 *     100% ANINHADA continua 100%: ali o 100% significa "preenche a célula",
 *     e trocar por 600 estouraria a coluna.
 *  3. `width:100%` nas regras de `body`/`html` do `<style>` (e no style
 *     inline do `<body>`) vira `600px`.
 *  4. O recuo HORIZONTAL da calha vai a zero: ele SOMA à largura do
 *     container, e é o que fazia o email montado sair com 656/680px em vez
 *     de 600 (ver `neutralizeGutterPadding`). O vertical fica.
 *
 * Efeito conhecido de fixar 600 no lugar de 100%: numa janela mais larga que
 * 600px o bloco deixa de esticar e fica alinhado à esquerda, em vez de
 * centralizado com calha dos dois lados. É o comportamento correto para uma
 * PEÇA de 600px — o email montado tem o próprio container centralizado — e o
 * preview roda em viewport de 600, onde nem aparece.
 *
 * Módulo PURO e client-safe: roda no editor (botão "Fixar em 600px"), no
 * salvar (rotas POST/PATCH) e na varredura da biblioteca
 * (`/api/admin/components/normalize-width`).
 */

export const EMAIL_WIDTH = 600

/** Faixa em que um número é lido como "container que errou a largura". */
const NEAR_MIN = 560
const NEAR_MAX = 640

export type EmailRoot = "empty" | "document" | "tr" | "table" | "other"

/** Remove comentários e espaços do início — o que sobra é o primeiro nó real. */
function leadingContent(html: string): string {
  let s = html ?? ""
  for (;;) {
    const trimmed = s.replace(/^\s+/, "")
    if (trimmed.startsWith("<!--")) {
      const end = trimmed.indexOf("-->")
      if (end === -1) return ""
      s = trimmed.slice(end + 3)
      continue
    }
    return trimmed
  }
}

/**
 * O que é a raiz do HTML: documento completo (as variantes da biblioteca
 * são assim — `<!DOCTYPE html>` com head/style próprios), linha `<tr>`,
 * tabela ou outra coisa. Decide como o preview embrulha e como a
 * normalização trata a raiz.
 */
export function classifyEmailRoot(html: string | null | undefined): EmailRoot {
  const s = leadingContent(html ?? "")
  if (!s) return "empty"
  if (/^<!doctype/i.test(s) || /^<(html|head|body)[\s>]/i.test(s)) {
    return "document"
  }
  // Fragmento nunca tem <body>; um documento sem doctype pode ter.
  if (/<(html|body)[\s>]/i.test(s)) return "document"
  if (/^<tr[\s>]/i.test(s)) return "tr"
  if (/^<table[\s>]/i.test(s)) return "table"
  return "other"
}

function isNear(n: number): boolean {
  return n >= NEAR_MIN && n <= NEAR_MAX
}

export interface WidthChange {
  /**
   * `attr` = atributo width numérico; `style` = width/min-width/max-width em
   * px; `root100` = calha de nível raiz que era 100%; `body100` = regra de
   * body/html que era 100%; `added` = raiz sem largura ganhou uma;
   * `gutterpad` = recuo HORIZONTAL da calha, que somava à largura do
   * container e fazia o bloco passar dos 600px.
   */
  kind: "attr" | "style" | "root100" | "body100" | "added" | "gutterpad"
  from: string
  to: string
}

export interface EnforceWidthResult {
  html: string
  changed: boolean
  changes: WidthChange[]
}

// Atributo width numérico (não "100%"): `(?![\d%])` impede casar "10" de "100%".
const WIDTH_ATTR_RE = /\bwidth\s*=\s*(["']?)(\d+)(?![\d%])\1/i
// width / min-width / max-width em px dentro de um style.
const STYLE_WIDTH_RE = /(^|[;\s])((?:min-|max-)?width)\s*:\s*(\d+)px/gi
// width:100% (só o width puro — max-width:100% em coluna é legítimo).
const STYLE_WIDTH_100_RE = /(^|[;\s])width\s*:\s*100%/gi

/** Intervalos [início, fim) de comentários HTML — inclui os blocos MSO. */
function commentRanges(html: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let i = 0
  for (;;) {
    const start = html.indexOf("<!--", i)
    if (start === -1) break
    const end = html.indexOf("-->", start + 4)
    if (end === -1) {
      out.push([start, html.length])
      break
    }
    out.push([start, end + 3])
    i = end + 3
  }
  return out
}

function inRanges(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([a, b]) => pos >= a && pos < b)
}

/** A tabela é "largura 100%" (atributo ou style)? */
function isFullWidthTable(tag: string): boolean {
  if (/\bwidth\s*=\s*["']?100%/i.test(tag)) return true
  const style = tag.match(/\bstyle\s*=\s*"([^"]*)"/i)?.[1]
  return !!style && /(^|[;\s])width\s*:\s*100%/i.test(style)
}

/** Declara `width`/`max-width` de `width` px na tag (atributo + style). */
function setTableWidth(tag: string, width: number): string {
  let t = tag.replace(/\bwidth\s*=\s*(["']?)100%\1/i, `width="${width}"`)
  if (!/\bwidth\s*=/i.test(t)) {
    t = t.replace(/^<table\b/i, `<table width="${width}"`)
  }
  const decl = `width:${width}px;max-width:${width}px;`
  if (/\bstyle\s*=\s*"/i.test(t)) {
    const style = t.match(/\bstyle\s*=\s*"([^"]*)"/i)![1]
    const cleaned = style.replace(STYLE_WIDTH_100_RE, "$1")
    t = t.replace(/\bstyle\s*=\s*"[^"]*"/i, `style="${decl}${cleaned}"`)
  } else {
    t = t.replace(/^<table\b/i, `<table style="${decl}"`)
  }
  return t
}

/**
 * Intervalos de blocos `@media` dentro de um CSS. Um `body { width:100% }`
 * ali dentro é a versão MOBILE da regra e tem de continuar 100% — congelar
 * em 600px quebraria justamente o que a media query existe para consertar.
 */
function mediaRanges(css: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const re = /@media\b[^{]*\{/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === "{") depth += 1
      else if (css[i] === "}") depth -= 1
    }
    out.push([m.index, i])
    re.lastIndex = i
  }
  return out
}

/**
 * Regras de `body`/`html` no `<style>`: `width:100%` → `width:600px`. Só a
 * largura da folha é tocada; cor, margem e o resto do CSS ficam.
 */
function fixStyleSheets(
  html: string,
  width: number,
  changes: WidthChange[],
): string {
  return html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (full, open: string, css: string, close: string) => {
      const media = mediaRanges(css)
      const ruleRe = /([^{}]+)\{([^{}]*)\}/g
      const next = css.replace(
        ruleRe,
        (rule, selector: string, decls: string, offset: number) => {
          if (inRanges(offset, media)) return rule
          if (!/(^|[\s,+>~])\.?(html|body)\b/i.test(selector)) return rule
          if (!STYLE_WIDTH_100_RE.test(decls)) {
            STYLE_WIDTH_100_RE.lastIndex = 0
            return rule
          }
          STYLE_WIDTH_100_RE.lastIndex = 0
          const fixed = decls.replace(
            STYLE_WIDTH_100_RE,
            (_m, pre: string) => `${pre}width:${width}px`,
          )
          changes.push({
            kind: "body100",
            from: `${selector.trim()} { width:100% }`,
            to: `${selector.trim()} { width:${width}px }`,
          })
          return `${selector}{${fixed}}`
        },
      )
      return next === css ? full : `${open}${next}${close}`
    },
  )
}

// ── A calha não pode empurrar o container ──────────────────────────────
//
// O boilerplate de email é uma boneca russa: `<table width="100%">` (a
// calha, com o fundo da página), um `<td align="center">` com padding, e
// dentro dele o container de 600px. Na peça SOLTA aquele padding é
// invisível — a calha ocupa a janela inteira e o padding só afasta o
// container das bordas do CLIENTE.
//
// Dentro do email montado a calha deixa de ser a janela: ela vira uma
// tabela dentro da célula de 600px do documento. Aí o padding SOMA à
// largura do container (600 + 2×padding) e o bloco passa dos 600 — a
// tabela não encolhe abaixo do próprio conteúdo, então quem cede é o
// container do email, que estica. Medido em 08/09: três blocos com calhas
// de 0, 28 e 40px produziram um `.email-container` de 680px, com cada
// bloco centralizado numa largura diferente. Era o "não está em 600px".
//
// O conserto é cirúrgico: só o recuo HORIZONTAL da calha vai a zero. O
// vertical fica (é ritmo entre seções), o fundo fica (é banda de desenho) e
// o padding de qualquer outra célula fica — num container de 600px o
// padding do `<td>` é o recuo do TEXTO, e zerá-lo colaria a copy na borda.
//
// Daí a régua estreita de "isto é calha": tabela de nível raiz que ocupa o
// bloco inteiro, com UMA linha, UMA célula, e nessa célula NADA além de uma
// tabela que declara largura de container (560–640). É a assinatura da
// centralização; qualquer outro arranjo é conteúdo e não se toca.
//
// Limite declarado: calha feita de `<div>` em volta do container (alguns
// construtores exportam assim) NÃO é reconhecida. A anatomia da biblioteca
// é table-based e alargar a régua para `<div>` arriscaria zerar o recuo de
// um wrapper que é desenho. Se aparecer, o sintoma é o mesmo — container
// maior que 600 — e o conserto é estender a régua, não afrouxá-la.

const STRUCT_OPEN_RE = /^<(table|tbody|thead|tr|td|th)\b/i

/** Índice do caractere seguinte ao `>` da tag que abre em `pos`. */
function afterTag(html: string, pos: number): number {
  const gt = html.indexOf(">", pos)
  return gt === -1 ? html.length : gt + 1
}

interface ElementRange {
  name: string
  /** Início da tag de abertura. */
  start: number
  /** Fim da tag de abertura (= início do conteúdo). */
  contentStart: number
  /** Início da tag de fechamento (= fim do conteúdo). */
  contentEnd: number
  /** Fim do elemento (depois de `</tag>`). */
  end: number
  /** A tag de abertura, crua. */
  tag: string
}

/**
 * Fim do elemento `name` aberto em `afterOpen`, contando aninhamento e
 * pulando comentários — os blocos MSO (`<!--[if mso]><table>…`) não abrem
 * nível de verdade e, contados, desalinhariam o fechamento.
 *
 * `null` quando o elemento não fecha (HTML truncado): nesse caso ninguém
 * mexe em nada.
 */
function closeOf(
  html: string,
  name: string,
  afterOpen: number,
): { contentEnd: number; end: number } | null {
  const re = new RegExp(`<!--|<${name}\\b|</${name}\\s*>`, "gi")
  re.lastIndex = afterOpen
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m[0] === "<!--") {
      const end = html.indexOf("-->", m.index + 4)
      re.lastIndex = end === -1 ? html.length : end + 3
      continue
    }
    if (m[0].startsWith("</")) {
      depth -= 1
      if (depth === 0) return { contentEnd: m.index, end: m.index + m[0].length }
      continue
    }
    depth += 1
  }
  return null
}

/**
 * Filhos DIRETOS do intervalo, pelos nomes pedidos.
 *
 * `<table>` que não interessa é SALTADA inteira — o que está lá dentro não
 * é filho direto, e sem o salto uma `<tr>` de tabela aninhada seria contada
 * como linha da calha. `<tbody>`/`<thead>` são transparentes: metade dos
 * exports os escreve, metade não, e a estrutura é a mesma.
 */
function directChildren(
  html: string,
  start: number,
  end: number,
  want: string[],
): ElementRange[] {
  const wanted = new Set(want.map((w) => w.toLowerCase()))
  const out: ElementRange[] = []
  let i = start
  while (i < end) {
    if (html.startsWith("<!--", i)) {
      const close = html.indexOf("-->", i + 4)
      i = close === -1 ? end : close + 3
      continue
    }
    if (html[i] !== "<") {
      i += 1
      continue
    }
    const rest = html.slice(i, i + 12)
    const open = STRUCT_OPEN_RE.exec(rest)
    if (!open) {
      i = afterTag(html, i)
      continue
    }
    const name = open[1].toLowerCase()
    const contentStart = afterTag(html, i)
    if (name === "tbody" || name === "thead") {
      i = contentStart
      continue
    }
    const close = closeOf(html, name, contentStart)
    if (!close) break
    if (wanted.has(name)) {
      out.push({
        name,
        start: i,
        contentStart,
        contentEnd: close.contentEnd,
        end: close.end,
        tag: html.slice(i, contentStart),
      })
    }
    i = close.end
  }
  return out
}

/** Sem comentários nem espaço nas pontas — o que sobra é o conteúdo real. */
function bareContent(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").trim()
}

/** Largura numérica declarada na tag (atributo ou style), se houver. */
function declaredWidth(tag: string): number | null {
  const attr = tag.match(/\bwidth\s*=\s*["']?(\d+)(?![\d%])/i)
  if (attr) return Number(attr[1])
  const style = tag
    .match(/\bstyle\s*=\s*"([^"]*)"/i)?.[1]
    ?.match(/(?:^|[;\s])(?:min-|max-)?width\s*:\s*(\d+)px/i)
  return style ? Number(style[1]) : null
}

/** A tabela ocupa o bloco inteiro (100% ou largura de container)? */
function spansBlock(tag: string, width: number): boolean {
  if (isFullWidthTable(tag)) return true
  const declared = declaredWidth(tag)
  return declared !== null && (declared === width || isNear(declared))
}

const ZERO_RE = /^0(?:px|%|em|rem|pt)?$/i

/**
 * O `padding` de atalho sem as componentes horizontais. `null` quando já
 * não havia recuo horizontal — a normalização tem de ser idempotente.
 */
function shorthandWithoutSides(value: string): string | null {
  const parts = value.trim().split(/\s+/)
  if (parts.length === 0 || parts.length > 4) return null
  const sides =
    parts.length === 1
      ? [parts[0]]
      : parts.length === 2 || parts.length === 3
        ? [parts[1]]
        : [parts[1], parts[3]]
  if (sides.every((v) => ZERO_RE.test(v))) return null
  if (parts.length === 1) return `${parts[0]} 0`
  if (parts.length === 2) return `${parts[0]} 0`
  if (parts.length === 3) return `${parts[0]} 0 ${parts[2]}`
  return `${parts[0]} 0 ${parts[2]} 0`
}

/** Zera o recuo horizontal do style da célula. `null` = nada a mudar. */
function cellWithoutSidePadding(
  tag: string,
): { tag: string; from: string; to: string } | null {
  const style = tag.match(/\bstyle\s*=\s*"([^"]*)"/i)
  if (!style) return null
  const from: string[] = []
  const to: string[] = []
  let css = style[1]

  css = css.replace(
    /(^|[;\s])padding\s*:\s*([^;"]+)/gi,
    (m, pre: string, value: string) => {
      const next = shorthandWithoutSides(value)
      if (next === null) return m
      from.push(`padding:${value.trim()}`)
      to.push(`padding:${next}`)
      return `${pre}padding:${next}`
    },
  )
  css = css.replace(
    /(^|[;\s])padding-(left|right)\s*:\s*([^;"]+)/gi,
    (m, pre: string, side: string, value: string) => {
      if (ZERO_RE.test(value.trim())) return m
      from.push(`padding-${side}:${value.trim()}`)
      to.push(`padding-${side}:0`)
      return `${pre}padding-${side}:0`
    },
  )

  if (from.length === 0) return null
  return {
    tag: tag.replace(/\bstyle\s*=\s*"[^"]*"/i, `style="${css}"`),
    from: from.join(";"),
    to: to.join(";"),
  }
}

/**
 * `cellpadding` da calha: o atributo põe padding em TODAS as cachoeiras da
 * célula, inclusive as laterais, então tem o mesmo efeito do style. Vai a
 * zero; o vertical é preservado no `<td>` — mas só quando a célula não
 * declara padding no style, porque aí o style já venceria o atributo e
 * escrever de novo mudaria o desenho.
 */
function gutterWithoutCellpadding(
  tableTag: string,
  cellTag: string,
): { tableTag: string; cellTag: string; from: string; to: string } | null {
  const attr = tableTag.match(/\bcellpadding\s*=\s*["']?(\d+)/i)
  const value = attr ? Number(attr[1]) : 0
  if (!attr || value === 0) return null
  const nextTable = tableTag.replace(
    /\bcellpadding\s*=\s*(["']?)\d+\1/i,
    'cellpadding="0"',
  )
  const cellStyle = cellTag.match(/\bstyle\s*=\s*"([^"]*)"/i)?.[1] ?? ""
  const jaTemPadding = /(^|[;\s])padding(-[a-z]+)?\s*:/i.test(cellStyle)
  const decl = `padding:${value}px 0;`
  const nextCell = jaTemPadding
    ? cellTag
    : /\bstyle\s*=\s*"/i.test(cellTag)
      ? cellTag.replace(/\bstyle\s*=\s*"/i, `style="${decl}`)
      : cellTag.replace(/^<(td|th)\b/i, `<$1 style="${decl}"`)
  return {
    tableTag: nextTable,
    cellTag: nextCell,
    from: `cellpadding="${value}"`,
    to: jaTemPadding ? 'cellpadding="0"' : `cellpadding="0" + ${decl}`,
  }
}

/**
 * Tira o recuo horizontal das calhas de nível raiz. Idempotente.
 *
 * Roda como último passo de `enforceEmailWidth` (a biblioteca sai canônica
 * no salvar e na varredura) e de novo no ENCAIXE do bloco no documento
 * (`fitFragment`), porque variante gravada antes desta regra continua no
 * banco — e o email montado não pode depender de alguém ter clicado no
 * botão da varredura.
 */
export function neutralizeGutterPadding(
  html: string,
  width: number = EMAIL_WIDTH,
): EnforceWidthResult {
  const source = html ?? ""
  const changes: WidthChange[] = []
  let out = source

  // De trás para frente: reescrever encurta/alonga o texto e invalidaria os
  // índices dos seguintes.
  const roots = directChildren(out, 0, out.length, ["table"]).reverse()
  for (const table of roots) {
    if (!spansBlock(table.tag, width)) continue
    const rows = directChildren(out, table.contentStart, table.contentEnd, ["tr"])
    if (rows.length !== 1) continue
    const cells = directChildren(out, rows[0].contentStart, rows[0].contentEnd, [
      "td",
      "th",
    ])
    if (cells.length !== 1) continue
    const cell = cells[0]

    // A célula tem de conter SÓ o container — nada de texto, imagem ou
    // segunda tabela ao lado. Aí não é calha, é conteúdo.
    const inside = bareContent(out.slice(cell.contentStart, cell.contentEnd))
    if (!/^<table[\s>]/i.test(inside)) continue
    const inner = directChildren(out, cell.contentStart, cell.contentEnd, ["table"])
    if (inner.length !== 1) continue
    if (bareContent(out.slice(inner[0].end, cell.contentEnd)) !== "") continue
    const innerWidth = declaredWidth(inner[0].tag)
    if (innerWidth === null || !(innerWidth === width || isNear(innerWidth))) {
      continue
    }

    // Célula primeiro (índices maiores), depois a tabela: reescrever de
    // frente para trás moveria o que ainda falta reescrever.
    const semLados = cellWithoutSidePadding(cell.tag)
    let cellTag = semLados?.tag ?? cell.tag
    if (semLados) {
      changes.push({ kind: "gutterpad", from: semLados.from, to: semLados.to })
    }
    const semCellpadding = gutterWithoutCellpadding(table.tag, cellTag)
    if (semCellpadding) {
      cellTag = semCellpadding.cellTag
      changes.push({
        kind: "gutterpad",
        from: semCellpadding.from,
        to: semCellpadding.to,
      })
    }
    if (cellTag !== cell.tag) {
      out = out.slice(0, cell.start) + cellTag + out.slice(cell.contentStart)
    }
    if (semCellpadding) {
      out =
        out.slice(0, table.start) +
        semCellpadding.tableTag +
        out.slice(table.contentStart)
    }
  }

  return { html: out, changed: out !== source, changes }
}

/**
 * Fixa a largura do bloco em `width` (600). Idempotente: HTML já correto
 * volta intacto e `changed=false`.
 */
export function enforceEmailWidth(
  html: string,
  width: number = EMAIL_WIDTH,
): EnforceWidthResult {
  const changes: WidthChange[] = []
  const source = html ?? ""

  // ── 1. Larguras numéricas perto de 600 (container que errou o número) ──
  let out = source.replace(/<table\b[^>]*>/gi, (tag) => {
    let t = tag.replace(WIDTH_ATTR_RE, (m, q: string, n: string) => {
      const v = Number(n)
      if (!isNear(v) || v === width) return m
      changes.push({ kind: "attr", from: `width="${n}"`, to: `width="${width}"` })
      const quote = q || '"'
      return `width=${quote}${width}${quote}`
    })
    t = t.replace(/\bstyle\s*=\s*"([^"]*)"/i, (m, css: string) => {
      const next = css.replace(
        STYLE_WIDTH_RE,
        (mm, pre: string, prop: string, n: string) => {
          const v = Number(n)
          if (!isNear(v) || v === width) return mm
          changes.push({
            kind: "style",
            from: `${prop}:${n}px`,
            to: `${prop}:${width}px`,
          })
          return `${pre}${prop}:${width}px`
        },
      )
      return next === css ? m : `style="${next}"`
    })
    return t
  })

  // ── 2. Calha de nível raiz em 100% → 600 ──────────────────────────────
  //
  // Profundidade contada só fora de comentário: os blocos MSO
  // (`<!--[if mso]> … <table> …`) não abrem nível de verdade e, se
  // entrassem na conta, a calha seguinte pareceria aninhada.
  {
    const comments = commentRanges(out)
    const tagRe = /<\/?table\b[^>]*>/gi
    const rewrites: Array<{ start: number; end: number; tag: string }> = []
    let depth = 0
    let m: RegExpExecArray | null
    while ((m = tagRe.exec(out)) !== null) {
      if (inRanges(m.index, comments)) continue
      const tag = m[0]
      if (tag.startsWith("</")) {
        depth = Math.max(0, depth - 1)
        continue
      }
      if (depth === 0 && isFullWidthTable(tag)) {
        rewrites.push({
          start: m.index,
          end: m.index + tag.length,
          tag: setTableWidth(tag, width),
        })
      }
      if (!/\/>$/.test(tag)) depth += 1
    }
    for (let i = rewrites.length - 1; i >= 0; i -= 1) {
      const r = rewrites[i]
      changes.push({
        kind: "root100",
        from: 'tabela raiz width="100%"',
        to: `width="${width}"`,
      })
      out = out.slice(0, r.start) + r.tag + out.slice(r.end)
    }
  }

  // ── 3. body/html com width:100% no <style> e no style inline ──────────
  out = fixStyleSheets(out, width, changes)
  out = out.replace(/<body\b[^>]*>/i, (tag) => {
    const style = tag.match(/\bstyle\s*=\s*"([^"]*)"/i)
    if (!style || !/(^|[;\s])width\s*:\s*100%/i.test(style[1])) return tag
    changes.push({
      kind: "body100",
      from: "<body style=… width:100%>",
      to: `width:${width}px`,
    })
    return tag.replace(
      /\bstyle\s*=\s*"([^"]*)"/i,
      (_m, css: string) =>
        `style="${css.replace(STYLE_WIDTH_100_RE, (_x, pre: string) => `${pre}width:${width}px`)}"`,
    )
  })

  // ── 4. A calha não empurra o container (ver bloco acima) ─────────────
  {
    const gutter = neutralizeGutterPadding(out, width)
    out = gutter.html
    changes.push(...gutter.changes)
  }

  // ── 5. Fragmento cuja raiz é <table> sem largura nenhuma ──────────────
  // (Raiz <tr> não tem onde declarar — herda da tabela que a envolve, e o
  // enxerto/preview sempre a embrulham numa tabela de 600.)
  if (classifyEmailRoot(out) === "table") {
    const start = out.search(/<table\b/i)
    const end = out.indexOf(">", start)
    if (start >= 0 && end > start) {
      const tag = out.slice(start, end + 1)
      const hasAttr = /\bwidth\s*=/i.test(tag)
      const hasStyleWidth = /\bstyle\s*=\s*"[^"]*(?:^|[;\s])(?:max-)?width\s*:/i.test(tag)
      if (!hasAttr && !hasStyleWidth) {
        const decl = `width:${width}px;max-width:${width}px;`
        let nextTag: string
        if (/\bstyle\s*=\s*"/i.test(tag)) {
          nextTag = tag.replace(/\bstyle\s*=\s*"/i, `style="${decl}`)
        } else {
          nextTag = tag.replace(/^<table\b/i, `<table style="${decl}"`)
        }
        nextTag = nextTag.replace(/^<table\b/i, `<table width="${width}"`)
        changes.push({
          kind: "added",
          from: "(sem largura)",
          to: `width="${width}" + ${decl}`,
        })
        out = out.slice(0, start) + nextTag + out.slice(end + 1)
      }
    }
  }

  return { html: out, changed: out !== source, changes }
}

export interface EmailWidthAudit {
  ok: boolean
  root: EmailRoot
  /** Largura numérica encontrada no container (null quando não há). */
  container: number | null
  /** Explicação curta, para a tela. */
  reason: string
}

/**
 * Diz se o bloco declara 600px. Exige as três coisas: container numérico em
 * 600, nenhuma tabela de nível raiz em 100% e nenhum `body { width:100% }`.
 * A auditoria é a inversa da normalização — o que ela reprova é exatamente
 * o que `enforceEmailWidth` conserta.
 */
export function auditEmailWidth(
  html: string | null | undefined,
  width: number = EMAIL_WIDTH,
): EmailWidthAudit {
  const root = classifyEmailRoot(html)
  if (root === "empty") {
    return { ok: false, root, container: null, reason: "Sem HTML." }
  }
  const src = html ?? ""
  const enforced = enforceEmailWidth(src, width)

  const tables = src.match(/<table\b[^>]*>/gi) ?? []
  let container: number | null = null
  for (const tag of tables) {
    const attr = tag.match(/\bwidth\s*=\s*["']?(\d+)(?![\d%])/i)
    const styleAttr = tag.match(/\bstyle\s*=\s*"([^"]*)"/i)
    const style = styleAttr?.[1].match(
      /(?:^|[;\s])(?:min-|max-)?width\s*:\s*(\d+)px/i,
    )
    const found = attr ? Number(attr[1]) : style ? Number(style[1]) : null
    if (found !== null) {
      container = found
      break
    }
  }

  const has100 = enforced.changes.some(
    (c) => c.kind === "root100" || c.kind === "body100",
  )
  if (has100) {
    const quais = [
      enforced.changes.some((c) => c.kind === "root100") ? "a tabela raiz" : null,
      enforced.changes.some((c) => c.kind === "body100") ? "o body" : null,
    ]
      .filter(Boolean)
      .join(" e ")
    return {
      ok: false,
      root,
      container,
      reason: `${quais} está em 100% — o bloco tem de declarar ${width}px.`,
    }
  }

  if (enforced.changes.some((c) => c.kind === "gutterpad")) {
    return {
      ok: false,
      root,
      container,
      reason: `a calha soma recuo horizontal ao container — o bloco fica mais largo que ${width}px.`,
    }
  }

  if (container === width) {
    return { ok: true, root, container, reason: `Container em ${width}px.` }
  }
  if (container !== null) {
    return {
      ok: false,
      root,
      container,
      reason: `Container em ${container}px — o email é ${width}px.`,
    }
  }
  if (root === "tr") {
    return {
      ok: true,
      root,
      container: null,
      reason: "Linha <tr>: herda a largura da tabela de 600px que a envolve.",
    }
  }
  return {
    ok: false,
    root,
    container: null,
    reason: "Nenhuma tabela com largura fixa — o bloco não declara 600px.",
  }
}
