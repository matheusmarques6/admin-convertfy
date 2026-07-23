/**
 * Extrai o comentário HTML (<!-- … -->) que o designer deixou junto de cada
 * slot de imagem na variante da biblioteca — a direção de arte colada no
 * `<td>`/`<tr>` que envolve o `{{TAG}}` de imagem.
 *
 * Sem parser HTML (nenhum instalado): varredura por índices das fronteiras
 * do `<td>`/`<tr>` que contém a tag — mesma filosofia do reference-structure,
 * que já casa `{{TAG}}` por regex. Robusto o suficiente para os templates de
 * email (table-based, bem-formados). Puro — testável.
 *
 * Regras:
 *  - casa o slot pela TAG (src OU background-image referenciando `{{TAG}}`);
 *  - precedência: comentário do `<td>` mais próximo; se não houver, o `<tr>`;
 *  - por TAG (blocos multi-imagem: PRODUCT_1_IMAGE, PRODUCT_2_IMAGE…);
 *  - sem comentário → tag ausente do mapa (no-op, não inventa).
 */

const COMMENT_RE = /<!--([\s\S]*?)-->/

/** Índice do início da tag `{{TAG}}` no HTML (tolera espaços internos). */
function findTagIndex(html: string, tag: string): number {
  const re = new RegExp(`\\{\\{\\s*${tag}\\s*\\}\\}`)
  const m = re.exec(html)
  return m ? m.index : -1
}

/**
 * Fronteiras [start,end) do elemento `name` (td|tr) que ENVOLVE a posição
 * `pos`: procura a última abertura `<name` antes de `pos` e o `</name>`
 * correspondente depois. Null se `pos` não está dentro de um.
 */
function enclosingElement(
  html: string,
  pos: number,
  name: "td" | "tr",
): { start: number; end: number } | null {
  const lower = html.toLowerCase()
  const open = `<${name}`
  const close = `</${name}>`
  const start = lower.lastIndexOf(open, pos)
  if (start < 0) return null
  const closeIdx = lower.indexOf(close, pos)
  if (closeIdx < 0) return null
  // Guard: a abertura achada precisa ser a que envolve `pos` (não uma célula
  // anterior já fechada). Se existe um fechamento entre `start` e `pos`, então
  // `pos` está numa célula seguinte — sobe pro nível de cima (o caller tenta tr).
  const closedBefore = lower.indexOf(close, start)
  if (closedBefore >= 0 && closedBefore < pos) return null
  return { start, end: closeIdx + close.length }
}

/** Primeiro comentário dentro do slice [start,end). Limpo e trimado. */
function commentIn(html: string, start: number, end: number): string | null {
  const slice = html.slice(start, end)
  const m = COMMENT_RE.exec(slice)
  const text = m?.[1]?.trim()
  return text ? text : null
}

/**
 * Mapa `{ tag → comentário }` para as tags de imagem pedidas. Só entram as
 * tags que têm comentário no `<td>`/`<tr>` envolvente.
 */
export function extractImageSlotNotes(
  variantHtml: string,
  imageTags: string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!variantHtml) return out
  for (const rawTag of imageTags) {
    const tag = rawTag.trim()
    if (!tag) continue
    const pos = findTagIndex(variantHtml, tag)
    if (pos < 0) continue
    // td mais próximo primeiro; fallback pro tr.
    const td = enclosingElement(variantHtml, pos, "td")
    let note = td ? commentIn(variantHtml, td.start, td.end) : null
    if (!note) {
      const tr = enclosingElement(variantHtml, pos, "tr")
      note = tr ? commentIn(variantHtml, tr.start, tr.end) : null
    }
    if (note) out[tag] = note
  }
  return out
}
