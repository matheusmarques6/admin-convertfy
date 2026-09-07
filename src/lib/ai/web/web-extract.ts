/**
 * HTML → texto legível para o modelo — PURO, testado.
 *
 * Não é um renderizador: é o mínimo para a IA LER a página. O que ela
 * precisa é o conteúdo, o título e os links; o que atrapalha é menu,
 * rodapé, script, cookie banner e 300 KB de CSS embutido — que gastam
 * contexto e empurram o conteúdo real para fora do orçamento.
 *
 * Sem dependência nova: `cheerio`/`turndown` resolveriam, mas trariam
 * árvore de dependências para um trabalho que cabe em regex disciplinada
 * sobre um documento que já vem hostil.
 */

/** Blocos que nunca são conteúdo — removidos com o conteúdo dentro. */
const BLOCOS_MORTOS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
]

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  eacute: "é",
  aacute: "á",
  atilde: "ã",
  ccedil: "ç",
  oacute: "ó",
  iacute: "í",
  uacute: "ú",
  ecirc: "ê",
  ocirc: "ô",
  agrave: "à",
  otilde: "õ",
}

export function decodificarEntidades(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => {
      const n = Number.parseInt(h, 16)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""
    })
    .replace(/&#(\d+);/g, (_, d: string) => {
      const n = Number.parseInt(d, 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""
    })
    .replace(/&([a-z]+);/gi, (todo, nome: string) => ENTIDADES[nome.toLowerCase()] ?? todo)
}

/** Título da página: `<title>` → primeiro `<h1>` → vazio. */
export function extrairTitulo(html: string): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]
  const bruto = t || h1 || ""
  return decodificarEntidades(bruto.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

/** `<meta name="description">` / og:description, quando existe. */
export function extrairDescricao(html: string): string {
  const re =
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i
  const alt =
    /<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i
  const m = re.exec(html)?.[1] ?? alt.exec(html)?.[1] ?? ""
  return decodificarEntidades(m).replace(/\s+/g, " ").trim().slice(0, 400)
}

export interface PaginaExtraida {
  titulo: string
  descricao: string
  texto: string
  /** true quando o corte por tamanho aparou o fim — a UI e o modelo precisam saber. */
  truncado: boolean
  links: Array<{ texto: string; url: string }>
}

/**
 * Converte o corpo em texto. `maxChars` é o orçamento: uma página de
 * notícia cabe em 8k; um catálogo não cabe em nada, e é melhor entregar o
 * começo dizendo que cortou do que estourar o contexto do turno.
 */
export function extrairPagina(html: string, opts: { maxChars?: number; baseUrl?: string } = {}): PaginaExtraida {
  const maxChars = opts.maxChars ?? 12_000
  const titulo = extrairTitulo(html)
  const descricao = extrairDescricao(html)

  let corpo = html
  // Comentários primeiro: um `<!-- <script> -->` bagunçaria a remoção abaixo.
  corpo = corpo.replace(/<!--[\s\S]*?-->/g, " ")
  // O <head> inteiro sai: título e descrição já foram extraídos acima, e o
  // que sobra ali (title, meta, link) só repete informação no corpo.
  corpo = corpo.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, " ")
  for (const tag of BLOCOS_MORTOS) {
    corpo = corpo.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " ")
    // Tag não fechada (acontece em HTML real) — remove ao menos a abertura.
    corpo = corpo.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), " ")
  }

  const links = coletarLinks(corpo, opts.baseUrl)

  // Quebra de linha onde havia bloco, para o texto não virar uma linha só.
  corpo = corpo
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<h([1-6])\b[^>]*>/gi, "\n\n")
    // Tag INLINE some sem deixar espaço: `<b>na hora</b>.` tem de virar
    // "na hora.", não "na hora ." — o espaço solto antes da pontuação
    // aparece em toda frase com negrito e suja a leitura do modelo.
    .replace(
      /<\/?(?:b|strong|i|em|u|s|span|a|code|mark|small|sub|sup|abbr|time|font|label)\b[^>]*>/gi,
      "",
    )
    .replace(/<[^>]+>/g, " ")

  const texto = decodificarEntidades(corpo)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  const truncado = texto.length > maxChars
  return {
    titulo,
    descricao,
    texto: truncado ? `${texto.slice(0, maxChars)}…` : texto,
    truncado,
    links,
  }
}

const MAX_LINKS = 40

function coletarLinks(html: string, baseUrl?: string): Array<{ texto: string; url: string }> {
  const out: Array<{ texto: string; url: string }> = []
  const vistos = new Set<string>()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.length < MAX_LINKS) {
    const href = m[1].trim()
    // Âncora interna e javascript: não levam a lugar nenhum que a IA possa abrir.
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) continue
    let url = href
    if (baseUrl) {
      try {
        url = new URL(href, baseUrl).toString()
      } catch {
        continue
      }
    }
    if (vistos.has(url)) continue
    const texto = decodificarEntidades(m[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
    if (!texto) continue
    vistos.add(url)
    out.push({ texto, url })
  }
  return out
}
