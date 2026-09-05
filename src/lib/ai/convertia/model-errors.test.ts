import { describe, expect, it } from "vitest"
import { friendlyModelError, friendlyModelErrorText } from "./model-errors"

describe("friendlyModelError", () => {
  it("402 do OpenRouter (os dois motivos vistos em produção) = sem créditos, com o link", () => {
    const a = friendlyModelError(
      'OpenRouter HTTP 402: {"error":{"message":"This request\'s maximum cost exceeds your available credits. Add credits, or lower max_tokens or prompt size.","code":402,"metadata":{"reason":"weight_exceeds_budget","limit_source":"openrouter_credits"}}}',
    )
    expect(a.code).toBe("no_credits")
    expect(a.hint).toContain("openrouter.ai/settings/credits")
    const b = friendlyModelError(
      'OpenRouter HTTP 402: {"error":{"message":"This request would exceed your available credits given your current in-flight requests.","metadata":{"reason":"in_flight_budget_exhausted"}}}',
    )
    expect(b.code).toBe("no_credits")
    // "prompt size" aparece no texto do 402 — não pode virar prompt_too_long
    expect(a.code).not.toBe("prompt_too_long")
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
