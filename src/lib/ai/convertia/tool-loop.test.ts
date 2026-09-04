import { describe, expect, it, vi } from "vitest"
import type { ChatMessage, ChatStreamResult, StreamChatInput } from "@/lib/ai/openrouter-chat"
import type { ConnectorToolContext } from "@/lib/ai/connectors/types"
import { TurnTelemetry } from "./telemetry"
import { createTurnState, runToolLoop, type ToolEntry, type ToolLoopDeps } from "./tool-loop"
import type { TurnEvent } from "./types"

/** Resposta do modelo roteirizada: texto final ou tool calls. */
function final(text: string, extra: Partial<ChatStreamResult> = {}): ChatStreamResult {
  return {
    text,
    toolCalls: [],
    finishReason: "stop",
    tokensInput: 100,
    tokensOutput: 20,
    tokensCached: 0,
    tokensCacheWrite: 0,
    costUsd: 0.001,
    ms: 50,
    ...extra,
  }
}
function calls(
  names: Array<[string, Record<string, unknown>]>,
  text = "",
  extra: Partial<ChatStreamResult> = {},
): ChatStreamResult {
  return {
    text,
    toolCalls: names.map(([name, args], i) => ({
      id: `c${i}`,
      type: "function" as const,
      function: { name, arguments: JSON.stringify(args) },
    })),
    finishReason: "tool_calls",
    tokensInput: 100,
    tokensOutput: 10,
    tokensCached: 0,
    tokensCacheWrite: 0,
    costUsd: 0.001,
    ms: 40,
    ...extra,
  }
}

interface Harness {
  deps: ToolLoopDeps
  events: TurnEvent[]
  modelCalls: StreamChatInput[]
}

function harness(
  script: Array<ChatStreamResult | Error | ((input: StreamChatInput) => ChatStreamResult)>,
  opts: Partial<Omit<ToolLoopDeps, "tools">> & {
    tools?: Record<string, Partial<ToolEntry["tool"]> & { execute: ToolEntry["tool"]["execute"] }>
  } = {},
): Harness {
  const { tools: toolDefsInput, ...rest } = opts
  const events: TurnEvent[] = []
  const modelCalls: StreamChatInput[] = []
  let now = 1_000_000
  const clock = () => now
  const toolIndex = new Map<string, ToolEntry>()
  for (const [name, t] of Object.entries(toolDefsInput ?? {})) {
    toolIndex.set(name, {
      connectorKey: "metricas",
      connectorName: "Métricas",
      tool: {
        label: t.label ?? name,
        write: t.write,
        confirm: t.confirm,
        def: { type: "function", function: { name, description: name, parameters: {} } },
        execute: t.execute,
      },
    })
  }
  const messages: ChatMessage[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "pergunta" },
  ]
  const deps: ToolLoopDeps = {
    model: "anthropic/claude-opus-4.8",
    reasoningSupported: true,
    deep: false,
    messages,
    tools: [...toolIndex.values()].map((e) => e.tool.def),
    toolIndex,
    toolCtx: { admin: {} as ConnectorToolContext["admin"], orgId: "o", userId: "u", storeId: null, workspace: "operacional" },
    maxRounds: 5,
    budget: { startedAt: now, totalMs: 100_000, minRoundMs: 10_000 },
    guard: { wantsAnalysis: false, wantsAction: false },
    callModel: async (input) => {
      modelCalls.push({ ...input, messages: input.messages.map((m) => ({ ...m })) })
      const step = script.shift()
      if (!step) throw new Error("script esgotado")
      const r = step instanceof Error ? step : typeof step === "function" ? step(input) : step
      if (r instanceof Error) throw r
      now += r.ms
      if (r.text) input.onDelta?.(r.text)
      return r
    },
    emit: (e) => events.push(e),
    persistPartial: () => {},
    isCancelled: () => false,
    state: createTurnState(),
    telemetry: new TurnTelemetry(clock),
    clock,
    sleep: async (ms) => {
      now += ms
    },
    newId: () => "id-1",
    ...rest,
  }
  return { deps, events, modelCalls }
}

