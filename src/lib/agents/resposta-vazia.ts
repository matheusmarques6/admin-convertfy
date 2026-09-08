/**
 * Resposta vazia é quase sempre TETO, e o erro precisa dizer isso.
 *
 * Módulo PURO. Existe por causa de duas runs com o mesmo desfecho e nenhuma
 * pista na tela:
 *
 *   copy_fit 5d7396b5 (02/09) — GPT-5.4 mini herdou `effort: medium` com
 *     `max_tokens` 1500. Gastou tudo pensando e devolveu string vazia.
 *   subject (08/09) — trocado para Fable, cujo raciocínio é OBRIGATÓRIO,
 *     com os 400 tokens que sobravam para o Sonnet. Mesmo desfecho.
 *
 * Nos dois casos a run gravou `Unexpected end of JSON input`, que é o
 * `JSON.parse("")` do caller — o sintoma mais distante possível da causa. O
 * provedor não erra: do lado dele a chamada deu certo, o orçamento acabou
 * antes da primeira letra da resposta.
 *
 * O raciocínio sai do MESMO `max_tokens` da resposta. Então todo modelo que
 * pensa por padrão consome teto antes de escrever, e um teto dimensionado
 * para um modelo que não pensa vira falha silenciosa ao trocar de modelo.
 * Como a troca é um `UPDATE` no banco (`email_agent_configs`), ela acontece
 * sem deploy, sem revisão e sem ninguém reler o teto ao lado.
 *
 * Por isso o diagnóstico mora aqui e não no log: o texto vai para
 * `email_generation_runs.error_message`, que é onde alguém olha.
 */

export interface RespostaVaziaContexto {
  model: string
  /** Teto pedido na config do agente. */
  maxTokens: number
  /** `usage.completion_tokens` — inclui os tokens de raciocínio. */
  tokensOutput?: number
  /** `finish_reason` do provedor: `length` é o teto batendo. */
  finishReason?: string
  /** `completion_tokens_details.reasoning_tokens`, quando reportado. */
  reasoningTokens?: number
}

/**
 * Mensagem de erro para uma resposta que voltou vazia.
 *
 * Não decide SE é erro — quem chama já sabe que o texto está vazio. Decide
 * o que dizer, e diz o suficiente para alguém agir sem abrir o banco.
 */
export function motivoDeRespostaVazia(ctx: RespostaVaziaContexto): string {
  const partes: string[] = []
  partes.push(`resposta vazia de '${ctx.model}'`)

  const bateuOTeto =
    ctx.finishReason === "length" ||
    ctx.finishReason === "max_tokens" ||
    (typeof ctx.tokensOutput === "number" && ctx.tokensOutput >= ctx.maxTokens)

  if (typeof ctx.reasoningTokens === "number" && ctx.reasoningTokens > 0) {
    partes.push(
      `${ctx.reasoningTokens} dos ${ctx.maxTokens} tokens foram para o raciocínio`,
    )
  } else if (typeof ctx.tokensOutput === "number") {
    partes.push(`${ctx.tokensOutput} de ${ctx.maxTokens} tokens consumidos`)
  } else {
    partes.push(`max_tokens=${ctx.maxTokens}`)
  }

  if (ctx.finishReason) partes.push(`finish_reason=${ctx.finishReason}`)

  partes.push(
    bateuOTeto
      ? "o orçamento acabou antes da resposta — aumente max_tokens do agente em email_agent_configs"
      : "o modelo não escreveu nada; confira max_tokens do agente e o prompt",
  )

  return partes.join("; ")
}

/**
 * Resposta vazia, com o consumo grudado.
 *
 * A chamada JÁ FOI PAGA quando isto sobe. Perder os números aqui é o mesmo
 * modo de falha que o `withUsage` dos chains da fase 2 existe para evitar:
 * o custo de uma falha some da telemetria e ninguém sabe que gastou.
 */
export class RespostaVaziaError extends Error {
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly costUsd: number
  readonly finishReason?: string
  readonly reasoningTokens?: number

  constructor(
    ctx: RespostaVaziaContexto & {
      tokensInput?: number
      costUsd?: number
    },
  ) {
    super(motivoDeRespostaVazia(ctx))
    this.name = "RespostaVaziaError"
    this.tokensInput = ctx.tokensInput ?? 0
    this.tokensOutput = ctx.tokensOutput ?? 0
    this.costUsd = ctx.costUsd ?? 0
    if (ctx.finishReason) this.finishReason = ctx.finishReason
    if (typeof ctx.reasoningTokens === "number") {
      this.reasoningTokens = ctx.reasoningTokens
    }
  }
}
