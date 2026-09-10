/**
 * Qual moeda vale quando o cache e o cadastro discordam.
 *
 * A conversão do dashboard lia `store_revenue_summary.currency` — que é um
 * SNAPSHOT: o sync copia a moeda de `client_stores` no instante em que roda
 * e nunca mais a revisita. Corrigir a moeda da loja no cadastro (à mão ou
 * pela plataforma) NÃO reescreve as linhas de cache já gravadas, então a
 * tela seguia convertendo pela moeda antiga até alguém re-sincronizar
 * aquele período — e nada em lugar nenhum dizia que as duas discordavam.
 *
 * O cadastro é a fonte: é o que o operador corrige e o que a sincronia de
 * plataforma escreve. O cache é derivado. Quando divergem, **o cadastro
 * vence e a divergência é DECLARADA** — porque a conversão pelo valor certo
 * ainda pode estar errada em sentido oposto (dado gravado em outra moeda),
 * e quem olha precisa saber que aquela loja tem cache velho.
 *
 * Puro: sem I/O.
 */

/** Nome canônico, com o default do resto do código. */
function normalizar(m: string | null | undefined): string {
  return (m || "").trim().toUpperCase()
}

export interface MoedaResolvida {
  /** A moeda a usar na conversão. */
  moeda: string
  /** O cache e o cadastro discordam — a linha foi sincronizada antes da correção. */
  divergente: boolean
  /** A moeda que está no cache, quando ela existe e é outra. */
  moedaDoCache?: string
}

/**
 * `moedaDoCadastro` = `client_stores.currency` (a fonte).
 * `moedaDoCache`    = `store_revenue_summary.currency` (o snapshot).
 *
 * Sem cadastro, o cache vale — ele foi copiado de um cadastro que existia.
 * Sem nenhum dos dois, `BRL`, como o resto do código.
 */
export function moedaDaLinha(
  moedaDoCadastro: string | null | undefined,
  moedaDoCache: string | null | undefined,
): MoedaResolvida {
  const cadastro = normalizar(moedaDoCadastro)
  const cache = normalizar(moedaDoCache)

  if (!cadastro) return { moeda: cache || "BRL", divergente: false }
  if (!cache || cache === cadastro) return { moeda: cadastro, divergente: false }
  return { moeda: cadastro, divergente: true, moedaDoCache: cache }
}
