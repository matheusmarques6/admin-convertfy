/**
 * Cache de prompt no OpenRouter (14/09).
 *
 * Auditoria do batch 879fe6e4: o Curador em `~anthropic/claude-fable-latest`
 * pagou 153k tokens de entrada em duas chamadas com o MESMO prefixo de 58k —
 * a régua `^anthropic/` não casava o til e nenhum `cache_control` saía. E
 * mesmo casando, só o system era marcado: o user do Curador tem ~100k chars.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

import {
  CACHE_PREFIX_MARKER,
  invokeAgent,
  modeloComCacheDePrompt,
  userContent,
  type AgentInvokeConfig,
} from "./llm-invoke"

const fetchMock = vi.fn()

function resposta(body: Record<string, unknown>) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) }
}

function config(over: Partial<AgentInvokeConfig> = {}): AgentInvokeConfig {
  return {
    model: "~anthropic/claude-fable-latest",
    temperature: 0.2,
    max_tokens: 4000,
    system_prompt: "sys",
    user_template: "base {{x}}",
    ...over,
  }
}

function bodyEnviado(): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string)
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("OPENROUTER_API_KEY", "test-key")
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(
    resposta({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 80 } },
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("modeloComCacheDePrompt", () => {
  it("aceita o slug com til do OpenRouter — era o furo do Curador", () => {
    expect(modeloComCacheDePrompt("~anthropic/claude-fable-latest")).toBe(true)
    expect(modeloComCacheDePrompt("anthropic/claude-sonnet-4.6")).toBe(true)
    expect(modeloComCacheDePrompt("moonshotai/kimi-k3")).toBe(false)
    expect(modeloComCacheDePrompt("claude-sonnet-4-6")).toBe(false)
  })
})

describe("userContent", () => {
  it("sem cache_user_prefix o user vai como string, e o marcador nunca chega ao modelo", () => {
    expect(userContent(config(), `a${CACHE_PREFIX_MARKER}b`)).toBe("ab")
  })

  it("com cache_user_prefix e sem marcador, o user inteiro é o prefixo cacheável", () => {
    expect(userContent(config({ cache_user_prefix: true }), "base")).toEqual([
      { type: "text", text: "base", cache_control: { type: "ephemeral" } },
    ])
  })

  it("com marcador, o que vem antes é cacheado e as notas vão soltas — o caso das duas chamadas do Curador", () => {
    const c = config({ cache_user_prefix: true })
    expect(userContent(c, `base${CACHE_PREFIX_MARKER}\n<notas>…</notas>`)).toEqual([
      { type: "text", text: "base", cache_control: { type: "ephemeral" } },
      { type: "text", text: "\n<notas>…</notas>" },
    ])
    // A shortlist (sem notas) e a escolha (com notas) compartilham o bloco
    // "base" byte a byte — é isso que faz a segunda ler do cache.
    const shortlist = userContent(c, "base") as Array<{ text: string }>
    const escolha = userContent(c, `base${CACHE_PREFIX_MARKER}notas`) as Array<{ text: string }>
    expect(escolha[0]).toEqual(shortlist[0])
  })

  it("modelo que não cacheia ignora o pedido e recebe string", () => {
    expect(userContent(config({ model: "moonshotai/kimi-k3", cache_user_prefix: true }), `a${CACHE_PREFIX_MARKER}b`)).toBe("ab")
  })
})

describe("invokeAgent — cache no body e no resultado", () => {
  it("modelo com til: system em array com cache_control; user cacheável quando pedido", async () => {
    await invokeAgent(config({ cache_user_prefix: true }), { x: "1" })
    const body = bodyEnviado()
    const msgs = body.messages as Array<{ role: string; content: unknown }>
    expect(msgs[0].content).toEqual([{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }])
    expect(msgs[1].content).toEqual([{ type: "text", text: "base 1", cache_control: { type: "ephemeral" } }])
  })

  it("os tokens lidos do cache voltam no resultado — é o único jeito de saber que pegou", async () => {
    const r = await invokeAgent(config(), { x: "1" })
    expect(r.cachedTokens).toBe(80)
    expect(r.tokensInput).toBe(100)
  })

  it("sem cache_user_prefix o user segue como string (agente de uma chamada não paga a escrita do cache)", async () => {
    await invokeAgent(config(), { x: "1" })
    const msgs = bodyEnviado().messages as Array<{ role: string; content: unknown }>
    expect(msgs[1].content).toBe("base 1")
  })
})
