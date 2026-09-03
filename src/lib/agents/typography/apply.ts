/**
 * Aplicação das ops de tipografia — o único lugar que escreve no documento.
 *
 * Percorre o MESMO `FONT_FAMILY_RE` do inventário, na MESMA ordem, e reescreve
 * apenas a DECLARAÇÃO daquele item (o conteúdo do `style="…"`), trocando só o
 * que a op pede: família, peso, caixa e espaçamento. Nenhuma tag, nenhum
 * texto, nenhum atributo fora do estilo é tocado — é isso que torna este
 * passo incapaz de quebrar estrutura, ao contrário do agente de HTML que ele
 * substitui.
 *
 * As reescritas são recolhidas primeiro e aplicadas DE TRÁS PARA A FRENTE:
 * escrever durante a varredura deslocaria os offsets do próprio regex.
 *
 * Puro (zero I/O) — testável.
 */

import { FONT_FAMILY_RE, splitAtBody } from "./inventory"
import type { TypographyOp, SegundaFonte } from "./rules"

export interface ApplyResult {
  html: string
  aplicadas: number
  familiasTrocadas: number
}

interface Splice {
  start: number
  end: number
  texto: string
}

/** Troca o valor da propriedade se ela existe; senão, acrescenta ao fim. */
export function setProp(decl: string, prop: string, valor: string): string {
  const re = new RegExp(`(^|;)(\\s*)${prop}\\s*:[^;]*`, "i")
  if (re.test(decl)) {
    return decl.replace(re, (_m, sep: string, esp: string) => `${sep}${esp}${prop}:${valor}`)
  }
  const base = decl.replace(/\s*;?\s*$/, "")
  return `${base};${prop}:${valor}`
}

function quoteSeNecessario(nome: string): string {
  return /\s/.test(nome) && !/^['"]/.test(nome) ? `'${nome}'` : nome
}

/** Limites da declaração (conteúdo de style="…" / regra CSS) no offset. */
function limitesDaDeclaracao(body: string, offset: number): { start: number; end: number } {
  // Mesma régua do inventário (aspa simples não delimita — ela vive dentro
  // da cadeia de fontes). Divergir aqui desalinha item e escrita.
  const OPEN = `"{>`
  const CLOSE = `"}<`
  let start = offset
  while (start > 0 && !OPEN.includes(body[start - 1])) start--
  let end = offset
  while (end < body.length && !CLOSE.includes(body[end])) end++
  return { start, end }
}

/**
 * Aplica as ops sobre o documento.
 *
 * `segundaFonte` só é usada por ops com `fonte: "secundaria"`. Sem ela, essas
 * ops levam apenas peso/caixa/tracking — o guard já teria limpado o campo,
 * isto aqui é o cinto.
 */
export function applyTypographyOps(
  html: string,
  ops: TypographyOp[],
  segundaFonte: SegundaFonte | null,
): ApplyResult {
  if (ops.length === 0) return { html, aplicadas: 0, familiasTrocadas: 0 }

  const { head, body } = splitAtBody(html)
  const porItem = new Map(ops.map((o) => [o.item, o]))
  const splices: Splice[] = []
  let aplicadas = 0
  let familiasTrocadas = 0

  const re = new RegExp(FONT_FAMILY_RE.source, FONT_FAMILY_RE.flags)
  let m: RegExpExecArray | null
  let index = -1
  while ((m = re.exec(body)) !== null) {
    index++
    const op = porItem.get(index)
    if (!op) continue

    const { start, end } = limitesDaDeclaracao(body, m.index)
    const original = body.slice(start, end)
    let nova = original

    if (op.fonte === "secundaria" && segundaFonte) {
      nova = setProp(
        nova,
        "font-family",
        `${quoteSeNecessario(segundaFonte.familia)},${segundaFonte.fallback}`,
      )
      familiasTrocadas++
    }
    if (op.peso !== undefined) nova = setProp(nova, "font-weight", String(op.peso))
    if (op.caixa !== undefined) {
      nova = setProp(nova, "text-transform", op.caixa === "alta" ? "uppercase" : "none")
    }
    if (op.tracking !== undefined) nova = setProp(nova, "letter-spacing", op.tracking)

    if (nova === original) continue
    splices.push({ start, end, texto: nova })
    aplicadas++
  }

  let corpo = body
  for (const s of splices.sort((a, b) => b.start - a.start)) {
    corpo = corpo.slice(0, s.start) + s.texto + corpo.slice(s.end)
  }

  return { html: head + corpo, aplicadas, familiasTrocadas }
}

/**
 * Declaração da webfont secundária, no mesmo formato do `webfontLink` da
 * montagem: `<link>` dentro do bloco `!mso`, porque o Outlook desktop não
 * carrega webfont e ainda tropeça no `<link>`. Idempotente.
 */
export function injectSecondaryFontLink(
  html: string,
  segundaFonte: SegundaFonte | null,
  pesos: number[],
): string {
  if (!segundaFonte) return html
  if (!/^[\w\s-]+$/.test(segundaFonte.familia)) return html
  const familia = segundaFonte.familia.replace(/ /g, "+")
  const wght = Array.from(new Set(pesos.length > 0 ? pesos : [400, 700]))
    .sort((a, b) => a - b)
    .join(";")
  const href = `https://fonts.googleapis.com/css2?family=${familia}:wght@${wght}&display=swap`
  if (html.includes(href)) return html
  const bloco = `\n<!--[if !mso]><!-->\n<link rel="stylesheet" href="${href}">\n<!--<![endif]-->`
  const headClose = /<\/head>/i.exec(html)
  if (!headClose || headClose.index === undefined) return html
  return html.slice(0, headClose.index) + bloco + "\n" + html.slice(headClose.index)
}
