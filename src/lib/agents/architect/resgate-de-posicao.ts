/**
 * A posição que o Curador deixou vazia não pode sumir do e-mail.
 *
 * ── O que foi medido (Hero Boxers, welcome 1, 11/09) ──────────────────
 *
 * O Estruturador decidiu 6 posições. O e-mail entregue tinha 4: `body` [1]
 * e `products` [4] evaporaram, e o cliente perguntou onde estava o feed de
 * produtos.
 *
 * Em `products` o código eliminou 8 das 9 variantes da seção pelo motivo
 * literal "não mostra preço e a decisão exige preço". Sobrou UMA
 * (products-4), então o fail-open de `filtrarPorRequisitos` não disparou
 * (`zerou: false`) — ele só cobre o caso em que o CÓDIGO zera a seção. Aí o
 * modelo descartou também essa uma (grade de 1 item contra o mínimo de 2, e
 * anatomia que obriga preço riscado + selo de prazo, dados que o alvo
 * declara inexistentes) e devolveu `escolhas: []`, escrevendo na
 * justificativa:
 *
 *     "a posição fica na peça e cai no template global"
 *
 * **Não cai.** `assembleDocument` diz, no próprio comentário: "Posição sem
 * variante é pulada … Nada é puxado do template curado para preencher a
 * lacuna." Não existe fallback POR BLOCO — só por documento inteiro. O
 * Curador decidiu sob premissa falsa, e é a mesma classe de engano que já
 * custou uma geração em 07/09 ("cai no global, que TEM hero" — o global do
 * welcome-1 tem 21.314 chars e nenhum marcador `cfy:hero`).
 *
 * ── A régua ──────────────────────────────────────────────────────────
 *
 * Entre "a seção some" e "a seção entra com a variante menos incompatível",
 * a segunda vence — e o custo de cada incompatibilidade NÃO é o mesmo:
 *
 *   • **Redação** (não mostra preço, não mostra avaliação) é barato: a copy
 *     do n8n põe o preço no subtítulo. É a mesma lição de 07/09, quando
 *     `proibido_neste_toque` era servido com força de veto ao Curador, ele
 *     eliminou reviews, cupom, urgência e origem da marca, e a peça saiu
 *     com o rodapé sozinho — restrição de REDAÇÃO desempata, não elimina.
 *   • **Anatomia** (grade com menos itens que o mínimo, slot de cupom numa
 *     peça sem oferta) é caro: a copy não cria slot que não existe, e o
 *     example do cupom fica no HTML porque `pareceExemplo` não o reconhece.
 *
 * No caso medido a régua troca products-4 (1 item, preço riscado, prazo)
 * por products-7 (2 painéis de produto, sem preço) — que é exatamente o que
 * a decisão pediu: dois produtos, boxer no primeiro card. O preço entra
 * pela copy; o "de/por" e o prazo que faltariam em products-4 eram
 * inventados, e inventar oferta é o pior erro possível aqui.
 *
 * Módulo PURO: quem escolhe o resgate decide o que vai ao cliente, e um
 * engano aqui é uma seção errada no e-mail de uma marca.
 */

import { conflitoDeContrato, type ContratoResumo, type RequisitosDuros } from "../shared/field-roles"

import { normalizarSecao, podeRepetir } from "./repeticao"

export interface CandidataParaResgate {
  variant_id: string
  nome?: string
  contrato?: ContratoResumo
}

export interface Resgate {
  variant_id: string
  /** O que ela viola — vai à telemetria e ao `slot_map`. */
  motivo: string
  custo: number
}

/**
 * Quanto custa aceitar esta variante apesar do requisito.
 *
 * Números, e não uma ordem de `if`, porque uma variante pode violar mais de
 * um requisito e o total é o que decide. `conflitoDeContrato` devolve só o
 * PRIMEIRO conflito (é o que o prompt precisa ler); aqui a conta é cheia.
 */
