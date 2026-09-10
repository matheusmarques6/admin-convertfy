/**
 * repeticao — a mesma variante pode servir mais de uma posição do e-mail?
 *
 * **Não. Nunca, em nenhuma seção** (decisão do dono, 10/09).
 *
 * ── O histórico, porque ele explica a regra ───────────────────────────
 *
 * Até 07/09 a resposta já era "nunca", vinda do incidente Luxe Lift
 * (23/08, posições 2 e 3 idênticas). Em 07/09 a regra foi AFROUXADA para
 * `hero` e `products` apenas, com o argumento de que repetir um corpo, uma
 * oferta ou um CTA seria composição legítima — e que desfazer a escolha do
 * Curador rebaixava o encaixe em nome de uma variedade que ninguém pediu.
 *
 * O argumento não sobreviveu ao primeiro caso concreto. No Welcome 1 da
 * Hero Boxers (09/09) a `body 3` ocupou as posições 2 E 3: mesma anatomia,
 * mesmos três selos, mesmo ritmo visual, coladas uma na outra. O Curador
 * não escolheu repetir por composição — ele DECLAROU lacuna nas duas
 * posições ("body 2 festivo e body 4 comparativo vetados no toque 1",
 * "CTA é lacuna da biblioteca") e repetiu por não ter opção. Ainda custou
 * três imagens geradas e descartadas.
 *
 * A lição: "repetição pode ser composição" é verdade em tese e, na
 * prática, indistinguível de "a biblioteca não tinha o bloco". Quando as
 * duas leituras produzem o mesmo pixel, vale a que não entrega peça pobre
 * ao cliente.
 *
 * ── O que acontece quando não há alternativa ──────────────────────────
 *
 * A posição fica SEM variante e sai da peça (`dedupeDecisions`), em vez de
 * receber a repetida. Um bloco a menos é uma peça mais curta; o bloco
 * repetido é uma peça que parece defeito. A lacuna aparece em
 * `dedupSemAlternativa` e no `slot_map`, que é onde a curadoria a vê e
 * pode cobrar o cadastro do bloco que falta.
 *
 * Isso NÃO derruba a geração: `coberturaSuficiente` só recusa a referência
 * quando a sequência pede hero e nenhuma hero entra — peça com hero e
 * poucas seções é POBRE, não inviável.
 *
 * Puro (zero I/O). Fonte única da normalização de nome de seção, para que
 * o medidor, o parser e a montagem não divirjam sobre o que é "hero".
 */

export function normalizarSecao(section: string): string {
  return section.trim().toLowerCase()
}

/**
 * A repetição da mesma variante nesta seção é permitida?
 *
 * Sempre `false`. A função existe (em vez de os chamadores simplesmente
 * assumirem a proibição) para manter UM lugar onde a regra é declarada e
 * justificada — e para que, se um dia voltar a haver exceção, ela nasça
 * aqui, com nome e motivo, em vez de espalhada por três módulos.
 *
 * O parâmetro é mantido pela mesma razão: a assinatura diz que a decisão é
 * POR SEÇÃO, mesmo que hoje todas respondam igual.
 */
export function podeRepetir(_section: string): boolean {
  return false
}
