/**
 * background-fit — o fundo de um elemento tem de ter o tamanho que o
 * elemento DECLARA.
 *
 * Por que existe (Innova Bay, 02/09): a variante `welcome - hero section 5`
 * põe um `<td background="URL" style="background-size:598px 1217px">` e o
 * cadastro do campo diz que o arquivo de fundo é a COMPOSIÇÃO de uma faixa
 * chapada (585px, cor primária, onde mora todo o texto) com a foto de
 * 598 × 632px na base. O pipeline gerou a foto no tamanho certo e o merge a
 * escreveu no token — e o email client esticou 632px para 1217px: a foto
 * virou fundo de tudo e o "Welcome to INNOVABAY" caiu em cima da pessoa.
 * Nenhum código lia o `background-size`.
 *
 * A composição é aritmética (1217 − 632 = 585) e vira código. Este módulo
 * é a parte PURA: acha os boxes de fundo com tamanho declarado, decide de
 * que lado a foto pousa e troca a URL nas ocorrências do documento. Quem
 * busca/compõe/sobe a imagem é `image/compose-background.ts` (sharp) a
 * partir do runner.
 */

export interface BackgroundBox {
  /** URL que está no `background=` (e, em regra, no `url()` e no `v:fill`). */
  url: string
  /** Largura declarada (`background-size` ou `v:rect`). */
  width: number
  /** Altura declarada. */
  height: number
  /**
   * Cor de fundo do próprio elemento (`background-color` do style, senão
   * `bgcolor`), já na forma `#RRGGBB` quando era hex; null quando o
   * elemento não declara.
   */
  color: string | null
  /** De onde saiu o tamanho — telemetria. */
  size_source: "background-size" | "vml"
}

export type PhotoSide = "top" | "bottom"

const BG_ATTR_RE = /<(td|th|table|div|body)\b[^>]*\bbackground\s*=\s*(["'])(.*?)\2[^>]*>/gi
const STYLE_RE = /\bstyle\s*=\s*(["'])(.*?)\1/i
const BGCOLOR_RE = /\bbgcolor\s*=\s*(["'])(.*?)\1/i
const BG_SIZE_RE = /background-size\s*:\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/i
const BG_COLOR_RE = /background-color\s*:\s*([^;'"]+)/i
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function normalizeHex(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  if (!HEX_RE.test(t)) return t || null
  if (t.length === 4) {
    const [, r, g, b] = t
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return t.toUpperCase()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Tamanho declarado no VML (`<v:rect style="width:598px;height:1217px">`
 * contendo `<v:fill src="URL">`) — fallback quando o CSS não traz
 * `background-size`. Outlook é justamente o cliente que mais precisa do
 * arquivo no tamanho exato (`type="frame"` estica o que receber).
 */
function vmlSizeFor(html: string, url: string): { width: number; height: number } | null {
  const rectRe = /<v:rect\b([^>]*)>([\s\S]*?)<\/v:rect>|<v:rect\b([^>]*)>([\s\S]{0,600}?)<v:fill\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = rectRe.exec(html))) {
    const attrs = m[1] ?? m[3] ?? ""
    const inner = m[2] ?? m[4] ?? ""
    if (!inner.includes(url)) continue
    const style = STYLE_RE.exec(attrs)?.[2] ?? ""
    const w = /width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(style)?.[1]
    const h = /height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(style)?.[1]
    if (w && h) return { width: Math.round(Number(w)), height: Math.round(Number(h)) }
  }
  return null
}

/**
 * Elementos com `background="URL"` e tamanho declarado. URL sem tamanho
 * (nem `background-size` nem `v:rect`) fica de fora — não há o que
 * conformar. Tokens crus (sem `://`) também ficam de fora: são slots que o
 * merge ainda não preencheu.
 */
export function findBackgroundBoxes(html: string): BackgroundBox[] {
  const out: BackgroundBox[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  BG_ATTR_RE.lastIndex = 0
  while ((m = BG_ATTR_RE.exec(html))) {
    const url = m[3].trim()
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue
    const tag = m[0]
    const style = STYLE_RE.exec(tag)?.[2] ?? ""
    const size = BG_SIZE_RE.exec(style)
    let width: number
    let height: number
    let size_source: BackgroundBox["size_source"]
    if (size) {
      width = Math.round(Number(size[1]))
      height = Math.round(Number(size[2]))
      size_source = "background-size"
    } else {
      const vml = vmlSizeFor(html, url)
      if (!vml) continue
      width = vml.width
      height = vml.height
      size_source = "vml"
    }
    if (!(width > 0 && height > 0)) continue
    const color =
      normalizeHex(BG_COLOR_RE.exec(style)?.[1]) ??
      normalizeHex(BGCOLOR_RE.exec(tag)?.[2])
    seen.add(url)
    out.push({ url, width, height, color, size_source })
  }
  return out
}

const LADO_BASE = /\b(base|abaixo|inferior(?:es)?|embaixo|bottom|rodap[ée])\b/i
const LADO_TOPO = /\b(topo|acima|superior(?:es)?|top|cabe[cç]alho)\b/i

/**
 * Lado do box em que a foto pousa quando é menor que ele. Lê o cadastro do
 * campo (guidance + image_spec): "base do ativo de fundo, abaixo da faixa
 * chapada" → bottom. Sem pista → bottom: a faixa chapada é onde o texto
 * mora, e o texto mora no topo.
 */
export function photoSide(cadastro: string | null | undefined): PhotoSide {
  const t = cadastro ?? ""
  if (LADO_BASE.test(t)) return "bottom"
  if (LADO_TOPO.test(t)) return "top"
  return "bottom"
}

/**
 * Troca a URL em TODAS as ocorrências do documento — atributo
 * `background=`, `url('…')` no CSS inline e `src` do `v:fill` no
 * comentário MSO. Casamento literal: as URLs geradas são assinadas e únicas.
 */
export function replaceUrlEverywhere(
  html: string,
  from: string,
  to: string,
): { html: string; replaced: number } {
  if (!from || from === to) return { html, replaced: 0 }
  const re = new RegExp(escapeRe(from), "g")
  let replaced = 0
  const out = html.replace(re, () => {
    replaced++
    return to
  })
  return { html: out, replaced }
}
