/**
 * rendered-image — as imagens de um exemplo renderizado, para irem ANEXADAS
 * ao prompt em vez de citadas como texto (story CM-8).
 *
 * O motivo: `content` da chamada é string, o modelo não navega e não recebe
 * modalidade de imagem. Um exemplo que é `<img src="https://…">` chega como
 * a STRING da URL — zero informação visual. Extrair a URL permite anexá-la
 * de verdade, no formato que o `qa-vision.chain` já usa em produção.
 *
 * Isomórfico e puro (zero I/O) — testável.
 */

/**
 * Teto de anexos. Um mockup-imagem tem UMA imagem; um exemplo com várias é
 * HTML estrutural, e esse ensina mais como texto (o CSS descreve o
 * acabamento) do que como um álbum de screenshots. O limite existe para não
 * transformar um exemplo estrutural num payload caro por engano.
 */
export const MAX_RENDERED_IMAGES = 2

/**
 * Menor dimensão declarada que ainda pode ser conteúdo. Pixel de tracking
 * (1x1) e espaçador transparente são exatamente o tipo de `<img>` que um
 * exemplo colado de ESP carrega — anexá-los gastaria uma chamada de visão
 * para o modelo olhar um ponto.
 */
const MIN_CONTENT_DIMENSION_PX = 3

const IMG_TAG = /<img\b[^>]*>/gi
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const DIM_ATTR = (name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"|')?\\s*(\\d+)`, "i")

/**
 * URLs de imagem aproveitáveis do HTML, na ordem em que aparecem.
 *
 * Fora: `data:` (base64 no prompt estoura o payload — um PNG de 1MB vira
 * ~330k tokens), URL relativa (sem base para resolver) e imagem com
 * dimensão declarada minúscula (tracking/spacer).
 */
export function imageUrlsIn(
  html: string | null | undefined,
  limit = MAX_RENDERED_IMAGES,
): string[] {
  const src = html ?? ""
  const out: string[] = []
  const seen = new Set<string>()

  for (const tag of src.match(IMG_TAG) ?? []) {
    if (out.length >= limit) break

    const m = tag.match(SRC_ATTR)
    const url = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim()
    if (!url || seen.has(url)) continue
    if (!/^https?:\/\//i.test(url)) continue // data:, cid:, relativa

    if (isTinyDeclared(tag)) continue

    seen.add(url)
    out.push(url)
  }
  return out
}

/** Alguma dimensão declarada no atributo é pequena demais para ser conteúdo. */
function isTinyDeclared(tag: string): boolean {
  for (const name of ["width", "height"]) {
    const v = Number(tag.match(DIM_ATTR(name))?.[1])
    if (Number.isFinite(v) && v > 0 && v < MIN_CONTENT_DIMENSION_PX) return true
  }
  return false
}
