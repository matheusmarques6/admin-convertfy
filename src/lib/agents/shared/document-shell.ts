/**
 * document-shell — tira a casca de DOCUMENTO de um HTML que vai para dentro
 * de um prompt cujo output tem de ser FRAGMENTO.
 *
 * Por que existe: o exemplo renderizado das variantes (`rendered_html`) é
 * quase sempre um export colado inteiro — `<!DOCTYPE html><html><head>…
 * <body>` em volta de um print. Desde 30/jul esse exemplo vai SEMPRE ao
 * agente de hero (decisão do Matheus: mesmo sendo mockup, ele mostra o
 * acabamento pretendido). Só que o agente precisa devolver um fragmento, e
 * `parseHeroFragment` rejeita output com `<!DOCTYPE>`/`<html>`/`<body>`.
 * Mostrar um documento completo e pedir um fragmento é dar ao modelo um
 * molde do formato errado — e foi exatamente o que ele copiou.
 *
 * A decisão continua valendo: o exemplo VAI. O que sai é só a moldura, que
 * não carrega acabamento nenhum — proporção, hierarquia e peso visual estão
 * no conteúdo do body.
 *
 * O que se perde: `<style>` no `<head>`. Aceito e deliberado — email HTML de
 * verdade é inline, e o exemplo serve de referência visual, não de fonte de
 * CSS.
 *
 * Isomórfico e puro (zero I/O) — testável.
 */

export interface StripShellResult {
  html: string
  /** Havia moldura de documento e ela foi removida. */
  stripped: boolean
}

const DOCTYPE = /<!DOCTYPE[^>]*>/gi
const BODY_OPEN = /<body\b[^>]*>/i
const BODY_CLOSE = /<\/body\s*>/i
const HEAD_BLOCK = /<head\b[^>]*>[\s\S]*?<\/head\s*>/gi
const HTML_TAGS = /<\/?html\b[^>]*>/gi
const BODY_TAGS = /<\/?body\b[^>]*>/gi

/**
 * Devolve o conteúdo sem a casca `<!DOCTYPE>/<html>/<head>/<body>`.
 *
 * Com `<body>` presente, o miolo entre as tags é o resultado — é o recorte
 * mais fiel. Sem ele, as tags de moldura são removidas uma a uma, o que
 * cobre o HTML pela metade que aparece em exemplo colado às pressas.
 */
export function stripDocumentShell(
  html: string | null | undefined,
): StripShellResult {
  const src = (html ?? "").trim()
  if (!src) return { html: "", stripped: false }

  const open = src.match(BODY_OPEN)
  const close = src.match(BODY_CLOSE)
  if (open?.index !== undefined && close?.index !== undefined) {
    const start = open.index + open[0].length
    if (close.index > start) {
      return { html: src.slice(start, close.index).trim(), stripped: true }
    }
  }

  const out = src
    .replace(DOCTYPE, "")
    .replace(HEAD_BLOCK, "")
    .replace(HTML_TAGS, "")
    .replace(BODY_TAGS, "")
    .trim()

  return { html: out, stripped: out !== src }
}

/** Há casca de documento aqui? Usado por guards e telemetria. */
export function hasDocumentShell(html: string | null | undefined): boolean {
  const src = html ?? ""
  return /<!DOCTYPE|<html[\s>]|<body[\s>]/i.test(src)
}
