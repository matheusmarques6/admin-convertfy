/**
 * Repetir a chamada idêntica não conserta o que o teto cortou.
 *
 * O Seletor e o Estruturador têm `MAX_ATTEMPTS = 2` e, na falha, repetem
 * com a MESMA `config`. Quando a causa foi truncamento isso é dinheiro
 * queimado com ~0% de chance: o modelo gastou o teto pensando, o JSON veio
 * cortado, e a segunda chamada tem exatamente o mesmo teto. É por isso que,
 * em 10/09, `tokens_output` saiu no dobro do teto nos dois agentes —
 * 15.027 num teto de 8.192 e 30.750 num de 16.384, com
 * `erros_da_tentativa_anterior: ["resposta truncada no teto de 8192
 * tokens"]` gravado no banco.
 *
 * A regra já estava escrita em `llm-invoke.ts:147`, para o caso de resposta
 * vazia ("repetir a chamada com o mesmo teto falharia igual, cobrando de
 * novo"); ela nunca desceu para o loop dos serviços.
 *
 * Módulo PURO. A decisão fica testável e longe do I/O, que é onde a casa
 * manda que ela fique.
 *
 * ── A assimetria que manda no desenho ────────────────────────────────
 *
 * Repetir de menos custa uma geração que talvez convergisse na 2ª tentativa.
 * Repetir de mais custa uma chamada inteira — 240-360s e o preço cheio — para
 * morrer igual, e ainda come o orçamento da fase 1, derrubando etapas que
 * não podem ser puladas. Por isso só repete quem tem motivo para convergir:
 * teto maior, ou uma falha que a própria mensagem de correção explica.
 */

/** Por que a tentativa falhou. */
export type CausaDaFalha = "truncado" | "timeout" | "ilegivel" | "validacao"

export interface ClassificarFalhaInput {
  /** `finish_reason` do provedor — a evidência mais confiável. */
  finishReason?: string | null
  /** `usage.completion_tokens`, que inclui o raciocínio. */
  tokensOutput?: number | null
  /** O teto que ESTA tentativa usou (não o da config, que pode ter mudado). */
  maxTokens: number
  /** `error.message` do throw que chegou ao catch. */
  erro?: string | null
  /** true quando o erro é a reprovação do validador, não um parse quebrado. */
  ehValidacao?: boolean
}

/**
 * Classifica a falha, com o `finishReason` na frente.
 *
 * Hoje os dois serviços decidem só por `tokensOutput >= max_tokens`, que é a
 * evidência FRACA: o provedor pode reportar consumo abaixo do teto e ainda
 * assim ter cortado. `length`/`max_tokens` é a declaração explícita de que o
 * orçamento acabou, e vem de graça no `InvokeResult`.
 */
export function classificarFalha(input: ClassificarFalhaInput): CausaDaFalha {
  const erro = (input.erro ?? "").toLowerCase()
  // O abort do relógio vira `new Error("timeout")` em `llm-invoke.ts`.
  if (erro.includes("timeout") || erro.includes("aborted")) return "timeout"
  if (erro.includes("sem orçamento") || erro.includes("sem orcamento")) return "timeout"

  const fr = (input.finishReason ?? "").toLowerCase()
  if (fr === "length" || fr === "max_tokens") return "truncado"

  if (input.ehValidacao) return "validacao"

  if (
    typeof input.tokensOutput === "number" &&
    input.maxTokens > 0 &&
    input.tokensOutput >= input.maxTokens
  ) {
    return "truncado"
  }
  return "ilegivel"
}

export interface PlanoDeRetentativa {
  repetir: boolean
  /** O teto da PRÓXIMA tentativa. Igual ao atual quando não é o teto que falta. */
  maxTokens: number
  /** Texto de gente — vai para `error_message` e para a tela. */
  motivo: string
}

export interface PlanejarRetentativaInput {
  causa: CausaDaFalha
  /** 1-based: a tentativa que acabou de falhar. */
  tentativa: number
  maxAttempts: number
  tetoAtual: number
  /** Teto máximo do agente. Sem folga até ele, subir não é opção. */
  tetoMaximo: number
  /** Multiplicador do teto na retentativa por truncamento. */
  fator?: number
}

const seg = (ms: number) => Math.round(ms / 1000)

/**
 * Decide se vale uma nova tentativa e com que teto.
 *
 * `tetoMaximo` não é decoração: subir o teto sem limite estoura o relógio do
 * agente (o modelo gera ~90 tok/s, então cada token a mais é tempo) e infla
 * a reserva de crédito que o OpenRouter faz em voo.
 */
export function planejarRetentativa(input: PlanejarRetentativaInput): PlanoDeRetentativa {
  const { causa, tentativa, maxAttempts, tetoAtual, tetoMaximo } = input
  const fator = input.fator ?? 1.5
  const naoRepete = (motivo: string): PlanoDeRetentativa => ({
    repetir: false,
    maxTokens: tetoAtual,
    motivo,
  })

  if (tentativa >= maxAttempts) {
    return naoRepete(`tentativas esgotadas (${maxAttempts})`)
  }

  switch (causa) {
    case "timeout":
      // A 2ª tentativa tem o mesmo relógio e MENOS orçamento de fase 1 que a
      // primeira — ela morre igual, mais tarde, tendo comido o tempo do
      // Curador, que não é pulável.
      return naoRepete(
        "a chamada estourou o teto de tempo do agente; a 2ª tentativa teria o mesmo relógio e menos orçamento, e derrubaria as etapas seguintes",
      )

    case "truncado": {
      if (tetoAtual >= tetoMaximo) {
        return naoRepete(
          `resposta truncada já no teto máximo (${tetoMaximo} tokens) — repetir com o mesmo teto tem ~0% de chance e cobra de novo`,
        )
      }
      const novo = Math.min(Math.floor(tetoAtual * fator), tetoMaximo)
      return {
        repetir: true,
        maxTokens: novo,
        motivo: `resposta truncada em ${tetoAtual} tokens — nova tentativa com ${novo}`,
      }
    }

    case "ilegivel":
    case "validacao":
      // O retry foi escrito para estes dois: a mensagem de correção que vai
      // junto é o que faz a 2ª tentativa convergir. Teto não é o problema.
      return {
        repetir: true,
        maxTokens: tetoAtual,
        motivo:
          causa === "validacao"
            ? "alvo reprovado na validação — nova tentativa com as correções"
            : "resposta ilegível — nova tentativa com o mesmo teto",
      }
  }
}

/**
 * O aviso que a run de erro precisa carregar quando o abort comeu a conta.
 *
 * `AbortController` corta antes de ler o corpo, então `usage` nunca chega: a
 * run grava 0 tokens e $0,00 numa chamada que foi paga. Telemetria é
 * inegociável aqui — se o número não existe, a run diz que não existe, em
 * vez de afirmar zero.
 */
export function avisoDeContaPerdida(relogioMs: number): string {
  return `os tokens desta chamada não foram contabilizados: a requisição foi abortada aos ${seg(relogioMs)}s, antes da resposta`
}