export function custoDeIncompatibilidade(
  c: ContratoResumo | undefined,
  r: RequisitosDuros | null | undefined,
): number {
  // Sem contrato não dá para medir. Custo simbólico: não saber não é o
  // mesmo que violar, e excluir por falta de cadastro deixaria a posição
  // vazia justamente pelo defeito que este módulo existe para cobrir.
  if (!c) return 1
  if (!r) return 0
  let custo = 0
  // Slot de cupom sem oferta: o merge deixa "Use code: [WELCOME-CODE]" no
  // HTML e o e-mail promete um desconto que não existe.
  if (r.cupom === false && c.tem_cupom) custo += 100
  if (r.cupom === true && !c.tem_cupom) custo += 100
  if (r.cta === false && c.tem_cta) custo += 5
  if (r.cta === true && !c.tem_cta) custo += 5
  // Preço e avaliação são CONTEÚDO: cabem no título, no subtítulo ou na
  // linha de apoio que a variante já tem.
  if (r.preco === true && !c.tem_preco) custo += 3
  if (r.avaliacao === true && !c.tem_avaliacao) custo += 3
  if (r.avaliacao === false && c.tem_avaliacao) custo += 3
  const { min, max } = r.n_itens ?? {}
  // `n_itens: null` é "a anatomia não tem família numerada" — e numa posição
  // que pede 2+ itens isso significa UM, não "qualquer quantidade". Medido
  // em 11/09: products-4 (`product_name`, `price_new`, sem índice) tem
  // `n_itens: null` e por isso escapa do mínimo de 2 em `conflitoDeContrato`
  // — foi o MODELO, não o código, que a recusou por grade. Aqui a conta é o
  // que a variante entrega de fato.
  const entrega = c.n_itens ?? 1
  // Item ALÉM do máximo some sozinho: `arbitrarCampos` marca `omitir` e o
  // merge remove a linha. Falta de slot ninguém conserta.
  if (typeof max === "number" && entrega > max) custo += 10 * (entrega - max)
  if (typeof min === "number" && entrega < min) custo += 40 * (min - entrega)
  return custo
}

/**
 * A menos incompatível da seção, ou `null` quando não há o que resgatar.
 *
 * `jaUsadas` respeita a regra de repetição: `hero` porque duas regiões
 * fazem `locateHeroRegion` recusar por ambiguidade e a peça morre em
 * `hero_failed`; `products` porque o feed puxa os mesmos `top_products` e a
 * MESMA grade apareceria duas vezes. Fora dessas duas, repetir é composição
 * legítima e o resgate pode reusar.
 */
export function menosIncompativel(
  candidatas: CandidataParaResgate[],
  requisitos: RequisitosDuros | null | undefined,
  section: string,
  jaUsadas: ReadonlySet<string> = new Set(),
): Resgate | null {
  const repetivel = podeRepetir(normalizarSecao(section))
  const pool = repetivel ? candidatas : candidatas.filter((c) => !jaUsadas.has(c.variant_id))
  if (pool.length === 0) return null

  // Alvo de itens: o mínimo pedido, senão o máximo, senão indiferente.
  const alvoDeItens = requisitos?.n_itens?.min ?? requisitos?.n_itens?.max ?? null

  const pontuadas = pool
    .map((c) => ({
      variant_id: c.variant_id,
      custo: custoDeIncompatibilidade(c.contrato, requisitos),
      motivo: (c.contrato ? conflitoDeContrato(c.contrato, requisitos) : null) ?? "sem conflito de contrato",
      // Desempates. Medido em 11/09: quatro variantes de products empatam em
      // custo 3 (todas entregam a grade pedida e nenhuma mostra preço), e
      // escolher por UUID entre elas é sorteio — numa peça que vai ao
      // cliente. Quem chega mais perto do número de itens pedido vence; em
      // seguida, a anatomia mais rica, que tem mais onde acomodar o que
      // falta (o preço entra na linha de apoio que a variante já tem).
      distancia: alvoDeItens == null ? 0 : Math.abs((c.contrato?.n_itens ?? 1) - alvoDeItens),
      copy: c.contrato?.copy ?? 0,
    }))
    .sort(
      (a, b) =>
        a.custo - b.custo ||
        a.distancia - b.distancia ||
        b.copy - a.copy ||
        // Último desempate por id, para a escolha ser estável entre
        // execuções: duas variantes idênticas na régua não podem alternar a
        // cada geração.
        a.variant_id.localeCompare(b.variant_id),
    )

  const { variant_id, custo, motivo } = pontuadas[0]
  return { variant_id, custo, motivo }
}
