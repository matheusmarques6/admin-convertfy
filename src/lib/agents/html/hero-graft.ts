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

import { fitFragmentToRow } from "./fragment-fit"
import { locateHeroRegion, spliceHero } from "./hero-locator"

export type GraftStatus =
  | "grafted"
  /**
   * A região JÁ é a variante — nada a trocar. É o caso normal desde a story
   * CM-2: o documento nasce concatenado dos HTMLs canônicos, então o enxerto
   * virou no-op no caminho principal. Continua necessário para reference
   * legada, gravada pelo Montador LLM e não regerada sem `force`.
   */
  | "already_canonical"
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

  const fragment = fitFragmentToRow(variantHtml)
  if (!fragment) return { ...base, status: "invalid_variant" }

  const spliced = spliceHero(documentHtml, region, fragment)
  const current = documentHtml.slice(region.start, region.end)
  // A região já é a variante (documento montado por código — CM-2): não há
  // troca a fazer. Distinguido de "grafted" para a telemetria mostrar que o
  // enxerto deixou de ser necessário, sem virar um no-op silencioso.
  const alreadyCanonical = normalizeForCompare(current) === normalizeForCompare(fragment)

  return {
    html: spliced,
    status: alreadyCanonical ? "already_canonical" : "grafted",
    replaced_len: region.end - region.start,
    variant_len: fragment.length,
  }
}

/**
 * Compara ignorando os comentários de controle e o espaço entre tags.
 *
 * No modo `marker` a região devolvida pelo locator INCLUI os marcadores
 * `cfy:block`, e o splice os troca pelas sentinelas `cfy:hero` — nenhum dos
 * dois é conteúdo, então os dois saem antes de comparar.
 */
function normalizeForCompare(html: string): string {
  return html
    .replace(/<!--\s*cfy:hero:(?:start|end)\s*-->/gi, "")
    .replace(/<!--\s*cfy:block:\d+:[A-Za-z0-9_-]+:(?:start|end)\s*-->/gi, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim()
}

// ── Tipografia da loja (decisão do Matheus: fonte SEMPRE a da loja) ────

/**
 * Valor de `font-family` até o `;` ou o fim da declaração.
 *
 * O `[^;"']+` anterior parava nas ASPAS — e como o `+` exige ao menos um
 * caractere, toda declaração cujo valor COMEÇA com aspas simplesmente não
 * casava, em silêncio e sem entrar no contador. Quem tem nome composto
 * precisa de aspas, então `'Courier New',Courier,monospace` e
 * `'Trebuchet MS',Arial,sans-serif` atravessavam a normalização intactos —
 * eram exatamente as duas fontes erradas do email da Luxe Lift (12/08).
 *
 * Agora o valor pode conter aspas; o corte é no `;`, no `}` ou na aspa que
 * FECHA o atributo `style`. Como o conteúdo é lido dentro de um `style="..."`,
 * a aspa dupla externa é o delimitador natural.
 */
const FONT_FAMILY_RE = /font-family\s*:\s*((?:'[^']*'|"[^"]*"|[^;}"'])+)/gi
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
  fonts: {
    heading?: string | null
    body?: string | null
    /** Peso de título da marca ("black 900", "700", "Bold") — opcional. */
    headingWeight?: string | null
    /** Peso de corpo da marca ("Regular 400") — opcional. */
    bodyWeight?: string | null
  },
): { html: string; replaced: number; weightsReplaced: number } {
  const heading = (fonts.heading ?? "").trim()
  const body = (fonts.body ?? "").trim()
  const headingWeight = pesoNumerico(fonts.headingWeight)
  const bodyWeight = pesoNumerico(fonts.bodyWeight)
  if (!heading && !body && !headingWeight && !bodyWeight) {
    return { html, replaced: 0, weightsReplaced: 0 }
  }

  let replaced = 0
  let out = html
  if (heading || body) {
    out = out.replace(FONT_FAMILY_RE, (match, stack: string, offset: number) => {
      const ctx = declarationContext(html, offset)
      const wanted = looksLikeHeading(ctx) ? heading || body : body || heading
      if (!wanted) return match
      void stack // a cadeia antiga não é reaproveitada — ver fallbackChainFor
      replaced++
      return `font-family:${quoteIfNeeded(wanted)},${fallbackChainFor(wanted)}`
    })
  }

  // PESO (02/09): a marca declara título `black 900` e corpo `400`, e o
  // documento só tinha 400 e 700 — "INNOVA BAY VS OTHERS" saiu em 700. O
  // peso da marca só viajava como var de PROMPT (hero/text_format), e o
  // text_format é pulado quando o merge resolve tudo; ninguém escrevia o
  // 900. Regra por código: declaração pesada (≥ 600 / bold) → peso de
  // título; leve (400 / normal) → peso de corpo. Sem peso declarado não
  // se inventa — herdar do container é decisão da variante.
  let weightsReplaced = 0
  if (headingWeight || bodyWeight) {
    out = out.replace(FONT_WEIGHT_RE, (match, valor: string) => {
      const v = valor.toLowerCase()
      const pesado = v === "bold" || v === "bolder" || (/^\d+$/.test(v) && Number(v) >= 600)
      const leve = v === "normal" || v === "regular" || (/^\d+$/.test(v) && Number(v) <= 500)
      const alvo = pesado ? headingWeight : leve ? bodyWeight : null
      if (!alvo || alvo === v) return match
      weightsReplaced++
      return `font-weight:${alvo}`
    })
  }
  return { html: out, replaced, weightsReplaced }
}

