/**
 * O que o Catalogador diz quando falha.
 *
 * A rota devolve `erros` cru na mensagem de 502, e o cru deste caminho é
 * "timeout" — a palavra que o `callOnceArchitect` escreve quando o
 * `AbortController` corta. Na tela isso virava "O Catalogador não devolveu
 * um catálogo válido: timeout", que não diz o que fazer nem por que
 * demorou, e o operador clica de novo (três vezes em cinco minutos, na
 * Innova Bay de 11/09) gastando o mesmo minuto e meio a cada vez.
 *
 * Puro de propósito: é a régua de tradução, não o envio.
 */

/** Quanto tempo, em segundos, o teto de tokens pede para ser escrito. */
function segundos(ms: number): number {
  return Math.max(1, Math.round(ms / 1000))
}

export interface MotivoDaFalha {
  /** Texto para o operador — diz o que houve e o que fazer. */
  mensagem: string
  /** Curto, para log e telemetria. */
  codigo: "tempo_esgotado" | "sem_orcamento" | "resposta_invalida" | "reprovado_pelo_validador" | "erro_do_provedor"
}

/**
 * Traduz os erros das tentativas na causa que o operador precisa ler.
 *
 * Quando há mais de um, vence o que EXPLICA o desfecho: um timeout na
 * segunda tentativa é a razão de não haver catálogo, mesmo que a primeira
 * tenha sido reprovada pelo validador por outro motivo. Ordenar pela
 * ordem de chegada esconderia a causa real atrás de um detalhe.
 */
export function motivoDaFalha(erros: string[], opts: { relogioMs: number; maxTokens: number }): MotivoDaFalha {
  const texto = erros.join(" · ").toLowerCase()
  const seg = segundos(opts.relogioMs)

  if (/sem orçamento|sem orcamento/.test(texto)) {
    return {
      codigo: "sem_orcamento",
      mensagem:
        "O tempo da requisição acabou antes de sobrar janela para uma nova tentativa. " +
        "A primeira resposta foi reprovada e não havia mais orçamento para pedir a correção — tente de novo.",
    }
  }
  if (/timeout/.test(texto)) {
    return {
      codigo: "tempo_esgotado",
      mensagem:
        `O modelo passou de ${seg}s escrevendo e a chamada foi cortada. ` +
        `Esse é o tempo que o teto de ${opts.maxTokens.toLocaleString("pt-BR")} tokens de saída pede — ` +
        "baixe o teto em Configurações → Agentes (o catálogo não precisa dele inteiro) ou tente de novo.",
    }
  }
  if (/truncada|não é json|nao e json|json inválido|json invalido/.test(texto)) {
    return {
      codigo: "resposta_invalida",
      mensagem:
        "O modelo devolveu um JSON incompleto — a resposta bateu no teto de tokens antes de fechar o catálogo. " +
        "Tente de novo; persistindo, suba o teto de saída do agente.",
    }
  }
  if (/\b(4\d\d|5\d\d)\b|openrouter|crédito|credito|rate limit|in-flight/.test(texto)) {
    return {
      codigo: "erro_do_provedor",
      mensagem: `O provedor do modelo recusou a chamada: ${erros[0] ?? "sem detalhe"}.`,
    }
  }
  return {
    codigo: "reprovado_pelo_validador",
    mensagem:
      "As duas tentativas foram reprovadas pelo validador do catálogo: " +
      (erros.slice(0, 3).join("; ") || "sem detalhe"),
  }
}
