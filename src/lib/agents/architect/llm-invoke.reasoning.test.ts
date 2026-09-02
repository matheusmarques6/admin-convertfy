/**
 * O esforço de raciocínio é decisão do AGENTE (`AgentInvokeConfig.reasoning`),
 * não do invocador. Run copy_fit 5d7396b5 (02/09): o encurtador em GPT-5.4
 * mini herdou o `medium` do Curador com max_tokens 1500 — gastou tudo
 * pensando e a resposta veio vazia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

import { invokeAgent, type AgentInvokeConfig } from "./llm-invoke"

const fetchMock = vi.fn()

function resposta(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }
}

function config(over: Partial<AgentInvokeConfig> = {}): AgentInvokeConfig {
  return {
    model: "openai/gpt-5.4-mini",
    temperature: 0.4,
    max_tokens: 6000,
    system_prompt: "sys",
    user_template: "user {{x}}",
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
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("invokeAgent — reasoning por agente (OpenRouter)", () => {
  it("GPT-5.x sem config.reasoning: medium (ajuste do Curador), sem temperature", async () => {
    fetchMock.mockResolvedValueOnce(
      resposta({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: {} }),
    )
    await invokeAgent(config(), { x: "1" })
    const body = bodyEnviado()
    expect(body.reasoning).toEqual({ effort: "medium" })
    expect("temperature" in body).toBe(false)
    expect(body.max_tokens).toBe(6000)
  })

  it("GPT-5.x com config.reasoning low: o body leva low", async () => {
    fetchMock.mockResolvedValueOnce(
      resposta({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: {} }),
    )
    await invokeAgent(config({ reasoning: { effort: "low" } }), { x: "1" })
    expect(bodyEnviado().reasoning).toEqual({ effort: "low" })
  })

  it("modelo que não é de raciocínio ignora config.reasoning e manda temperature", async () => {
    fetchMock.mockResolvedValueOnce(
      resposta({ choices: [{ message: { content: "ok" } }], usage: {} }),
    )
    await invokeAgent(
      config({ model: "anthropic/claude-haiku-4.5", reasoning: { effort: "low" } }),
      { x: "1" },
    )
    const body = bodyEnviado()
    expect("reasoning" in body).toBe(false)
    expect(body.temperature).toBe(0.4)
  })

  it("resposta vazia com finish_reason length chega ao chamador com os números", async () => {
    fetchMock.mockResolvedValueOnce(
      resposta({
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: {
          prompt_tokens: 3117,
          completion_tokens: 1500,
          completion_tokens_details: { reasoning_tokens: 1500 },
        },
      }),
    )
    const r = await invokeAgent(config({ max_tokens: 1500 }), { x: "1" })
    expect(r).toEqual({
      raw: "",
      tokensInput: 3117,
      tokensOutput: 1500,
      costUsd: 0,
      finishReason: "length",
      reasoningTokens: 1500,
    })
  })
})