const FONT_WEIGHT_RE = /font-weight\s*:\s*([a-z]+|\d{3})/gi

/**
 * "black 900" → "900"; "Regular 400" → "400"; "Bold" → "700"; "700" → "700".
 * O cadastro de marca guarda o rótulo humano do peso, não o número.
 */
export function pesoNumerico(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase()
  if (!t) return null
  const num = /(\d{3})/.exec(t)
  if (num) return String(Math.min(900, Math.max(100, Number(num[1]))))
  const nomes: Record<string, string> = {
    thin: "100", hairline: "100", extralight: "200", "extra light": "200", ultralight: "200",
    light: "300", regular: "400", normal: "400", book: "400", medium: "500",
    semibold: "600", "semi bold": "600", demibold: "600", bold: "700",
    extrabold: "800", "extra bold": "800", ultrabold: "800", black: "900", heavy: "900",
  }
  for (const [nome, peso] of Object.entries(nomes)) if (t.includes(nome)) return peso
  return null
}

/** Nomes que denunciam uma serifada / monoespaçada de marca. */
const SERIF_HINT =
  /serif|georgia|garamond|times|playfair|merriweather|lora|baskerville|didot|bodoni|caslon/i
const MONO_HINT = /mono|courier|consol|code|typewriter/i

/**
 * Cadeia de fallback derivada da fonte da LOJA, não herdada do componente.
 *
 * A versão anterior preservava as famílias genéricas que já estavam na
 * declaração, com uma lista branca que incluía `monospace` e `serif`. O
 * resultado media assim:
 *
 *     Courier New,Courier,monospace  →  Montserrat,monospace
 *     Georgia,serif                  →  Montserrat,Georgia,serif
 *
 * Ou seja: marca sans-serif com monoespaçada como plano B. E como o webfont
 * é ignorado por parte dos clientes, o plano B é o que muita gente vê — o
 * email da Luxe Lift saiu monoespaçado por causa disto.
 *
 * A cadeia agora combina com a fonte pedida. A classificação é pelo NOME
 * porque é o que temos: a identidade visual guarda o nome da família, não a
 * classificação tipográfica. Errar aqui degrada para uma sans — o padrão
 * seguro em email — em vez de contradizer a marca.
 */
export function fallbackChainFor(name: string): string {
  if (MONO_HINT.test(name)) return "'Courier New',Courier,monospace"
  if (SERIF_HINT.test(name)) return "Georgia,'Times New Roman',serif"
  return "Arial,Helvetica,sans-serif"
}

function quoteIfNeeded(name: string): string {
  return /\s/.test(name) && !/^['"]/.test(name) ? `'${name}'` : name
}
