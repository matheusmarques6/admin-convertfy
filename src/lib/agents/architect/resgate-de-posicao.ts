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
 * referência (`fixtures/hero-boxers-welcome-1.ts`) pede `remocao_de_risco`
 * na posição 3 e lista `remocao_de_risco` nos descartes (o Estruturador
 * descartou um ITEM da referência, "política de devolução em linguagem
 * simples", e a normalização carimbou o dispositivo da família). Aplicar o
 * descarte ali mataria a posição certa. Variante sem dispositivo
 * cadastrado nunca custa `Infinity`: não saber não é violar — mas custa
 * 75 quando a posição PEDE um dispositivo, senão ela empata com quem
 * acerta e ganha no desempate por menor uso (ver `custoDeIncompatibilidade`).
 *
 * ── O dispositivo pedido é FILTRO, não preço (Passo 19, 15/09) ────────
 *
 * Até aqui o dispositivo errado custava 150 — caro, e finito. Finito é o
 * problema: `filtrarPorRequisitos` é fail-open no CONJUNTO (zerou a seção,
 * devolve todas), então uma posição que pede `remocao_de_risco` numa seção
 * onde nenhuma variante o realiza chegava aqui com o pool inteiro, e a
 * "menos incompatível" era uma `comparacao_pareada` — outra FORMA, entregue ao
 * cliente no lugar da decidida. O fail-open está certo para redação (preço,
 * avaliação: a copy compensa) e para não esvaziar a shortlist do Curador;
 * está errado para a forma, que é o que a posição É.
 *
 * Agora quem realiza dispositivo CONHECIDO e diferente sai do pool antes de
 * pontuar, e pool vazio devolve `null`: a posição cai e a lacuna sobe
 * nomeada ("falta `remocao_de_risco` em body"), que é o pedido de cadastro
 * exato. Por isso o preço de 150 saiu — duas regras para a mesma coisa
 * deixariam o próximo leitor sem saber qual vence.
 *
 * **Variante sem dispositivo cadastrado NÃO é eliminada.** O número que
 * motivou a guarda: 8 das 17 variantes ativas de `hero` tinham a coluna NULL
 * em 15/09 (o backfill da B3 subiu como proposta reversível e o NOT NULL
 * ainda não existe). Um filtro literal (`c.dispositivo === pedido`) apagaria
 * 47% da hero, e hero vazia é FATAL desde o Passo 11 (`lacuna_biblioteca`):
 * transformaria falta de CADASTRO em falha de geração. **As 8 foram
 * classificadas no mesmo dia e hoje a biblioteca tem zero ativas sem
 * dispositivo** — a guarda fica porque o NOT NULL continua não existindo e
 * a próxima variante nasce NULL de novo; o que a torna barata é o preço de
 * 75 em `custoDeIncompatibilidade`, que impede a não classificada de vencer
 * quem acerta. A comparação é a de `conflitoDeDispositivo`, a MESMA do
 * filtro de elegibilidade — reescrever um `===` aqui divergiria em caixa e
 * acento, que é o engano por apelido que este repo já pagou.
 *
 * Módulo PURO: quem escolhe o resgate decide o que vai ao cliente, e um
 * engano aqui é uma seção errada no e-mail de uma marca.
 */

import type { DecisaoDescarte } from "../shared/decisao-do-email"
import { conflitoDeDispositivo } from "../shared/dispositivos"
import { conflitoDeContrato, type ContratoResumo, type RequisitosDuros } from "../shared/field-roles"

import { normalizarSecao, podeRepetir } from "./repeticao"

export interface CandidataParaResgate {
  variant_id: string
  nome?: string
  contrato?: ContratoResumo
  /**
   * Quantas peças esta variante já montou nesta loja (15/09). Ausente = 0.
   * É o mesmo número que o Curador vê em `<uso_por_variante>`: os dois
   * desempatam pela MESMA régua, senão o resgate desfaz a rotação que o
   * Curador acabou de fazer.
   */
  usos?: number
}

export interface Resgate {
  variant_id: string
  /** O que ela viola — vai à telemetria e ao `slot_map`. */
  motivo: string
  custo: number
  /** Candidatas que ficaram de fora por realizar dispositivo DESCARTADO pela decisão. */
  descartadas_por_dispositivo: number
  /**
   * Candidatas que ficaram de fora por realizar OUTRO dispositivo que não o
   * PEDIDO pela posição (Passo 19). É contagem separada da de cima de
   * propósito: "a decisão recusou esta forma" e "esta forma não é a que a
   * posição pede" pedem ações opostas da curadoria — a primeira é acerto do
   * filtro, a segunda é lacuna de biblioteca.
   */
  fora_do_dispositivo: number
}

/**
 * Candidatas que realizam o dispositivo PEDIDO pela posição (Passo 19).
 *
 * Sem pedido, devolve todas. Variante de dispositivo NULL (não classificada)
 * fica: não saber não é violar — ver o cabeçalho para o número medido.
 */
export function doDispositivoPedido<T extends { contrato?: ContratoResumo }>(
  candidatas: readonly T[],
  requisitos: RequisitosDuros | null | undefined,
): { dentro: T[]; fora: number } {
  const pedido = requisitos?.dispositivo
  if (!pedido) return { dentro: [...candidatas], fora: 0 }
  const dentro = candidatas.filter((c) => !conflitoDeDispositivo(c.contrato?.dispositivo, pedido))
  return { dentro, fora: candidatas.length - dentro.length }
}

/**
 * Descartes que valem para esta posição: os que nomeiam o dispositivo que
 * a própria posição pede são ignorados (ver o cabeçalho — o caso
 * `remocao_de_risco` da decisão de referência).
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
  // Dispositivo ERRADO não tem preço (Passo 19): é filtro em
  // `doDispositivoPedido`, antes de pontuar. Cobrar aqui também seria duas
  // regras para a mesma coisa, e a finita venceria a outra em silêncio.
  //
  // Dispositivo AUSENTE é o caso que o filtro deliberadamente deixa passar,
  // e ele precisa de preço. Sem nada, a não classificada EMPATAVA em 0 com
  // quem acerta, e aí decidia o desempate seguinte, que desde 15/09 é o
  // MENOR USO — premiando quem não tem etiqueta exatamente por não ter.
  // Medido no dia em que as 8 heroes novas entraram sem classificação: numa
  // posição que pede `oferta_de_ajuda`, a `hero section 9` (a certa, 25
  // escolhas em 45 dias) perdia para a `hero section 13` (um e-mail inteiro
  // de Black Friday, 0 escolhas). 75 é metade do que o dispositivo errado
  // custava, e continua finito de propósito: não saber não é violar, e
  // eliminar por falta de cadastro é o que o filtro acima existe para não
  // fazer.
  //
  if (r.dispositivo && !c.dispositivo) custo += 75
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
 * descartado) ou quando nenhuma realiza o dispositivo PEDIDO (Passo 19): a
 * posição fica sem variante e o chamador decide o desfecho — é preferível a
 * entrar com o que a decisão recusou, ou com outra forma.
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

  // Passo 19: a FORMA é filtro, não desempate. Quem realiza outro
  // dispositivo sai antes de pontuar; sem ninguém do dispositivo pedido, a
  // posição cai e a lacuna sobe com o nome do que falta.
  const { dentro, fora } = doDispositivoPedido(pool, requisitos)
  if (dentro.length === 0) return null

  const pontuadas = ordenarCandidatas(dentro, requisitos, descartes)

  const descartadas = pontuadas.filter((p) => p.custo === Infinity).length
  const finitas = pontuadas.filter((p) => p.custo !== Infinity)
  if (finitas.length === 0) return null
  const { variant_id, custo, motivo } = finitas[0]
  return { variant_id, custo, motivo, descartadas_por_dispositivo: descartadas, fora_do_dispositivo: fora }
}

/** Uma candidata pontuada, na ordem em que o resgate a consideraria. */
export interface CandidataPontuada {
  variant_id: string
  custo: number
  motivo: string
  distancia: number
  usos: number
  copy: number
}

/**
 * A ordem em que o resgate considera as candidatas de uma posição. Pura.
 *
 * Extraída de dentro do `menosIncompativel` (16/09) por dois motivos: ela é
 * a régua que decide qual peça vai ao cliente quando o Curador deixou a
 * posição vazia, e estava inline, sem teste próprio — o desempate por
 * "anatomia mais rica" sobreviveu meses assim.
 *
 * **Ficou de fora, e é dívida declarada**: cobrar custo por slug de
 * convivência já consumido na peça. O resgate não recebe as convivências
 * (elas moram em `CuradorVaultKnowledge`, que este módulo não vê), e
 * inventar a régua sem o dado seria a armadilha de sempre — regra servida
 * sobre campo que não chega.
 */
export function ordenarCandidatas(
  candidatas: ReadonlyArray<CandidataParaResgate>,
  requisitos: RequisitosDuros | null | undefined,
  descartes: ReadonlyArray<Pick<DecisaoDescarte, "dispositivo">> | null | undefined = null,
): CandidataPontuada[] {
  // Alvo de itens: o mínimo pedido, senão o máximo, senão indiferente.
  const alvoDeItens = requisitos?.n_itens?.min ?? requisitos?.n_itens?.max ?? null

  return candidatas
    .map((c) => ({
      variant_id: c.variant_id,
      custo: custoDeIncompatibilidade(c.contrato, requisitos, descartes),
      motivo: (c.contrato ? conflitoDeContrato(c.contrato, requisitos) : null) ?? "sem conflito de contrato",
      // Desempates. Medido em 11/09: quatro variantes de products empatam em
      // custo 3 (todas entregam a grade pedida e nenhuma mostra preço), e
      // escolher por UUID entre elas é sorteio — numa peça que vai ao
      // cliente. Quem chega mais perto do número de itens pedido vence.
      distancia: alvoDeItens == null ? 0 : Math.abs((c.contrato?.n_itens ?? 1) - alvoDeItens),
      // Depois, a MENOS usada — a mesma régua do Curador (15/09). Antes
      // vinha `b.copy - a.copy`, comentado como "a anatomia mais rica, que
      // tem mais onde acomodar o que falta": um desempate que premia, por
      // escrito, quem tem mais campos. Como a variante que serve a tudo
      // nunca colide com requisito positivo, ela chegava ao desempate com
      // frequência e o ganhava sempre.
      //
      // A troca NÃO é para "menos campos", que seria o viés oposto
      // inventado: é para a rotação que o protocolo do vault já manda
      // ("vence a menos usada no histórico… rotaciona o criativo em vez de
      // viciar na mesma peça").
      usos: c.usos ?? 0,
      copy: c.contrato?.copy ?? 0,
    }))
    .sort(
      (a, b) =>
        a.custo - b.custo ||
        a.distancia - b.distancia ||
        a.usos - b.usos ||
        // A anatomia mais rica continua desempatando, agora em último: ela
        // tem mais onde acomodar o que falta, e entre duas igualmente
        // pouco usadas isso ainda é o melhor palpite.
        b.copy - a.copy ||
        // Último desempate por id, para a escolha ser estável entre
        // execuções: duas variantes idênticas na régua não podem alternar a
        // cada geração.
        a.variant_id.localeCompare(b.variant_id),
    )
}
