/**
 * Busca da Gestão de Carteira.
 *
 * São 63 lojas espalhadas por sete colunas de kanban, e achar uma exigia
 * varrer coluna por coluna. A busca filtra os cards mantendo as colunas —
 * a etapa É a informação daquela tela (o estado da conta), então achatar
 * tudo numa lista destruiria justamente o que se foi olhar.
 *
 * Puro e testado porque busca que não acha esconde loja em silêncio: quem
 * procura "boxer" e vê o board vazio conclui que a loja não existe.
 */

/** Tira acento e caixa. "São Paulo" e "sao paulo" têm de casar. */
export function normalizarBusca(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export interface CardBuscavel {
  store_name?: string | null
  client_name?: string | null
  csm_name?: string | null
}

/**
 * Casa o termo contra loja, cliente e CSM.
 *
 * Os três porque são os três jeitos de procurar a mesma conta: pelo nome da
 * loja ("Boxer Shop UK"), pelo cliente que paga ("JMJC") ou pelo CSM
 * responsável ("Ryan") quando alguém quer ver a própria carteira.
 *
 * Cada palavra do termo precisa aparecer em ALGUM dos campos — "boxer uk"
 * acha "Boxer Shop UK", e a ordem das palavras não importa. Exigir a frase
 * inteira em UM campo faria "jmjc boxer" (cliente + loja) não achar nada,
 * que é uma busca natural para quem lê o card.
 */
export function cardCasaBusca(card: CardBuscavel, termo: string): boolean {
  const alvo = normalizarBusca(termo)
  if (!alvo) return true

  const feno = normalizarBusca(
    [card.store_name, card.client_name, card.csm_name].filter(Boolean).join(" "),
  )

  return alvo.split(/\s+/).every((palavra) => feno.includes(palavra))
}

/** Aplica a busca preservando a ordem original dos cards. */
export function filtrarCarteira<T extends CardBuscavel>(cards: T[], termo: string): T[] {
  if (!normalizarBusca(termo)) return cards
  return cards.filter((c) => cardCasaBusca(c, termo))
}
