/**
 * Comment gate: a palavra que abre o funil.
 *
 * O carrossel diz "comente SEGMENTO e eu te mando no direct". Quem decide
 * se um comentário É esse pedido é esta função — e ela erra para os dois
 * lados com custo diferente:
 *
 * - Casar de MENOS perde o lead que fez o que foi pedido.
 * - Casar de MAIS manda mensagem a quem não pediu. Isso é spam, e a Meta
 *   pune a conta que faz.
 *
 * Por isso o casamento é por PALAVRA, não por pedaço de texto: "41" não
 * pode disparar em "3410", e "guia" não pode disparar em "guiaram". O
 * preço é declarado: o plural simples entra ("segmentos" casa "segmento"),
 * qualquer outra flexão não.
 *
 * Puro e testado. Quem lê o comentário é o dispatcher das automações.
 */

/** Minúsculas, sem acento — quem comenta escreve como quer. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/** Palavras do texto: pontuação e emoji viram separador. */
export function tokens(texto: string): string[] {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
}

/**
 * As chaves configuradas. Aceita várias separadas por vírgula ou ponto e
 * vírgula ("SEGMENTO, SEGMENTAR") — o operador raramente acerta de
 * primeira como o público vai escrever.
 */
export function chavesDe(config: string | null | undefined): string[][] {
  if (!config) return []
  return config
    .split(/[,;]/)
    .map((c) => tokens(c))
    .filter((t) => t.length > 0)
}

/** A sequência de palavras aparece nos tokens, em ordem e coladas? */
function contem(alvo: string[], chave: string[]): boolean {
  if (chave.length === 0 || chave.length > alvo.length) return false
  for (let i = 0; i + chave.length <= alvo.length; i++) {
    let bate = true
    for (let j = 0; j < chave.length; j++) {
      const t = alvo[i + j]
      const c = chave[j]
      // Plural simples é o mesmo pedido; qualquer outra flexão não é.
      if (t !== c && t !== `${c}s`) {
        bate = false
        break
      }
    }
    if (bate) return true
  }
  return false
}

/**
 * O comentário (ou a mensagem) pede a palavra-chave?
 *
 * Sem chave configurada devolve `true`: o filtro não foi pedido, e uma
 * automação sem filtro tem de continuar disparando como antes.
 */
export function mensagemCasaPalavra(texto: string | null | undefined, config: string | null | undefined): boolean {
  const chaves = chavesDe(config)
  if (chaves.length === 0) return true
  if (!texto) return false
  const alvo = tokens(texto)
  if (alvo.length === 0) return false
  return chaves.some((c) => contem(alvo, c))
}

/** Rótulo curto das chaves, para a tela e para o nome da automação. */
export function rotuloDasChaves(config: string | null | undefined): string {
  return chavesDe(config)
    .map((c) => c.join(" ").toUpperCase())
    .join(" · ")
}
