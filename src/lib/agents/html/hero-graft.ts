/**
 * hero-graft — ENXERTO da variante da biblioteca na região da hero.
 *
 * Raiz do problema (Luxe Lift, 28/07): o Montador (LLM) escrevia o
 * documento inteiro e, ao "montar", ACHATAVA a variante — perdia a banda
 * escura do logo, o segundo CTA, o subtítulo. O agente de hero recebia
 * essa região achatada e, sem espelho utilizável (`rendered_html` das
 * variantes é um mockup-imagem de ~1.7KB, não HTML estrutural), só podia
 * reproduzir o que recebeu.
 *
 * Aqui o código substitui a região da hero pelo HTML CANÔNICO da variante
 * escolhida (`html_tagged` aprovado, senão `html`) — byte a byte igual à
 * biblioteca, com os `{{PLACEHOLDERS}}` intactos para o merge preencher.
 * Nenhum LLM participa: o documento passa a ser a variante.
 *
 * Puro (zero I/O) — testável.
 */

import { locateHeroRegion, spliceHero } from "./hero-locator"

export type GraftStatus =
  | "grafted"
  /** Documento sem região de hero identificável — nada a enxertar. */
  | "no_region"
  /** Variante ausente/vazia — mantém a região do Montador. */
  | "no_variant"
  /** Fragmento da variante inutilizável (sem tabela/linha). */
  | "invalid_variant"

export interface GraftResult {
  html: string
  status: GraftStatus
  /** Tamanho da região substituída (0 quando não enxertou). */
  replaced_len: number
  /** Tamanho do fragmento da variante enxertado. */
  variant_len: number
}

/**
 * A região da hero no documento do Montador vive DENTRO da tabela
 * container (600px), então o enxerto precisa ser uma sequência de
 * `<tr>`/`<table>` válida naquele ponto:
 *   - fragmento que já começa com <tr>     → usa direto
 *   - fragmento que começa com <table>     → embrulha em <tr><td>
 *   - qualquer outra coisa (div solto...)  → recusa (invalid_variant)
 * Nunca "conserta" o fragmento: ou ele encaixa, ou o enxerto é recusado
 * e a região do Montador é mantida.
 */
function adaptFragment(variantHtml: string): string | null {
  const t = variantHtml.trim()
  if (!t) return null
  if (/^<tr[\s>]/i.test(t)) return t
  if (/^<table[\s>]/i.test(t)) {
    return `<tr>\n<td align="center" style="padding:0;">\n${t}\n</td>\n</tr>`
  }
  // Comentário inicial é comum nas variantes — pula e reavalia.
  const afterComment = t.replace(/^(?:<!--[\s\S]*?-->\s*)+/, "")
  if (afterComment !== t) return adaptFragment(afterComment)
  return null
}

/**
 * Enxerta a variante na região da hero. O resultado sai com as sentinelas
 * `cfy:hero` (mesmo mecanismo do splice do agente), então todo o resto do
 * pipeline — localizador, posse de tags, guards — continua funcionando
 * sem alteração.
 */
export function graftHeroVariant(
  documentHtml: string,
  variantHtml: string | null | undefined,
): GraftResult {
  const base: Omit<GraftResult, "status"> = {
    html: documentHtml,
    replaced_len: 0,
    variant_len: 0,
  }
  if (!variantHtml || !variantHtml.trim()) {
    return { ...base, status: "no_variant" }
  }
  const region = locateHeroRegion(documentHtml)
  if (!region) return { ...base, status: "no_region" }

  const fragment = adaptFragment(variantHtml)
  if (!fragment) return { ...base, status: "invalid_variant" }

  return {
    html: spliceHero(documentHtml, region, fragment),
    status: "grafted",
    replaced_len: region.end - region.start,
    variant_len: fragment.length,
  }
}

// ── Tipografia da loja (decisão do Matheus: fonte SEMPRE a da loja) ────

const FONT_FAMILY_RE = /font-family\s*:\s*([^;"']+)/gi
const FONT_SIZE_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)px/i
const BOLD_RE = /font-weight\s*:\s*(?:[6-9]00|bold)/i
const HEADING_TAG_RE = /<h[1-3][\s>]/i
/** Tamanho a partir do qual a declaração é tratada como display/heading. */
const HEADING_MIN_PX = 20

const DECL_OPEN = `"'{>`
const DECL_CLOSE = `"'}<`

/**
 * Contexto da declaração: só o bloco `style="..."` (ou a regra CSS) onde ela
 * vive, mais o nome da tag que a carrega. Uma janela de N chars vazaria o
 * `font-size` do irmão anterior e classificaria corpo como título.
 */
function declarationContext(html: string, offset: number): string {
  let start = offset
  while (start > 0 && !DECL_OPEN.includes(html[start - 1])) start--
  let end = offset
  while (end < html.length && !DECL_CLOSE.includes(html[end])) end++
  const lt = html.lastIndexOf("<", offset)
  const tag = lt === -1 ? "" : html.slice(lt, Math.min(offset, lt + 8))
  return `${tag} ${html.slice(start, end)}`
}

/** Heurística de papel: tamanho grande, peso alto ou <h1..3> ⇒ heading. */
function looksLikeHeading(ctx: string): boolean {
  const size = FONT_SIZE_RE.exec(ctx)
  if (size && Number(size[1]) >= HEADING_MIN_PX) return true
  return BOLD_RE.test(ctx) || HEADING_TAG_RE.test(ctx)
}

/**
 * Normaliza `font-family` no HTML para as fontes da loja: a de heading nas
 * declarações com cara de título (fonte grande / peso alto), a de body no
 * resto. Componentes da biblioteca vêm de origens diferentes (Arial,
 * Courier, Trebuchet...) — sem isso o email fica com 3 tipografias.
 *
 * Preserva a cadeia de fallback (`, Helvetica, sans-serif`) do original
 * para não quebrar clientes sem webfont.
 */
export function normalizeFonts(
  html: string,
  fonts: { heading?: string | null; body?: string | null },
): { html: string; replaced: number } {
  const heading = (fonts.heading ?? "").trim()
  const body = (fonts.body ?? "").trim()
  if (!heading && !body) return { html, replaced: 0 }

  let replaced = 0
  const out = html.replace(FONT_FAMILY_RE, (match, stack: string, offset: number) => {
    const ctx = declarationContext(html, offset)
    const wanted = looksLikeHeading(ctx) ? heading || body : body || heading
    if (!wanted) return match
    // Mantém os fallbacks genéricos que já existiam na declaração.
    const fallbacks = stack
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^(?:Arial|Helvetica|Georgia|Verdana|Tahoma|sans-serif|serif|monospace)$/i.test(s))
    const chain = [quoteIfNeeded(wanted), ...fallbacks]
    const uniq = Array.from(new Set(chain))
    replaced++
    return `font-family:${uniq.join(",")}`
  })
  return { html: out, replaced }
}

function quoteIfNeeded(name: string): string {
  return /\s/.test(name) && !/^['"]/.test(name) ? `'${name}'` : name
}
