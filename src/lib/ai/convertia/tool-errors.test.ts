import { describe, expect, it } from "vitest"
import {
  classifyToolError,
  codeFromHttpStatus,
  parseRetryAfter,
  retryDelayMs,
  toolErrorContent,
} from "./tool-errors"

class OmnisendRateLimitError extends Error {
  retryAfterMs: number
  constructor(ms: number) {
    super(`Omnisend rate limited (Retry-After: ${ms}ms)`)
    this.name = "OmnisendRateLimitError"
    this.retryAfterMs = ms
  }
}
class KlaviyoPermissionError extends Error {
  missingScopes = ["campaigns:read"]
  constructor() {
    super("missing scopes")
    this.name = "KlaviyoPermissionError"
  }
}
class OmnisendApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Omnisend ${status} em /api/forms`)
    this.name = "OmnisendApiError"
  }
}

describe("classifyToolError", () => {
  it("rate limit dos clientes da casa vira rate_limited com retry_after_s", () => {
    const e = classifyToolError(new OmnisendRateLimitError(2500))
    expect(e.code).toBe("rate_limited")
    expect(e.retry_after_s).toBe(3)
    expect(e.http_status).toBe(429)
  })

  it("Retry-After de horas (cota diária) vira quota_exhausted", () => {
    const e = classifyToolError(new OmnisendRateLimitError(5 * 3_600_000))
    expect(e.code).toBe("quota_exhausted")
  })

  it("permissão com escopos", () => {
    const e = classifyToolError(new KlaviyoPermissionError())
    expect(e.code).toBe("forbidden")
    expect(e.message).toContain("campaigns:read")
  })

  it("erro de API com status e corpo", () => {
    const e = classifyToolError(new OmnisendApiError(422, '{"fields":["name"]}'))
    expect(e.code).toBe("invalid_request")
    expect(e.http_status).toBe(422)
    expect(e.message).toContain("fields")
  })

  it("mensagem 'HTTP 429' do cliente MCP", () => {
    const e = classifyToolError(new Error("MCP Omnisend: HTTP 429 — retry-after: 7"))
    expect(e.code).toBe("rate_limited")
    expect(e.retry_after_s).toBe(7)
  })

  it("timeout e rede", () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    expect(classifyToolError(abort).code).toBe("timeout")
    expect(classifyToolError(new TypeError("fetch failed")).code).toBe("unavailable")
    expect(classifyToolError("qualquer coisa").code).toBe("unknown")
  })
})

describe("codeFromHttpStatus / parseRetryAfter", () => {
  it("mapeia status", () => {
    expect(codeFromHttpStatus(429)).toBe("rate_limited")
    expect(codeFromHttpStatus(401)).toBe("unauthorized")
    expect(codeFromHttpStatus(400)).toBe("invalid_request")
    expect(codeFromHttpStatus(503)).toBe("unavailable")
    expect(codeFromHttpStatus(418)).toBe("unknown")
  })
  it("Retry-After em segundos ou data", () => {
    expect(parseRetryAfter("12")).toBe(12)
    const now = Date.UTC(2026, 8, 4, 12, 0, 0)
    expect(parseRetryAfter(new Date(now + 30_000).toUTCString(), now)).toBe(30)
    expect(parseRetryAfter("lixo")).toBeNull()
    expect(parseRetryAfter(null)).toBeNull()
  })
})

describe("retryDelayMs", () => {
  it("só transitórios, dentro do orçamento", () => {
    expect(retryDelayMs({ code: "invalid_request", message: "" }, 0, 10_000)).toBeNull()
    const d = retryDelayMs({ code: "unavailable", message: "" }, 1, 10_000)
    expect(d).not.toBeNull()
    expect(d!).toBeGreaterThanOrEqual(2000)
    expect(d!).toBeLessThan(2300)
    expect(retryDelayMs({ code: "rate_limited", message: "", retry_after_s: 60 }, 0, 10_000)).toBeNull()
    expect(retryDelayMs({ code: "rate_limited", message: "", retry_after_s: 3 }, 0, 10_000)).toBeGreaterThanOrEqual(3000)
  })
})

describe("toolErrorContent", () => {
  it("JSON com code, retry_after e hint", () => {
    const s = toolErrorContent({ code: "rate_limited", message: "429", retry_after_s: 5 })
    const j = JSON.parse(s) as { error: Record<string, unknown> }
    expect(j.error.code).toBe("rate_limited")
    expect(j.error.retry_after_s).toBe(5)
    expect(typeof j.error.hint).toBe("string")
  })
})
