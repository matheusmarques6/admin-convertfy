/**
 * Ler uma consulta inteira do PostgREST, em páginas.
 *
 * O PostgREST devolve no máximo **1.000 linhas** por requisição e não avisa
 * que cortou: a resposta chega com 200 e o código soma o que veio. É o
 * mesmo defeito que já custou caro nas transcrições ("todo select de blocos
 * é PAGINADO") e que estava de volta no dashboard — o trend por loja lia
 * `store_daily_metrics` sem paginar, e com 63 lojas × 90 dias são ~5.670
 * linhas: **dois terços do período sumiam** e metade das lojas ganhava uma
 * seta de tendência calculada sobre outro pedaço de tempo.
 *
 * `.limit(10000)` NÃO resolve — o teto do servidor vence o do cliente.
 *
 * O resultado diz se o teto foi atingido (`truncado`), para quem chama poder
 * declarar a lacuna em vez de mostrar um número que parece completo.
 */

/** Página do PostgREST: o teto do servidor, não uma escolha nossa. */
export const PAGINA_POSTGREST = 1000

export interface ResultadoPaginado<T> {
  linhas: T[]
  /** O teto de segurança foi atingido — há mais dado do que foi lido. */
  truncado: boolean
}

export interface OpcoesPaginacao {
  /** Teto de segurança: uma consulta mal filtrada não pode varrer a base. */
  teto?: number
  /** Tamanho da página. Acima de 1.000 o servidor corta assim mesmo. */
  tamanho?: number
}

type Resposta<T> = { data: T[] | null; error: { message?: string } | null }

/**
 * Chama `consulta(de, ate)` (índices inclusivos, como `.range()`) até a
 * página vir incompleta, o teto ser atingido, ou dar erro.
 *
 * **Erro no meio devolve o que já veio, marcado como truncado** — não lança:
 * a alternativa seria derrubar o card inteiro por causa da última página, e
 * o chamador tem como dizer que o dado está parcial.
 */
export async function lerPaginado<T>(
  consulta: (de: number, ate: number) => PromiseLike<Resposta<T>>,
  opts: OpcoesPaginacao = {},
): Promise<ResultadoPaginado<T>> {
  const tamanho = Math.max(1, Math.min(opts.tamanho ?? PAGINA_POSTGREST, PAGINA_POSTGREST))
  const teto = Math.max(tamanho, opts.teto ?? 50_000)
  const linhas: T[] = []

  for (let de = 0; de < teto; de += tamanho) {
    const ate = Math.min(de + tamanho, teto) - 1
    const { data, error } = await consulta(de, ate)
    if (error) return { linhas, truncado: true }
    const pagina = data ?? []
    linhas.push(...pagina)
    // Página incompleta = acabou. É o único sinal que o PostgREST dá.
    if (pagina.length < ate - de + 1) return { linhas, truncado: false }
  }
  return { linhas, truncado: true }
}
