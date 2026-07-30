/**
 * fragment-fit — encaixe de um fragmento de variante dentro da tabela
 * container de 600px.
 *
 * Um bloco da biblioteca precisa ser uma sequência `<tr>`/`<table>` válida
 * no ponto em que entra no documento:
 *   - fragmento que já começa com <tr>     → usa direto
 *   - fragmento que começa com <table>     → embrulha em <tr><td>
 *   - qualquer outra coisa (div solto...)  → recusa
 *
 * Nunca "conserta" o fragmento: ou ele encaixa, ou é recusado. Extraído do
 * `hero-graft` (story CM-2) para que o enxerto da hero e a montagem do
 * documento compartilhem UMA matriz de decisão.
 *
 * Puro (zero I/O) — testável.
 */

export interface FitOptions {
  /**
   * Embrulha em `<tr><td>` também o fragmento que não começa com
   * `<tr>`/`<table>` (um `<div>` solto, por exemplo).
   *
   * `false` (default) é o comportamento do **enxerto**: ele substitui uma
   * região existente e um fragmento estranho ali pode quebrar a tabela, então
   * recusa e mantém a região original — degradação segura.
   *
   * `true` é o comportamento da **montagem**: não há região a preservar, o
   * contexto é uma célula nova, e `<td><div>...</div></td>` é HTML de email
   * válido. Pular o bloco deixaria o email sem a seção, o que é pior que
   * embrulhar uma variante cadastrada fora do padrão.
   */
  wrapUnknown?: boolean
}

export type FitKind = "row" | "wrapped_table" | "wrapped_unknown"

export interface FitResult {
  html: string
  kind: FitKind
}

const wrap = (t: string): string =>
  `<tr>\n<td align="center" style="padding:0;">\n${t}\n</td>\n</tr>`

/**
 * Adapta o fragmento para o contexto de linha da tabela container.
 * Retorna `null` quando o fragmento não encaixa.
 */
export function fitFragment(
  variantHtml: string,
  opts: FitOptions = {},
): FitResult | null {
  const t = variantHtml.trim()
  if (!t) return null
  if (/^<tr[\s>]/i.test(t)) return { html: t, kind: "row" }
  if (/^<table[\s>]/i.test(t)) {
    return { html: wrap(t), kind: "wrapped_table" }
  }
  // Comentário inicial é comum nas variantes — pula e reavalia.
  const afterComment = t.replace(/^(?:<!--[\s\S]*?-->\s*)+/, "")
  if (afterComment !== t) return fitFragment(afterComment, opts)
  if (opts.wrapUnknown && t) return { html: wrap(t), kind: "wrapped_unknown" }
  return null
}

/** Atalho do enxerto: só o HTML, no modo conservador. */
export function fitFragmentToRow(variantHtml: string): string | null {
  return fitFragment(variantHtml)?.html ?? null
}
