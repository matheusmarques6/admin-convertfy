/**
 * Cadeia de fallback derivada da fonte da LOJA, não herdada do componente.
 *
 * Saiu de `hero-graft.ts` para um módulo sem dependências porque os tokens
 * de identidade (B5) precisam dela e são consumidos pelo `fragment-fit`, que
 * o `hero-graft` importa — mantê-la lá fecharia um ciclo de imports.
 *
 * Histórico (jul/2026): a versão anterior preservava as famílias genéricas
 * que já estavam na declaração, com uma lista branca que incluía
 * `monospace` e `serif`. O resultado media assim:
 *
 *     Courier New,Courier,monospace  →  Montserrat,monospace
 *     Georgia,serif                  →  Montserrat,Georgia,serif
 *
 * Marca sans-serif com monoespaçada como plano B. E como o webfont é
 * ignorado por parte dos clientes, o plano B é o que muita gente vê — o
 * email da Luxe Lift saiu monoespaçado por causa disto.
 *
 * A cadeia combina com a fonte pedida. A classificação é pelo NOME porque é
 * o que temos: a identidade visual guarda o nome da família, não a
 * classificação tipográfica. Errar aqui degrada para uma sans — o padrão
 * seguro em email — em vez de contradizer a marca.
 */

/** Nomes que denunciam uma serifada / monoespaçada de marca. */
const SERIF_HINT =
  /serif|georgia|garamond|times|playfair|merriweather|lora|baskerville|didot|bodoni|caslon/i
const MONO_HINT = /mono|courier|consol|code|typewriter/i

export function fallbackChainFor(name: string): string {
  if (MONO_HINT.test(name)) return "'Courier New',Courier,monospace"
  if (SERIF_HINT.test(name)) return "Georgia,'Times New Roman',serif"
  return "Arial,Helvetica,sans-serif"
}

export function quoteIfNeeded(name: string): string {
  return /\s/.test(name) && !/^['"]/.test(name) ? `'${name}'` : name
}

/** `Poppins` → `Poppins,Arial,Helvetica,sans-serif`; `Open Sans` ganha aspas. */
export function pilhaDeFonte(name: string): string {
  const n = name.trim()
  if (!n) return ""
  return `${quoteIfNeeded(n)},${fallbackChainFor(n)}`
}

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

