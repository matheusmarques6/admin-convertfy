/**
 * Largura canônica dos blocos de email — 600px.
 *
 * Todo bloco da biblioteca (`email_component_variants.html`) tem de carregar
 * a largura do email de forma EXPLÍCITA, porque é ela que o Montador, o
 * enxerto da hero e o preview assumem. As variantes cadastradas vieram de
 * origens diferentes e algumas nasceram com o container em 598/620px — no
 * email final isso vira um bloco mais estreito (ou mais largo) que os
 * vizinhos, com a borda da calha aparecendo de um lado.
 *
 * Módulo PURO e client-safe: roda no editor (botão "Fixar em 600px"), no
 * salvar (rotas POST/PATCH) e na varredura da biblioteca
 * (`/api/admin/components/normalize-width`).
 *
 * Regra conservadora: só `<table>` é tocada, e só quando a largura numérica
 * está PERTO de 600 (560–640) — é a assinatura de "tentou ser o container e
 * errou o número". Colunas internas (350, 200...) e `width="100%"` ficam
 * intactas: mexer nelas redesenharia o bloco em vez de corrigi-lo.
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
  /** `attr` = atributo width; `style` = width/min-width/max-width no style; `added` = raiz sem largura ganhou uma. */
  kind: "attr" | "style" | "added"
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

/**
 * Fixa a largura do container em `width` (600). Idempotente: HTML já
 * correto volta intacto e `changed=false`.
 */
export function enforceEmailWidth(
  html: string,
  width: number = EMAIL_WIDTH,
): EnforceWidthResult {
  const changes: WidthChange[] = []
  const source = html ?? ""

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

  // Fragmento cuja raiz é uma <table> sem largura nenhuma: ganha a do email.
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
 * Diz se o HTML declara o container em `width`. O container é a primeira
 * `<table>` com largura numérica (atributo ou style) — a externa de
 * `width="100%"` é a calha, não conta.
 */
export function auditEmailWidth(
  html: string | null | undefined,
  width: number = EMAIL_WIDTH,
): EmailWidthAudit {
  const root = classifyEmailRoot(html)
  if (root === "empty") {
    return { ok: false, root, container: null, reason: "Sem HTML." }
  }
  const tables = (html ?? "").match(/<table\b[^>]*>/gi) ?? []
  for (const tag of tables) {
    const attr = tag.match(/\bwidth\s*=\s*["']?(\d+)(?![\d%])/i)
    const styleAttr = tag.match(/\bstyle\s*=\s*"([^"]*)"/i)
    const style = styleAttr?.[1].match(
      /(?:^|[;\s])(?:min-|max-)?width\s*:\s*(\d+)px/i,
    )
    const found = attr ? Number(attr[1]) : style ? Number(style[1]) : null
    if (found === null) continue
    if (found === width) {
      return { ok: true, root, container: found, reason: `Container em ${width}px.` }
    }
    return {
      ok: false,
      root,
      container: found,
      reason: `Container em ${found}px — o email é ${width}px.`,
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
