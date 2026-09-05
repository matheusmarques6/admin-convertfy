/**
 * Erro do PROVEDOR de modelo (OpenRouter) traduzido para quem está no
 * chat — módulo puro, client-safe.
 *
 * Incidente 05/09: a conta do OpenRouter ficou sem créditos e o chat
 * respondia "Não consegui completar a resposta agora. Tente de novo — se
 * persistir, troque o modelo." O usuário trocou de modelo várias vezes
 * (Fable, Kimi…) achando que era o modelo, quando o 402 já dizia
 * exatamente o que fazer: colocar crédito. O erro real estava gravado em
 * `meta.error` e em lugar nenhum da tela.
 */

export type ModelErrorCode =
  | "no_credits"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "prompt_too_long"
  | "unknown"

export interface FriendlyModelError {
  code: ModelErrorCode
  /** Uma frase, para a bolha do chat. */
  message: string
  /** O que a pessoa faz agora (link/ação), quando existe. */
  hint: string | null
}

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/settings/credits"

function httpStatus(raw: string): number | null {
  const m = /HTTP (\d{3})/.exec(raw)
  return m ? Number(m[1]) : null
}

export function friendlyModelError(raw: unknown): FriendlyModelError {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : String(raw ?? "")
  const lower = text.toLowerCase()
  const status = httpStatus(text)

  if (
    status === 402 ||
    /available credits|insufficient credits|openrouter_credits|in_flight_budget|weight_exceeds_budget/.test(lower)
  ) {
    return {
      code: "no_credits",
      message: "Os créditos do OpenRouter acabaram — não é o modelo. Nenhum modelo vai responder até a conta ser recarregada.",
      hint: `Adicionar créditos em ${OPENROUTER_CREDITS_URL}`,
    }
  }
  if (status === 401 || status === 403 || /invalid api key|unauthorized|no auth credentials/.test(lower)) {
    return {
      code: "unauthorized",
      message: "A chave do OpenRouter foi recusada (OPENROUTER_API_KEY inválida ou revogada).",
      hint: "Gerar uma chave nova em openrouter.ai/settings/keys e atualizar a variável no ambiente.",
    }
  }
  if (status === 429 || /rate limit|too many requests/.test(lower)) {
    return {
      code: "rate_limited",
      message: "O provedor limitou a taxa de requisições por alguns instantes.",
      hint: "Tente de novo em alguns segundos.",
    }
  }
  if (/context length|prompt is too long|maximum context|too many tokens|prompt size/.test(lower) && status !== 402) {
    return {
      code: "prompt_too_long",
      message: "A conversa ficou grande demais para o modelo.",
      hint: "Comece uma conversa nova ou remova anexos grandes.",
    }
  }
  if (status === 408 || /timeout|timed out|aborted/.test(lower)) {
    return {
      code: "timeout",
      message: "O modelo demorou demais e a chamada expirou.",
      hint: "Tente de novo; se persistir, use um modelo mais rápido.",
    }
  }
  if ((status != null && status >= 500) || /overloaded|unavailable|no endpoints|midstream/.test(lower)) {
    return {
      code: "unavailable",
      message: "O provedor do modelo está instável agora.",
      hint: "Tente de novo em um minuto ou troque o modelo.",
    }
  }
  return {
    code: "unknown",
    message: "Não consegui completar a resposta agora.",
    hint: "Tente de novo — se persistir, troque o modelo.",
  }
}

/** Texto único para a bolha: mensagem + dica, sem a resposta crua do provedor. */
export function friendlyModelErrorText(raw: unknown): string {
  const f = friendlyModelError(raw)
  return f.hint ? `${f.message} ${f.hint}` : f.message
}
