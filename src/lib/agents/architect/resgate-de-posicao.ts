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
 *   • **Redação** (não mostra avaliação) é barato: a copy do n8n põe a
 *     nota na linha de apoio. É a mesma lição de 07/09, quando
 *     `proibido_neste_toque` era servido com força de veto ao Curador, ele
 *     eliminou reviews, cupom, urgência e origem da marca, e a peça saiu
 *     com o rodapé sozinho — restrição de REDAÇÃO desempata, não elimina.
 *   • **Anatomia** (grade com menos itens que o mínimo, slot de cupom numa
 *     peça sem oferta, e — desde 14/09 — preço sem slot) é caro: a copy não
 *     cria slot que não existe, e o example do cupom fica no HTML porque
 *     `pareceExemplo` não o reconhece.
 *
 * No caso medido a régua troca products-4 (1 item, preço riscado, prazo)
 * por products-7 (2 painéis de produto, sem preço) — que é exatamente o que
 * a decisão pediu: dois produtos, boxer no primeiro card. O "de/por" e o
 * prazo que faltariam em products-4 eram inventados, e inventar oferta é o
 * pior erro possível aqui.
 *
 * ── O que a régua errou, e a correção (Passo 11, 14/09) ──────────────
 *
 * O comentário acima dizia "o preço entra pela copy". **Não entrou**: o
 * batch 6249aef2 saiu com products-7 na posição 5 e nenhum preço — o slot
 * que não existe na anatomia a copy não cria. `preco` deixou de custar 3
 * (o mesmo que uma avaliação) e passou a custar 40: abaixo de um item a
 * menos na grade, acima de tudo o mais. E o resgate pôs body-4 (comparação
 * categoria-vs-loja) na posição 3 quando o Estruturador tinha DESCARTADO
 * esse dispositivo com motivo ("bloco defensivo no 1º toque cria a dúvida
 * que pretende curar"). Descarte é decisão, não desempate: a variante que
 * realiza um dispositivo descartado custa `Infinity`, e sem candidata
 * finita o resgate devolve `null` — a posição cai e o e-mail reprova em
 * `lacuna_biblioteca`, com o nome do que falta, em vez de sair contra a
 * decisão.
 *
 * O descarte é comparado com o dispositivo da VARIANTE (coluna B3), nunca
 * com o requisito da posição — e um descarte que nomeia o MESMO dispositivo
 * que a posição pede é ignorado. Não é caso teórico: a decisão de
 * referência (`fixtures/hero-boxers-welcome-1.ts`) pede `body_garantias`
 * na posição 2 e lista `body_garantias` nos descartes (o Estruturador
 * descartou um ITEM da referência, "política de devolução em linguagem
 * simples", e a normalização carimbou o dispositivo da família). Aplicar o
 * descarte ali mataria a posição certa. Variante sem dispositivo
 * cadastrado nunca custa `Infinity`: não saber não é violar.
 *
 * Módulo PURO: quem escolhe o resgate decide o que vai ao cliente, e um
 * engano aqui é uma seção errada no e-mail de uma marca.
 */

import type { DecisaoDescarte } from "../shared/decisao-do-email"
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
  /** Candidatas que ficaram de fora por realizar dispositivo DESCARTADO pela decisão. */
  descartadas_por_dispositivo: number
}

/**
 * Descartes que valem para esta posição: os que nomeiam o dispositivo que
 * a própria posição pede são ignorados (ver o cabeçalho — o caso
 * `body_garantias` da decisão de referência).
 */
export function descartesEfetivos(
  descartes: ReadonlyArray<Pick<DecisaoDescarte, "dispositivo">> | null | undefined,
  r: RequisitosDuros | null | undefined,
): Set<string> {
  const out = new Set<string>()
  for (const d of descartes ?? []) {
    if (!d?.dispositivo) continue
    if (r?.dispositivo && d.dispositivo === r.dispositivo) continue
    out.add(d.dispositivo)
  }
  return out
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
  descartes: ReadonlyArray<Pick<DecisaoDescarte, "dispositivo">> | null | undefined = null,
): number {
  // Sem contrato não dá para medir. Custo simbólico: não saber não é o
  // mesmo que violar, e excluir por falta de cadastro deixaria a posição
  // vazia justamente pelo defeito que este módulo existe para cobrir.
  if (!c) return 1
  // Dispositivo DESCARTADO pela decisão não entra por resgate: o
  // Estruturador o recusou com motivo, e "menos incompatível" não pode
  // significar "contra a decisão". Vale mesmo sem requisito na posição.
  if (c.dispositivo && descartesEfetivos(descartes, r).has(c.dispositivo)) return Infinity
  if (!r) return 0
  let custo = 0
  // Dispositivo (B3): outra FORMA não realiza o papel — pesa mais que cupom.
  // Variante sem dispositivo (não classificada) não paga: não saber não é
  // violar.
  if (r.dispositivo && c.dispositivo && c.dispositivo !== r.dispositivo) custo += 150
  // Slot de cupom sem oferta: o merge deixa "Use code: [WELCOME-CODE]" no
  // HTML e o e-mail promete um desconto que não existe.
  if (r.cupom === false && c.tem_cupom) custo += 100
  if (r.cupom === true && !c.tem_cupom) custo += 100
  if (r.cta === false && c.tem_cta) custo += 5
  if (r.cta === true && !c.tem_cta) custo += 5
  // Preço é ANATOMIA, não redação (medido em 11/09: a copy não pôs preço
  // nenhum em products-7). Custa 40 — um item a menos na grade, que é a
  // outra falta que ninguém conserta depois.
  if (r.preco === true && !c.tem_preco) custo += 40
  // Avaliação continua CONTEÚDO: cabe na linha de apoio que a variante tem.
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
 * `jaUsadas` respeita a regra de repetição de `repeticao.ts`. Hoje
 * `podeRepetir` responde `false` para TODA seção ("o bloco repetido é uma
 * peça que parece defeito", depois do Luxe Lift): o resgate busca OUTRA
 * variante da seção, nunca a já usada. Se a regra voltar a ter exceção,
 * ela nasce lá e este módulo a obedece sem mudar.
 *
 * `null` também quando toda candidata custa `Infinity` (dispositivo
 * descartado): a posição fica sem variante e o chamador decide o desfecho
 * — é preferível a entrar com o que a decisão recusou.
 */
export function menosIncompativel(
  candidatas: CandidataParaResgate[],
  requisitos: RequisitosDuros | null | undefined,
  section: string,
  jaUsadas: ReadonlySet<string> = new Set(),
  descartes: ReadonlyArray<Pick<DecisaoDescarte, "dispositivo">> | null | undefined = null,
): Resgate | null {
  const repetivel = podeRepetir(normalizarSecao(section))
  const pool = repetivel ? candidatas : candidatas.filter((c) => !jaUsadas.has(c.variant_id))
  if (pool.length === 0) return null

  // Alvo de itens: o mínimo pedido, senão o máximo, senão indiferente.
  const alvoDeItens = requisitos?.n_itens?.min ?? requisitos?.n_itens?.max ?? null

  const pontuadas = pool
    .map((c) => ({
      variant_id: c.variant_id,
      custo: custoDeIncompatibilidade(c.contrato, requisitos, descartes),
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

  const descartadas = pontuadas.filter((p) => p.custo === Infinity).length
  const finitas = pontuadas.filter((p) => p.custo !== Infinity)
  if (finitas.length === 0) return null
  const { variant_id, custo, motivo } = finitas[0]
  return { variant_id, custo, motivo, descartadas_por_dispositivo: descartadas }
}
