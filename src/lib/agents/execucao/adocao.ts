/**
 * adocao — de quem é esta execução manual.
 *
 * O runner encontra a execução manual PELO E-MAIL (`email_execution_manual_viva`),
 * e nada mais: a decisão de não fazer nenhum parâmetro novo atravessar as três
 * fronteiras de processo do pipeline está declarada na rota manual. O preço
 * dela apareceu em 11/09, na Hero Boxers.
 *
 * O que aconteceu, medido: às 16:31 uma execução manual foi criada com
 * `assembler_chooser` e `blueprint` pinados; o operador saiu sem disparar, e a
 * linha ficou `running` com `batch_id` NULL. Às 16:38 ele disparou uma geração
 * NOVA, comum, e o runner adotou aquela execução — os pins valeram, o guard
 * `architect.fase1_pinada` curto-circuitou a fase 1 inteira e o Estruturador e
 * o Curador não rodaram. Nenhuma run `skipped`, nada em tela: na aba Execuções
 * os dois nós simplesmente não existiam.
 *
 * `gateFor` não podia impedir isso — ele pergunta pelo MODO, e o modo era
 * mesmo `manual`. A pergunta que faltava é outra: **esta execução é desta
 * geração?**
 *
 * Duas regras, e as duas são necessárias:
 *
 * 1. **Execução já carimbada só vale para o batch dela.** Uma vez adotada, a
 *    execução pertence àquela geração; outra geração do mesmo e-mail não a
 *    herda.
 * 2. **Execução ainda sem batch vale por pouco tempo.** Ela nasce sem batch
 *    por construção — a rota manual grava a linha e o batch só existe quando o
 *    disparo acontece, segundos depois. Mas sem prazo ela fica esperando para
 *    sequestrar a próxima geração daquele e-mail, que foi exatamente o caso
 *    (sete minutos depois). A janela é a distância normal entre gravar e
 *    disparar, com folga larga — não um palpite sobre quanto o operador demora
 *    para desistir.
 *
 * Puro (zero I/O) — o carimbo e a leitura ficam no serviço.
 */

/**
 * Quanto tempo uma execução manual recém-criada espera pelo disparo dela.
 *
 * Entre `POST /executions/manual` e o `generate-email` que ele devolve passam
 * segundos. Dois minutos cobrem cold start e fila com folga, e fecham a janela
 * de sete minutos do caso real.
 */
export const JANELA_DE_ADOCAO_MS = 2 * 60 * 1000

export interface DecisaoDeAdocao {
  adota: boolean
  /** Precisa carimbar o batch nesta execução (primeira adoção). */
  carimba: boolean
  /** Texto de gente para o log — nunca um código cru. */
  motivo?: string
}

export function decidirAdocao(input: {
  /** `batch_id` gravado na execução; null = ainda não adotada. */
  batchDaExecucao: string | null | undefined
  /** O batch da geração que está rodando agora. */
  batchAtual: string | null | undefined
  /** `started_at` da execução (ISO). */
  startedAt: string | null | undefined
  agora?: number
}): DecisaoDeAdocao {
  const dela = input.batchDaExecucao ?? null
  const atual = input.batchAtual ?? null

  // Já é dona de um batch: só aquele a usa.
  if (dela) {
    if (atual && dela === atual) return { adota: true, carimba: false }
    return {
      adota: false,
      carimba: false,
      motivo: `a execução pertence a outra geração (batch ${dela.slice(0, 8)})`,
    }
  }

  // Sem batch e sem saber qual é o atual: não há como carimbar, e adotar
  // deixaria a execução solta de novo. Vale o comportamento de produção.
  if (!atual) {
    return { adota: false, carimba: false, motivo: "geração sem batch para carimbar" }
  }

  const inicio = input.startedAt ? Date.parse(input.startedAt) : NaN
  // Sem data legível não dá para medir a espera. Adotar aqui é o caminho
  // antigo, e foi ele que contaminou a geração seguinte — na dúvida, produção.
  if (!Number.isFinite(inicio)) {
    return { adota: false, carimba: false, motivo: "execução sem início legível" }
  }

  const idade = (input.agora ?? Date.now()) - inicio
  if (idade > JANELA_DE_ADOCAO_MS) {
    const min = Math.round(idade / 60000)
    return {
      adota: false,
      carimba: false,
      motivo: `execução criada há ${min} min e nunca disparada — não é desta geração`,
    }
  }

  return { adota: true, carimba: true }
}