describe("runToolLoop", () => {
  it("resposta direta sem tools: texto final, 1 rodada, cache de prompt ligado", async () => {
    const h = harness([final("Olá!", { tokensCached: 80 })])
    const r = await runToolLoop(h.deps)
    expect(r.status).toBe("success")
    expect(r.fullText).toBe("Olá!")
    expect(h.modelCalls[0].promptCache).toBe(true)
    const s = h.deps.telemetry.summary()
    expect(s.rounds).toHaveLength(1)
    expect(s.rounds[0].outcome).toBe("final")
    expect(s.cache_hit_ratio).toBe(0.8)
    expect(h.events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text)).toEqual(["Olá!"])
  })

  it("rodada com tool: narração vira progress, tool executa com digest e telemetria, resposta final", async () => {
    const execute = vi.fn(async () => ({ content: '{"campanhas":[{"nome":"BF"}]}', summary: "1 campanha" }))
    const h = harness(
      [calls([["listar", { status: "sent" }]], "vou listar"), final("Achei 1 campanha.")],
      { tools: { listar: { label: "Campanhas", execute } } },
    )
    const r = await runToolLoop(h.deps)
    expect(r.fullText).toBe("Achei 1 campanha.")
    expect(h.deps.state.progress).toEqual(["vou listar"])
    expect(execute).toHaveBeenCalledWith({ status: "sent" }, expect.anything())
    const src = h.deps.state.sources[0]
    expect(src.summary).toBe("1 campanha")
    expect(src.digest).toBe("campanhas: nome: BF")
    expect(src.error_code).toBeNull()
    expect(typeof src.ms).toBe("number")
    // mensagens do 2º round trazem assistant(tool_calls) + tool
    const last = h.modelCalls[1].messages
    expect(last[last.length - 2].role).toBe("assistant")
    expect(last[last.length - 1]).toEqual({ role: "tool", content: '{"campanhas":[{"nome":"BF"}]}', tool_call_id: "c0" })
    const kinds = h.events.map((e) => e.type)
    expect(kinds).toEqual(["delta", "round_end", "tool", "tool", "delta"])
    expect(h.deps.telemetry.summary().tools[0]).toMatchObject({ name: "listar", ok: true })
  })

  it("erro transitório da tool: retry com backoff e depois erro estruturado", async () => {
    const rate = Object.assign(new Error("Klaviyo rate limited"), { name: "KlaviyoRateLimitError", retryAfterMs: 1000 })
    const execute = vi.fn().mockRejectedValueOnce(rate).mockResolvedValueOnce({ content: "ok" })
    const h = harness([calls([["perf", {}]]), final("fim")], { tools: { perf: { execute } } })
    await runToolLoop(h.deps)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(h.deps.state.sources[0].retries).toBe(1)
    expect(h.deps.state.sources[0].error_code).toBeNull()

    // esgota retries → JSON de erro pro modelo
    const always = vi.fn().mockRejectedValue(rate)
    const h2 = harness([calls([["perf", {}]]), final("fim")], { tools: { perf: { execute: always } } })
    await runToolLoop(h2.deps)
    expect(always).toHaveBeenCalledTimes(3)
    const toolMsg = h2.modelCalls[1].messages.find((m) => m.role === "tool") as { content: string }
    const parsed = JSON.parse(toolMsg.content) as { error: { code: string; retry_after_s: number } }
    expect(parsed.error.code).toBe("rate_limited")
    expect(parsed.error.retry_after_s).toBe(1)
    expect(h2.deps.state.sources[0].error_code).toBe("rate_limited")
    expect(h2.deps.state.sources[0].summary).toBe("HTTP 429")
  })

  it("erro não transitório (400) não repete", async () => {
    const bad = Object.assign(new Error("Omnisend 400 em /api/forms"), { name: "OmnisendApiError", status: 400, body: "name required" })
    const execute = vi.fn().mockRejectedValue(bad)
    const h = harness([calls([["criar", {}]]), final("fim")], { tools: { criar: { execute } } })
    await runToolLoop(h.deps)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(h.deps.state.sources[0].error_code).toBe("invalid_request")
  })

  it("guard: análise sem tool é descartada, nudge entra e o 2º passe vale", async () => {
    const execute = vi.fn(async () => ({ content: "dados" }))
    const h = harness(
      [final("De memória: foi bem."), calls([["m", {}]]), final("Com dados: 42.")],
      { tools: { m: { execute } }, guard: { wantsAnalysis: true, wantsAction: false } },
    )
    const r = await runToolLoop(h.deps)
    expect(r.fullText).toBe("Com dados: 42.")
    // o texto de memória nunca chegou ao cliente
    expect(h.events.some((e) => e.type === "delta" && (e as { text: string }).text.includes("memória"))).toBe(false)
    const nudge = h.modelCalls[1].messages.at(-1) as { content: string }
    expect(nudge.content).toContain("[verificação automática]")
    const outcomes = h.deps.telemetry.summary().rounds.map((r) => r.outcome)
    expect(outcomes).toEqual(["nudged", "tools", "final"])
  })

  it("cancelamento entre rodadas: status cancelled, tools restantes não executam", async () => {
    let cancelled = false
    const execute = vi.fn(async () => {
      cancelled = true
      return { content: "x" }
    })
    const h = harness([calls([["a", {}], ["b", {}]]), final("nunca")], {
      tools: { a: { execute }, b: { execute } },
      isCancelled: () => cancelled,
    })
    const r = await runToolLoop(h.deps)
    expect(r.status).toBe("cancelled")
    expect(execute).toHaveBeenCalledTimes(1)
    expect(h.modelCalls).toHaveLength(1)
    const toolMsgs = h.deps.messages.filter((m) => m.role === "tool") as Array<{ content: string }>
    expect(toolMsgs).toHaveLength(2)
    expect(JSON.parse(toolMsgs[1].content).error.code).toBe("cancelled")
  })

  it("orçamento esgotado depois de executar tools: resumable=true (continuação em job)", async () => {
    const h = harness([calls([["a", {}]], "vou"), final("nunca")], {
      tools: { a: { execute: async () => ({ content: "x" }) } },
    })
    // a tool consome quase todo o orçamento
    h.deps.toolIndex.get("a")!.tool.execute = async () => {
      await h.deps.sleep!(95_000)
      return { content: "x" }
    }
    const r = await runToolLoop(h.deps)
    expect(r.status).toBe("budget")
    expect(r.resumable).toBe(true)
    expect(r.nextRound).toBe(1)
    expect(h.deps.messages.at(-1)?.role).toBe("tool")
    // narração NÃO vira resposta quando vai continuar em job
    expect(r.fullText).toBe("")
    expect(h.deps.state.progress).toEqual(["vou"])
  })

  it("gate de confirmação: ação destrutiva não executa, evento confirm e erro needs_confirmation", async () => {
    const execute = vi.fn(async () => ({ content: "enviado" }))
    const h = harness([calls([["enviar", { id: "c1" }]]), final("Aguardo confirmação.")], {
      tools: { enviar: { write: true, confirm: (a) => `Enviar campanha ${a.id}`, execute } },
    })
    const r = await runToolLoop(h.deps)
    expect(execute).not.toHaveBeenCalled()
    expect(h.deps.state.pendingConfirmation).toMatchObject({ id: "id-1", tool: "enviar", summary: "Enviar campanha c1", args: { id: "c1" } })
    const confirmEv = h.events.find((e) => e.type === "confirm")
    expect(confirmEv).toBeTruthy()
    expect(h.deps.state.sources[0].confirmation_id).toBe("id-1")
    expect(h.deps.state.sources[0].error_code).toBe("needs_confirmation")
    expect(r.fullText).toBe("Aguardo confirmação.")
  })

  it("chamada pré-aprovada executa antes da 1ª rodada e o modelo relata", async () => {
    const execute = vi.fn(async () => ({ content: "enviado!", summary: "enviada" }))
    const h = harness([final("Campanha enviada.")], {
      tools: { enviar: { write: true, confirm: () => "x", execute } },
      preApproved: [{ name: "enviar", args: { id: "c1" } }],
    })
    const r = await runToolLoop(h.deps)
    expect(execute).toHaveBeenCalledWith({ id: "c1" }, expect.anything())
    expect(h.deps.state.pendingConfirmation).toBeNull()
    expect(r.fullText).toBe("Campanha enviada.")
    const msgs = h.modelCalls[0].messages
    expect(msgs.at(-2)?.role).toBe("assistant")
    expect(msgs.at(-1)).toMatchObject({ role: "tool", content: "enviado!" })
  })

  it("roteamento: rodada barata consulta; final e escrita são refeitos no forte", async () => {
    const execute = vi.fn(async () => ({ content: "dados" }))
    const h = harness(
      [
        // round 0 (cheap) consulta → aceito
        calls([["ler", {}]], "lendo"),
        // round 1 (cheap) tenta escrever → refeito no forte
        calls([["gravar", {}]]),
        // round 1 (primary) escreve
        calls([["gravar", { ok: true }]]),
        // round 2 (cheap) responde final → refeito no forte
        final("barato"),
        final("forte final"),
      ],
      { tools: { ler: { execute }, gravar: { write: true, execute } }, cheapModel: "moonshotai/kimi-k3" },
    )
    const r = await runToolLoop(h.deps)
    expect(r.fullText).toBe("forte final")
    expect(h.modelCalls.map((c) => c.model)).toEqual([
      "moonshotai/kimi-k3",
      "moonshotai/kimi-k3",
      "anthropic/claude-opus-4.8",
      "moonshotai/kimi-k3",
      "anthropic/claude-opus-4.8",
    ])
    const rounds = h.deps.telemetry.summary().rounds
    expect(rounds.map((x) => `${x.role}:${x.outcome}`)).toEqual([
      "cheap:tools",
      "cheap:rerouted",
      "primary:tools",
      "cheap:rerouted",
      "primary:final",
    ])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenLastCalledWith({ ok: true }, expect.anything())
  })

  it("fallback de modelo desconhecido na 1ª rodada", async () => {
    const boom = new Error("model not found")
    const h = harness([boom, final("ok pelo padrão")], {
      model: "anthropic/claude-fable-5.1",
      resolveUnknownModel: () => ({ model: "anthropic/claude-opus-4.8", notice: "_(fallback)_\n\n" }),
    })
    const r = await runToolLoop(h.deps)
    expect(r.model).toBe("anthropic/claude-opus-4.8")
    expect(r.modelFallback).toEqual({ requested: "anthropic/claude-fable-5.1", used: "anthropic/claude-opus-4.8" })
    expect(r.fullText).toBe("_(fallback)_\n\nok pelo padrão")
  })

  it("erro do modelo vira status error preservando o que já saiu", async () => {
    const h = harness([calls([["a", {}]], "começando"), new Error("boom")], {
      tools: { a: { execute: async () => ({ content: "x" }) } },
    })
    const r = await runToolLoop(h.deps)
    expect(r.status).toBe("error")
    expect(r.errorMessage).toBe("boom")
    expect(r.fullText).toBe("começando")
  })

  it("limite de rodadas", async () => {
    const script = Array.from({ length: 7 }, () => calls([["a", {}]]))
    const h = harness(script, { tools: { a: { execute: async () => ({ content: "x" }) } }, maxRounds: 2 })
    const r = await runToolLoop(h.deps)
    expect(r.fullText).toContain("limite de consultas atingido")
    expect(h.modelCalls).toHaveLength(3)
  })
})
