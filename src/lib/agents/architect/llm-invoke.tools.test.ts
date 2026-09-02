/**
 * Loop de ferramentas do Curador (consulta ao Obsidian sob demanda, 02/09):
 * executa a tool_call por código, reenvia o histórico, respeita o teto e
 * fecha com tool_choice "none"; tokens somam todas as voltas; erro no loop
 * cai numa chamada sem ferramentas (fail-open).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

import { invokeAgentWithTools, type AgentInvokeConfig, type ToolSpec } from "./llm-invoke"

const fetchMock = vi.fn()

const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: { name: "ler_nota", description: "lê", parameters: { type: "object", properties: { caminho: { type: "string" } } } },
  },
]

function resposta(message: Record<string, unknown>, finish = "stop", usage = { prompt_tokens: 100, completion_tokens: 10, cost: 0.001 }) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message, finish_reason: finish }], usage }) }
}
const toolCall = (id: string, caminho: string) => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name: "ler_nota", arguments: JSON.stringify({ caminho }) } }],
})

function config(): AgentInvokeConfig {
  return { model: "anthropic/claude-sonnet-4.6", temperature: 0.2, max_tokens: 800, system_prompt: "sys", user_template: "user {{x}}" }
}
function bodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string))
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("OPENROUTER_API_KEY", "k")
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("invokeAgentWithTools", () => {
  it("executa a consulta por código, reenvia o histórico com a resposta da ferramenta e soma os tokens", async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(toolCall("c1", "componentes/lacunas/offer.md")))
      .mockResolvedValueOnce(resposta({ role: "assistant", content: '{"papeis":[]}' }))
    const executar = vi.fn(async (nome: string, args: Record<string, unknown>) => `corpo de ${args.caminho} via ${nome}`)
    const r = await invokeAgentWithTools(config(), { x: "1" }, undefined, { tools: TOOLS, executar, maxCalls: 4 })
    expect(r.raw).toBe('{"papeis":[]}')
    expect(r.voltas).toBe(2)
    expect(r.tokensInput).toBe(200)
    expect(r.tokensOutput).toBe(20)
    expect(r.fallback_sem_ferramentas).toBe(false)
    expect(r.consultas).toEqual([
      expect.objectContaining({ ferramenta: "ler_nota", argumento: "componentes/lacunas/offer.md", chars: "corpo de componentes/lacunas/offer.md via ler_nota".length }),
    ])
    const [b1, b2] = bodies()
    expect(b1.tools).toHaveLength(1)
    expect(b1.tool_choice).toBe("auto")
    const msgs = b2.messages as Array<Record<string, unknown>>
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"])
    expect(msgs[3]).toMatchObject({ tool_call_id: "c1", content: "corpo de componentes/lacunas/offer.md via ler_nota" })
  })

  it("respeita o teto: chamada além do limite não roda, e a volta seguinte vai com tool_choice none", async () => {
    // Duas tool_calls na MESMA volta com teto 1: a 2ª não executa (marcada
    // "limite"); a volta seguinte já sai com tool_choice none.
    fetchMock
      .mockResolvedValueOnce(
        resposta({
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "c1", type: "function", function: { name: "ler_nota", arguments: JSON.stringify({ caminho: "a.md" }) } },
            { id: "c2", type: "function", function: { name: "ler_nota", arguments: JSON.stringify({ caminho: "b.md" }) } },
          ],
        }),
      )
      .mockResolvedValueOnce(resposta({ role: "assistant", content: "fim" }))
    const executar = vi.fn(async () => "ok")
    const r = await invokeAgentWithTools(config(), { x: "1" }, undefined, { tools: TOOLS, executar, maxCalls: 1 })
    expect(executar).toHaveBeenCalledTimes(1)
    expect(r.consultas).toHaveLength(2)
    expect(r.consultas[0].erro).toBeUndefined()
    expect(r.consultas[1].erro).toBe("limite")
    expect(bodies()[1].tool_choice).toBe("none")
    expect(r.raw).toBe("fim")
    expect(r.voltas).toBe(2)
  })

  it("erro na ferramenta vira texto para o modelo (não derruba o loop)", async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(toolCall("c1", "x.md")))
      .mockResolvedValueOnce(resposta({ role: "assistant", content: "seguiu" }))
    const r = await invokeAgentWithTools(config(), { x: "1" }, undefined, {
      tools: TOOLS,
      executar: async () => { throw new Error("db down") },
    })
    expect(r.raw).toBe("seguiu")
    expect(r.consultas[0].erro).toBe("db down")
    const msgs = bodies()[1].messages as Array<Record<string, unknown>>
    expect(msgs[3].content).toContain("erro ao consultar: db down")
  })

  it("falha do loop cai numa chamada sem ferramentas (fail-open) e marca o fallback", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" })
      .mockResolvedValueOnce(resposta({ role: "assistant", content: "sem tools" }))
    const r = await invokeAgentWithTools(config(), { x: "1" }, undefined, { tools: TOOLS, executar: async () => "ok" })
    expect(r.raw).toBe("sem tools")
    expect(r.fallback_sem_ferramentas).toBe(true)
    expect("tools" in bodies()[1]).toBe(false)
  })

  it("modelo fora do OpenRouter ou sem ferramentas → chamada comum, sem loop", async () => {
    fetchMock.mockResolvedValueOnce(resposta({ role: "assistant", content: "direto" }))
    const r = await invokeAgentWithTools(config(), { x: "1" }, undefined, { tools: [], executar: async () => "ok" })
    expect(r.raw).toBe("direto")
    expect(r.voltas).toBe(1)
    expect(r.consultas).toEqual([])
  })
})
