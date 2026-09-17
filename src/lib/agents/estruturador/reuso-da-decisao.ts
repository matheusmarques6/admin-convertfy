/**
 * reuso-da-decisao — quando a janela não comporta refazer, a decisão
 * vigente do Estruturador vale.
 *
 * A fase 1 síncrona tem 770s (o teto do `maxDuration` da Vercel é 800). Com
 * `anthropic/claude-sonnet-5` e raciocínio nos três agentes, medido em
 * 11/09 (batch 1ea00ba9): Seletor 65s + Estruturador 260s + Curador 442s
 * (shortlist 103 + escolha 339) = **767s**, e a escolha do Curador ainda
 * foi CORTADA no fim. Não é ajuste de número: os três não cabem juntos.
 *
 * Quem cede é o Estruturador, e por dois motivos:
 *
 * 1. **O Curador não é pulável.** Sem variante nenhuma,
 *    `coberturaSuficiente` recusa a montagem e a fase 2 morre em
 *    `hero_failed` — pior que um 504, porque parece sucesso.
 * 2. **A decisão do Estruturador já está no banco.** O `parsed_output` da
 *    run bem-sucedida carrega `estrutura[]` inteira (papel, requisitos),
 *    `fio_narrativo`, `diagnostico` e `text_only`. Refazê-la custa 260s
 *    para produzir, quase sempre, a mesma coisa.
 *
 * Então ceder aqui NÃO é degradar: é usar o que já foi decidido, em vez de
 * gastar a janela do agente que não tem substituto. Sem decisão vigente o
 * Estruturador roda — ele é a primeira vez, e é o Curador que vai apertar;
 * a run dele fica gravada e a passada seguinte já reusa.
 *
 * Puro (zero I/O) — a leitura do banco fica no service.
 */

import { cabeNaJanela, custoTipicoDoAgente } from "../fase1-orcamento"

export interface DecisaoDaJanela {
  /** `rodar` chama o modelo; `reusar` usa a decisão vigente. */
  acao: "rodar" | "reusar"
  /** Texto de gente — vai para a run e para a tela. */
  motivo?: string
}

export function decidirPelaJanela(input: {
  /** Teto de tokens do agente — vira o custo estimado da chamada. */
  maxTokens: number
  /** O que resta da janela da fase 1; `null` = sem janela aberta. */
  restanteMs: number | null
  /** O que as etapas SEGUINTES precisam (o Curador, sobretudo). */
  reservaMs: number
  /** Existe decisão vigente deste e-mail para reusar? */
  temVigente: boolean
  /**
   * Pinado numa execução MANUAL — "não execute; a decisão gravada vale".
   *
   * Vem antes da conta de janela porque é pedido explícito de quem está na
   * tela, não estimativa. Sem isto o pin do Estruturador caía no ramo de
   * DESATIVADO (`gateFor` devolve `disabled: true` para os dois) e a
   * estrutura vinha do OUTLINE em vez da decisão gravada — o pin prometia
   * uma coisa e entregava outra, em silêncio.
   *
   * `temVigente` continua mandando: pin sem artefato não vira reuso aqui.
   * Quem recusa antes de gastar é `verificarPins`, com I/O; esta função é
   * pura e só pode se defender do caso em que a decisão não existe.
   */
  pinado?: boolean
}): DecisaoDaJanela {
  if (input.pinado) {
    return input.temVigente
      ? { acao: "reusar", motivo: "pinado nesta execução — a decisão gravada vale" }
      : { acao: "rodar", motivo: "pinado, mas não há decisão vigente para reusar" }
  }
  // Sem janela aberta o comportamento é o de sempre: roda. É o caminho de
  // quem chama estes serviços por fora da fase 1.
  if (input.restanteMs == null) return { acao: "rodar" }
  // O custo é o MEDIDO, não o teto de tokens. Estimar pelo teto (371s para
  // 32.000) e reservar para o Curador ao mesmo tempo é pedir duas vezes o
  // mesmo tempo — foi assim que este agente parou de rodar em 11/09.
  const cabe = cabeNaJanela({
    custoMs: custoTipicoDoAgente("estruturador", input.maxTokens),
    restanteMs: input.restanteMs,
    reservaMs: input.reservaMs,
  })
  if (cabe.cabe) return { acao: "rodar" }
  // Não cabe e não há o que reusar: roda assim mesmo. Pular aqui deixaria a
  // peça sem sequência decidida e o Curador sem o papel de cada posição —
  // o fallback genérico, que é o pior resultado dos três.
  if (!input.temVigente) {
    return { acao: "rodar", motivo: `${cabe.motivo}, mas não há decisão vigente para reusar` }
  }
  return { acao: "reusar", motivo: cabe.motivo }
}
