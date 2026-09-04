/**
 * Erro ESTRUTURADO das tools da ConvertIA — módulo PURO.
 *
 * Antes, qualquer exceção virava "Erro ao consultar: <mensagem>" e o
 * modelo lia isso como "a plataforma não faz isso" (o erro mais caro
 * que ela comete). Agora a tool devolve JSON com `code` estável e, no
 * 429, o `retry_after_s` — o system prompt ensina o que fazer com cada
 * código. A telemetria por tool grava o mesmo código.
 *
 * Os erros nomeados dos clientes da casa (Omnisend/Klaviyo) e o vocabulário
 * HTTP dos MCPs/Shopify são classificados por NOME e por status — sem
 * importar os módulos deles (este arquivo é client-safe e testável).
 */

export type ToolErrorCode =
  | "rate_limited"
  | "quota_exhausted"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "timeout"
  | "unavailable"
  | "needs_confirmation"
  | "cancelled"
  | "unknown"

export interface StructuredToolError {
  code: ToolErrorCode
  message: string
  /** Segundos até poder tentar de novo (só em rate_limited). */
  retry_after_s?: number
  http_status?: number
  hint?: string
}

const HINTS: Record<ToolErrorCode, string> = {
  rate_limited:
    "Limite de requisições da plataforma. Se retry_after_s for pequeno, espere e tente UMA vez; senão avise o usuário e siga com o que já tem.",
  quota_exhausted:
    "Cota diária da API esgotada — não repita a chamada hoje. Use dados já consultados e avise o usuário.",
  unauthorized:
    "Credencial inválida ou expirada — não é resolvível tentando de novo. Diga ao usuário qual conector precisa de chave nova.",
  forbidden:
    "A chave não tem permissão/escopo para esta operação. Diga qual escopo falta (quando a mensagem indicar) e não tente contornar.",
  not_found: "Recurso ou path inexistente — confira o id/path (use a tool de catálogo) antes de concluir qualquer coisa.",
  invalid_request:
    "Payload rejeitado pela plataforma — NÃO é ausência do recurso. Leia a mensagem, corrija o corpo e chame de novo.",
  conflict: "Conflito de estado do recurso (ex.: campanha não é rascunho). Leia o guia da operação antes de repetir.",
  timeout: "A plataforma demorou demais. Tente de novo uma vez; se persistir, avise o usuário.",
  unavailable: "Plataforma indisponível no momento. Tente de novo uma vez; se persistir, avise o usuário.",
  needs_confirmation:
    "A ação aguarda confirmação do usuário na interface. Explique o que será executado e encerre a resposta.",
  cancelled: "O usuário interrompeu o turno.",
  unknown: "Erro não classificado — relate a mensagem ao usuário sem concluir que a operação não existe.",
}

/** Serializa para o modelo (o content da tool). */
export function toolErrorContent(err: StructuredToolError): string {
  return JSON.stringify(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.retry_after_s != null ? { retry_after_s: err.retry_after_s } : {}),
        ...(err.http_status != null ? { http_status: err.http_status } : {}),
        hint: err.hint ?? HINTS[err.code],
      },
    },
    null,
    1,
  )
}

export function codeFromHttpStatus(status: number): ToolErrorCode {
  if (status === 429) return "rate_limited"
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 408 || status === 504) return "timeout"
  if (status === 409) return "conflict"
  if (status === 400 || status === 422) return "invalid_request"
  if (status >= 500) return "unavailable"
  return "unknown"
}

/** Segundos de um header Retry-After (delta ou data HTTP). */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null
  const n = Number(value)
  if (Number.isFinite(n)) return Math.max(0, Math.round(n))
  const t = Date.parse(value)
  if (Number.isFinite(t)) return Math.max(0, Math.round((t - now) / 1000))
  return null
}

