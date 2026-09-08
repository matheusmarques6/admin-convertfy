import { describe, expect, it } from "vitest"
import {
  friendlyModelError,
  friendlyModelErrorText,
  isRetryableModelError,
  modelRetryDelayMs,
} from "./model-errors"

describe("friendlyModelError", () => {
  it("402 por custo máximo = sem créditos, com o link", () => {
    const a = friendlyModelError(
      'OpenRouter HTTP 402: {"error":{"message":"This request\'s maximum cost exceeds your available credits. Add credits, or lower max_tokens or prompt size.","code":402,"metadata":{"reason":"weight_exceeds_budget","limit_source":"openrouter_credits"}}}',
    )
    expect(a.code).toBe("no_credits")
    expect(a.hint).toContain("openrouter.ai/settings/credits")
    // "prompt size" aparece no texto do 402 — não pode virar prompt_too_long
    expect(a.code).not.toBe("prompt_too_long")
  })

  it("402 in-flight NÃO é falta de crédito — 4 dos 7 erros de produção, com saldo ok", () => {
    const b = friendlyModelError(
      'OpenRouter HTTP 402: {"error":{"message":"This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.","metadata":{"reason":"in_flight_budget_exhausted"}}}',
    )
    expect(b.code).toBe("credits_in_flight")
    // O erro de mandar recarregar quando o saldo está ok: a dica fala em esperar.
    expect(b.hint).toMatch(/alguns segundos/)
    expect(b.hint).not.toContain("openrouter.ai/settings/credits")
  })

  it("401/403 = chave; 429 = taxa; 5xx = instável; timeout; contexto", () => {
    expect(friendlyModelError("OpenRouter HTTP 401: No auth credentials found").code).toBe("unauthorized")
    expect(friendlyModelError("OpenRouter HTTP 429: rate limit").code).toBe("rate_limited")
    expect(friendlyModelError("OpenRouter HTTP 502: bad gateway").code).toBe("unavailable")
    expect(friendlyModelError(new Error("The operation was aborted")).code).toBe("timeout")
    expect(friendlyModelError("OpenRouter HTTP 400: This model's maximum context length is 200000 tokens").code).toBe(
      "prompt_too_long",
    )
  })

  it("desconhecido mantém a mensagem genérica antiga", () => {
    const f = friendlyModelError("algo estranho")
    expect(f.code).toBe("unknown")
    expect(friendlyModelErrorText("algo estranho")).toBe(
      "Não consegui completar a resposta agora. Tente de novo — se persistir, troque o modelo.",
    )
  })
})

describe("retry de erro do modelo", () => {
  const IN_FLIGHT =
    'OpenRouter HTTP 402: {"error":{"message":"This request would exceed your available credits given your current in-flight requests.","metadata":{"reason":"in_flight_budget_exhausted"}}}'

  it("transitório repete; definitivo não", () => {
    expect(isRetryableModelError(IN_FLIGHT)).toBe(true)
    expect(isRetryableModelError("OpenRouter HTTP 429: rate limit")).toBe(true)
    expect(isRetryableModelError("OpenRouter HTTP 503: overloaded")).toBe(true)
    expect(isRetryableModelError(new Error("This operation was aborted"))).toBe(true)

    // Repetir estes só queima o orçamento do turno para tomar a mesma recusa.
    expect(isRetryableModelError('OpenRouter HTTP 402: {"metadata":{"reason":"weight_exceeds_budget"}}')).toBe(false)
    expect(isRetryableModelError("OpenRouter HTTP 401: No auth credentials found")).toBe(false)
    expect(isRetryableModelError("algo estranho")).toBe(false)
  })

  it("o in-flight espera mais que os demais — 1s não faz a chamada anterior liquidar", () => {
    const inFlight = modelRetryDelayMs(IN_FLIGHT, 0, 60_000)
    const rate = modelRetryDelayMs("OpenRouter HTTP 429: rate limit", 0, 60_000)
    expect(inFlight).toBeGreaterThanOrEqual(3000)
    expect(rate).toBeLessThan(inFlight as number)
  })

  it("backoff cresce e a espera que não cabe no orçamento devolve null", () => {
    const a = modelRetryDelayMs(IN_FLIGHT, 0, 60_000) as number
    const b = modelRetryDelayMs(IN_FLIGHT, 1, 60_000) as number
    expect(b).toBeGreaterThan(a)
    expect(modelRetryDelayMs(IN_FLIGHT, 0, 500)).toBeNull()
    expect(modelRetryDelayMs("OpenRouter HTTP 401: bad key", 0, 60_000)).toBeNull()
  })
})
