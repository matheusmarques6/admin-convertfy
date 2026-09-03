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
 * Três correções, todas conservadoras:
 *
 *  1. `<table>` cuja largura numérica está PERTO de 600 (560–640) vira 600 —
 *     é a assinatura de "tentou ser o container e errou o número". Coluna
 *     interna (350, 200…) NUNCA é tocada.
 *  2. `<table>` de NÍVEL RAIZ com `width="100%"` (a calha) vira 600. Tabela
 *     100% ANINHADA continua 100%: ali o 100% significa "preenche a célula",
 *     e trocar por 600 estouraria a coluna.
 *  3. `width:100%` nas regras de `body`/`html` do `<style>` (e no style
 *     inline do `<body>`) vira `600px`.
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
   * body/html que era 100%; `added` = raiz sem largura ganhou uma.
   */
  kind: "attr" | "style" | "root100" | "body100" | "added"
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

  // ── 4. Fragmento cuja raiz é <table> sem largura nenhuma ──────────────
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
