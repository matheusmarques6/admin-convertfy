/**
 * repeticao — a mesma variante pode servir mais de uma posição do e-mail?
 *
 * Até 07/09 a resposta era "nunca": o parser do Montador desfazia a
 * repetição em qualquer seção (`dedupeDecisions`) e o medidor do Curador
 * acusava `variante_repetida` em qualquer par de posições. As duas coisas
 * nasceram do mesmo incidente (Luxe Lift 23/08, posições 2 e 3 idênticas)
 * e generalizaram demais: repetir um bloco de corpo, de oferta ou de CTA é
 * decisão de composição legítima — o e-mail é uma peça, não um catálogo de
 * componentes distintos.
 *
 * Duas seções continuam ÚNICAS por peça, e por razões diferentes:
 *
 * - `hero`: o documento marca a região da hero e `locateHeroRegion` recusa
 *   por ambiguidade quando acha duas — a geração inteira morre em
 *   `hero_failed`. Aqui a unicidade é requisito mecânico da fase 2.
 * - `products`: o feed puxa os mesmos `top_products` da loja. Repetido, o
 *   leitor vê a MESMA grade duas vezes na mesma peça — não é variação de
 *   argumento, é duplicata visível.
 *
 * Puro (zero I/O). Fonte única da normalização de nome de seção, para que
 * o medidor, o parser e a montagem não divirjam sobre o que é "hero".
 */

/** Seções que só podem aparecer UMA vez com a mesma variante na peça. */
export const SECOES_UNICAS = ["hero", "products"] as const

export function normalizarSecao(section: string): string {
  return section.trim().toLowerCase()
}

/**
 * A repetição da mesma variante nesta seção é permitida?
 *
 * Seção desconhecida (string vazia, nome novo) devolve `true`: o padrão é
 * permitir, e inventar restrição sobre nome que não conhecemos foi
 * exatamente o erro que este módulo desfaz.
 */
export function podeRepetir(section: string): boolean {
  return !SECOES_UNICAS.includes(
    normalizarSecao(section) as (typeof SECOES_UNICAS)[number],
  )
}