/**
 * Classifica uma exceção lançada pela execução de uma tool. Reconhece
 * por `name` os erros dos clientes da casa (OmnisendRateLimitError,
 * KlaviyoRateLimitError, *InvalidKeyError, *PermissionError,
 * OmnisendApiError com `status`), por `status`/`http_status` genéricos e
 * por padrões de mensagem (HTTP 429 do MCP, AbortError).
 */
export function classifyToolError(err: unknown): StructuredToolError {
  const e = (err ?? {}) as {
    name?: string
    message?: string
    status?: number
    http_status?: number
    retryAfterMs?: number
    missingScopes?: string[]
    body?: string
  }
  const message = (typeof e.message === "string" ? e.message : String(err)).slice(0, 600)
  const name = e.name ?? ""

  if (/RateLimitError$/.test(name)) {
    const retry = typeof e.retryAfterMs === "number" ? Math.ceil(e.retryAfterMs / 1000) : undefined
    // Cota diária (Omnisend stats: 55/dia) chega como Retry-After de
    // horas — para o modelo é "não repita hoje", não "espere um pouco".
    if (retry != null && retry > 600) {
      return { code: "quota_exhausted", message, retry_after_s: retry, http_status: 429 }
    }
    return { code: "rate_limited", message, retry_after_s: retry, http_status: 429 }
  }
  if (/InvalidKeyError$/.test(name)) return { code: "unauthorized", message, http_status: 401 }
  if (/PermissionError$/.test(name)) {
    const scopes = Array.isArray(e.missingScopes) ? e.missingScopes.filter(Boolean) : []
    return {
      code: "forbidden",
      message: scopes.length > 0 ? `${message} (escopos: ${scopes.join(", ")})` : message,
      http_status: 403,
    }
  }
  if (name === "AbortError" || name === "TimeoutError" || /timeout|timed out|demorou/i.test(message)) {
    return { code: "timeout", message }
  }
  const status =
    typeof e.status === "number"
      ? e.status
      : typeof e.http_status === "number"
        ? e.http_status
        : parseHttpStatusFromMessage(message)
  if (status != null) {
    const code = codeFromHttpStatus(status)
    const retry = status === 429 ? parseRetryAfterFromMessage(message) : null
    return {
      code,
      message: typeof e.body === "string" && e.body ? `${message} — ${e.body.slice(0, 400)}` : message,
      http_status: status,
      ...(retry != null ? { retry_after_s: retry } : {}),
    }
  }
  if (/ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(message)) {
    return { code: "unavailable", message }
  }
  return { code: "unknown", message }
}

function parseHttpStatusFromMessage(message: string): number | null {
  const m = message.match(/\bHTTP\s+(\d{3})\b/i) ?? message.match(/\b(\d{3})\s+(?:em|in|on)\s/i)
  if (!m) return null
  const n = Number(m[1])
  return n >= 400 && n <= 599 ? n : null
}

function parseRetryAfterFromMessage(message: string): number | null {
  const m = message.match(/retry[-_ ]after[:\s]*(\d+)\s*(ms|s)?/i)
  if (!m) return null
  const n = Number(m[1])
  return m[2]?.toLowerCase() === "ms" ? Math.ceil(n / 1000) : n
}

/**
 * Espera de retry para um erro classificado — só os transitórios. Fica
 * dentro do orçamento (`maxWaitMs`) ou devolve null (não vale esperar).
 * Backoff: 1s, 2s, 4s; 429 usa retry_after quando presente.
 */
export function retryDelayMs(
  err: StructuredToolError,
  attempt: number,
  maxWaitMs: number,
): number | null {
  if (!["rate_limited", "timeout", "unavailable"].includes(err.code)) return null
  const base = err.code === "rate_limited" && err.retry_after_s != null
    ? err.retry_after_s * 1000
    : 1000 * 2 ** attempt
  const withJitter = base + Math.round(Math.random() * 250)
  return withJitter <= maxWaitMs ? withJitter : null
}
