/**
 * qa-views — views por bloco do agente de QA (F5, arquitetura por views).
 *
 * O QA (LLM) não recebe mais o documento inteiro: recebe uma view por
 * bloco — texto visível extraído, hrefs de CTA e contagem de imagens —
 * amarrada ao email_blocks.id. As views são extraídas por código do HTML
 * AINDA COM os marcadores <!-- cfy:block:{i}:{section}:start/end --> (a
 * limpeza final os remove; o runner extrai antes do strip).
 *
 * Checks que precisam do documento como um todo (doc truncado, placeholder
 * sobrando, <img> sem src) são CÓDIGO — vivem nos checks determinísticos
 * do qa.chain, não no LLM.
 *
 * Puro (zero I/O) — testável.
 */

export interface QaBlockView {
  /** email_blocks.id (match sequencial por tipo) — null quando não casou. */
  block_id: string | null
  /** Índice do marcador cfy:block (ordem no documento). */
  indice: number
  /** Section do marcador (hero, beneficios, header...). */
  tipo: string
  /** Texto visível da região (tags removidas, whitespace colapsado). */
  texto_visivel: string
  /** Hrefs de <a> na região (dedup, ordem de aparição). */
  cta_hrefs: string[]
  /** Nº de <img> com src não-vazio na região. */
  imagens: number
}

const MARKER_START = /<!--\s*cfy:block:(\d+):([a-z0-9_-]+):start\s*-->/gi

function visibleText(regionHtml: string, cap = 500): string {
  const text = regionHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > cap ? `${text.slice(0, cap)}…` : text
}

function hrefsOf(regionHtml: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of regionHtml.matchAll(/href\s*=\s*["']([^"']*)["']/gi)) {
    const url = m[1].trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

function imgCount(regionHtml: string): number {
  let n = 0
  for (const m of regionHtml.matchAll(/<img\b[^>]*>/gi)) {
    const src = /src\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1]?.trim()
    if (src) n++
  }
  return n
}

/**
 * Extrai as views por bloco do HTML com marcadores. `blocks` (ordenados
 * por position) amarram o block_id por match sequencial de tipo: a view
 * de section X casa com o próximo bloco não-usado cujo block_type é X.
 * Sem marcadores no HTML → [] (o caller cai no fallback por content).
 */
export function buildQaBlockViews(
  htmlWithMarkers: string,
  blocks: Array<{ id: string; position: number; block_type: string }>,
): QaBlockView[] {
  const views: QaBlockView[] = []
  const used = new Set<string>()
  const sorted = [...blocks].sort((a, b) => a.position - b.position)

  for (const m of htmlWithMarkers.matchAll(MARKER_START)) {
    const indice = Number(m[1])
    const tipo = m[2]
    const startEnd = (m.index ?? 0) + m[0].length
    const endRe = new RegExp(
      `<!--\\s*cfy:block:${indice}:${tipo}:end\\s*-->`,
      "i",
    )
    const endMatch = endRe.exec(htmlWithMarkers.slice(startEnd))
    if (!endMatch) continue
    const region = htmlWithMarkers.slice(startEnd, startEnd + endMatch.index)

    const owner = sorted.find((b) => !used.has(b.id) && b.block_type === tipo)
    if (owner) used.add(owner.id)

    views.push({
      block_id: owner?.id ?? null,
      indice,
      tipo,
      texto_visivel: visibleText(region),
      cta_hrefs: hrefsOf(region),
      imagens: imgCount(region),
    })
  }
  return views
}

/**
 * Fallback quando o HTML não tem mais marcadores (resume pós-strip, doc
 * legado): views derivadas só do content dos blocos — o QA perde o texto
 * renderizado mas mantém a copy esperada por bloco.
 */
export function viewsFromBlocksFallback(
  blocks: Array<{
    id: string
    position: number
    block_type: string
    content: Record<string, unknown> | null
  }>,
): QaBlockView[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((b, i) => {
      const values = Object.values(b.content ?? {})
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .join(" | ")
      return {
        block_id: b.id,
        indice: i,
        tipo: b.block_type,
        texto_visivel: values.slice(0, 500),
        cta_hrefs: [],
        imagens: 0,
      }
    })
}
