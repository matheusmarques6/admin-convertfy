/**
 * Onde uma {{TAG}} mora no HTML — o trecho ao redor dela, legível.
 *
 * O painel Schema × HTML mostrava, para cada campo, o endereço
 * `{{MAIÚSCULA_DA_KEY}}`. Só que esse endereço é CALCULADO a partir da key:
 * ele não foi lido do documento. Quem via `{{PRODUCT_1_NAME}}` na tela e ia
 * procurar no HTML não achava, e a conclusão natural era "de onde saiu esse
 * nome?" — quando a resposta é que ele ainda não existe lá.
 *
 * Com o trecho ao lado, a diferença fica visível sem explicação: tag ancorada
 * mostra o pedaço do documento onde está; campo sem tag não mostra nada,
 * porque não há nada para mostrar.
 *
 * Puro, client-safe.
 */

export interface TagContext {
  /** Texto antes da tag, já limpo (pode vir vazio). */
  before: string
  /** Texto depois da tag, já limpo. */
  after: string
  /** A tag aparece mais de uma vez no documento. */
  repeated: boolean
}

/** Marcação fora, entidades básicas dentro, espaços colapsados. */
function readable(fragment: string): string {
  return fragment
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;|&[a-z]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Trecho ao redor da primeira ocorrência de `{{TAG}}`.
 *
 * `radius` é medido no HTML CRU, não no texto limpo — depois de tirar a
 * marcação sobra bem menos, e é por isso que a janela é generosa: numa tabela
 * de email, 400 caracteres de HTML podem ser três palavras de texto.
 *
 * null = a tag não está no documento.
 */
export function tagContext(
  html: string,
  tag: string,
  radius = 400,
): TagContext | null {
  if (!html || !tag) return null
  const re = new RegExp(`\\{\\{\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g")
  const first = re.exec(html)
  if (!first) return null
  const repeated = re.exec(html) !== null

  const start = first.index
  const end = start + first[0].length
  return {
    before: readable(html.slice(Math.max(0, start - radius), start)).slice(-70),
    after: readable(html.slice(end, end + radius)).slice(0, 70),
    repeated,
  }
}
