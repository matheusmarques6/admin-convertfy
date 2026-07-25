/**
 * Cobre parse defensivo + retry do invocador OpenRouter (Opção A).
 *
 * Foco: garantir que o caso "Unexpected end of JSON input" que apareceu em
 * prod (mid-stream error → 200 OK com corpo vazio/SSE) não volte. Cada
 * cenário é uma classificação de body / status que o caller precisa lidar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

import {
  invokeOpenRouter,
  isOpenRouterModel,
  OpenRouterEmptyBodyError,
  OpenRouterHttpError,
  OpenRouterMidStreamError,
  parseOpenRouterBody,
  withOpenRouterRetry,
} from "./openrouter-invoke"

// ── parseOpenRouterBody (puro) ─────────────────────────────────────────

describe("parseOpenRouterBody", () => {
  const ctx = { status: 200, ms: 100 }

  it("JSON normal: extrai content + usage", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "hello" } }],
      usage: { prompt_tokens: 12, completion_tokens: 34 },
    })
    const out = parseOpenRouterBody(body, ctx)
    expect(out).toEqual({ text: "hello", tokensInput: 12, tokensOutput: 34, costUsd: 0 })
  })

  it("extrai o custo REAL (usage.cost) quando presente", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.0042 },
    })
    const out = parseOpenRouterBody(body, ctx)
    expect(out.costUsd).toBe(0.0042)
  })

  it("body vazio → OpenRouterEmptyBodyError(retryable)", () => {
    expect(() => parseOpenRouterBody("", ctx)).toThrow(OpenRouterEmptyBodyError)
    try {
      parseOpenRouterBody("   \n\t  ", ctx)
    } catch (e) {
      expect(e).toBeInstanceOf(OpenRouterEmptyBodyError)
      expect((e as OpenRouterEmptyBodyError).retryable).toBe(true)
      expect((e as Error).message).toMatch(/empty body/i)
    }
  })

  it("texto não-JSON → OpenRouterMidStreamError('non_json_body', retryable)", () => {
    try {
      parseOpenRouterBody("Internal Server Error", ctx)
    } catch (e) {
      expect(e).toBeInstanceOf(OpenRouterMidStreamError)
      expect((e as OpenRouterMidStreamError).errorType).toBe("non_json_body")
      expect((e as OpenRouterMidStreamError).retryable).toBe(true)
    }
  })

  it("SSE com '`: OPENROUTER PROCESSING`' + data:{content} → parseia o texto", () => {
    const body =
      ": OPENROUTER PROCESSING\n" +
      ": OPENROUTER PROCESSING\n" +
      `data: ${JSON.stringify({
        choices: [{ message: { content: "olá" } }],
        usage: { prompt_tokens: 5, completion_tokens: 7 },
      })}\n` +
      "data: [DONE]\n"
    const out = parseOpenRouterBody(body, ctx)
    expect(out.text).toBe("olá")
    expect(out.tokensInput).toBe(5)
    expect(out.tokensOutput).toBe(7)
  })

  it("SSE streaming (delta) → concatena content dos deltas", () => {
    const frames = [
      { choices: [{ delta: { content: "Hello" } }] },
      { choices: [{ delta: { content: " " } }] },
      { choices: [{ delta: { content: "world" } }] },
    ]
    const body = frames.map((f) => `data: ${JSON.stringify(f)}`).join("\n") + "\ndata: [DONE]\n"
    const out = parseOpenRouterBody(body, ctx)
    expect(out.text).toBe("Hello world")
  })

  it("SSE com finish_reason:'error' + error_type:'provider_timeout' → mid-stream(retryable)", () => {
    const body =
      ": OPENROUTER PROCESSING\n" +
      `data: ${JSON.stringify({
        error: {
          message: "Upstream timed out",
          metadata: { error_type: "provider_timeout" },
        },
      })}\n`
    try {
      parseOpenRouterBody(body, ctx)
      throw new Error("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(OpenRouterMidStreamError)
      expect((e as OpenRouterMidStreamError).errorType).toBe("provider_timeout")
      expect((e as OpenRouterMidStreamError).retryable).toBe(true)
    }
  })

  it("SSE com error_type:'moderation' → mid-stream NÃO-retryable", () => {
    const body = `data: ${JSON.stringify({
      error: { message: "blocked", metadata: { error_type: "moderation" } },
    })}\n`
    try {
      parseOpenRouterBody(body, ctx)
    } catch (e) {
      expect(e).toBeInstanceOf(OpenRouterMidStreamError)
      expect((e as OpenRouterMidStreamError).retryable).toBe(false)
    }
  })

  it("non-streaming JSON com finish_reason:'error' → mid-stream(retryable)", () => {
    const body = JSON.stringify({
      choices: [{ finish_reason: "error", message: { content: "" } }],
    })
    try {
      parseOpenRouterBody(body, ctx)
    } catch (e) {
      expect(e).toBeInstanceOf(OpenRouterMidStreamError)
      expect((e as OpenRouterMidStreamError).errorType).toBe("midstream_error")
      expect((e as OpenRouterMidStreamError).retryable).toBe(true)
    }
  })

  it("top-level { error } no JSON → mid-stream com error_type da metadata", () => {
    const body = JSON.stringify({
      error: {
        message: "provider crashed",
        metadata: { error_type: "provider_error" },
      },
    })
    try {
      parseOpenRouterBody(body, ctx)
    } catch (e) {
      expect((e as OpenRouterMidStreamError).errorType).toBe("provider_error")
      expect((e as OpenRouterMidStreamError).retryable).toBe(true)
    }
  })
})

// ── withOpenRouterRetry ────────────────────────────────────────────────

describe("withOpenRouterRetry", () => {
  it("retorna no 1º attempt em sucesso (sem retry)", async () => {
    const attempt = vi.fn().mockResolvedValue("ok")
    const out = await withOpenRouterRetry(attempt, { sleep: async () => {} })
    expect(out).toBe("ok")
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it("retenta em erro com retryable=true", async () => {
    const transient = Object.assign(new Error("boom"), { retryable: true })
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue("ok")
    const out = await withOpenRouterRetry(attempt, { sleep: async () => {} })
    expect(out).toBe("ok")
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it("NÃO retenta em erro com retryable=false", async () => {
    const permanent = Object.assign(new Error("no"), { retryable: false })
    const attempt = vi.fn().mockRejectedValue(permanent)
    await expect(
      withOpenRouterRetry(attempt, { sleep: async () => {} }),
    ).rejects.toBe(permanent)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it("NÃO retenta erro sem flag retryable (ex.: 'timeout')", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("timeout"))
    await expect(
      withOpenRouterRetry(attempt, { sleep: async () => {} }),
    ).rejects.toThrow(/timeout/)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it("lança o erro acumulado se todas as tentativas falharem", async () => {
    const transient = Object.assign(new Error("flap"), { retryable: true })
    const attempt = vi.fn().mockRejectedValue(transient)
    await expect(
      withOpenRouterRetry(attempt, { retries: 2, sleep: async () => {} }),
    ).rejects.toBe(transient)
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it("invoca onRetry para cada falha que vira retry", async () => {
    const transient = Object.assign(new Error("flap"), { retryable: true })
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue("ok")
    const onRetry = vi.fn()
    await withOpenRouterRetry(attempt, { sleep: async () => {}, onRetry })
    expect(onRetry).toHaveBeenCalledWith(transient, 0)
  })
})

// ── invokeOpenRouter (e2e com fetch mockado) ───────────────────────────

describe("invokeOpenRouter", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "sk-test"
    vi.unstubAllGlobals()
  })

  const baseInput = {
    model: "anthropic/claude-sonnet-4.6",
    systemPrompt: "sys",
    userMessage: "user",
    maxTokens: 100,
  }

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }

  function textResponse(status: number, body: string): Response {
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/plain" },
    })
  }

  it("happy path: retorna text + tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: "hi" } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const out = await invokeOpenRouter(baseInput)
    expect(out).toEqual({ text: "hi", tokensInput: 3, tokensOutput: 4, costUsd: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("body vazio na 1ª, sucesso na 2ª → 2 fetches, recupera", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(200, ""))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 2 },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const out = await invokeOpenRouter(baseInput)
    expect(out.text).toBe("ok")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("body vazio nas 2 tentativas → joga OpenRouterEmptyBodyError", async () => {
    // Response.text() só pode ser consumido uma vez por objeto — usar
    // mockImplementation pra criar um Response novo a cada attempt.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => textResponse(200, ""))
    vi.stubGlobal("fetch", fetchMock)
    await expect(invokeOpenRouter(baseInput)).rejects.toBeInstanceOf(
      OpenRouterEmptyBodyError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("mid-stream provider_timeout (SSE) → recupera no retry", async () => {
    const sseError =
      `data: ${JSON.stringify({
        error: { message: "upstream", metadata: { error_type: "provider_timeout" } },
      })}\n`
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(sseError, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [{ message: { content: "recovered" } }],
          usage: { prompt_tokens: 5, completion_tokens: 6 },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const out = await invokeOpenRouter(baseInput)
    expect(out.text).toBe("recovered")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("HTTP 402 (sem crédito) → OpenRouterHttpError sem retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(textResponse(402, "insufficient credits"))
    vi.stubGlobal("fetch", fetchMock)
    await expect(invokeOpenRouter(baseInput)).rejects.toBeInstanceOf(
      OpenRouterHttpError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("HTTP 503 → retryable, retenta uma vez", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(503, "upstream busy"))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const out = await invokeOpenRouter(baseInput)
    expect(out.text).toBe("ok")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("AbortError do fetch → 'timeout', NÃO retenta", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const err = new Error("aborted")
      err.name = "AbortError"
      throw err
    })
    vi.stubGlobal("fetch", fetchMock)
    await expect(invokeOpenRouter(baseInput)).rejects.toThrow(/timeout/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ── isOpenRouterModel ──────────────────────────────────────────────────

describe("isOpenRouterModel", () => {
  it("true para id 'vendor/model'", () => {
    expect(isOpenRouterModel("anthropic/claude-sonnet-4.6")).toBe(true)
    expect(isOpenRouterModel("openai/gpt-5.4")).toBe(true)
  })
  it("false para id sem barra (Anthropic SDK direto)", () => {
    expect(isOpenRouterModel("claude-sonnet-4-6")).toBe(false)
    expect(isOpenRouterModel("claude-opus-4-8")).toBe(false)
  })
})
