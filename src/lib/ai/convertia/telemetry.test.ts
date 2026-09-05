import { describe, expect, it } from "vitest"
import { normalizeTurnUsage, TurnTelemetry } from "./telemetry"

describe("normalizeTurnUsage", () => {
  it("usage pré-v3 (sem rounds/tools) vira resumo completo com listas vazias — a UI não pode cair", () => {
    const u = normalizeTurnUsage({ cost_usd: 0.25278, tokens_input: 22943, tokens_output: 467 })
    expect(u).not.toBeNull()
    expect(u!.rounds).toEqual([])
    expect(u!.tools).toEqual([])
    expect(u!.tokens_input).toBe(22943)
    expect(u!.tokens_output).toBe(467)
    expect(u!.cost_usd).toBe(0.25278)
    expect(u!.duration_ms).toBe(0)
    expect(u!.cache_hit_ratio).toBe(0)
  })

  it("resumo v3 passa intacto (idempotente)", () => {
    const t = new TurnTelemetry(() => 1000)
    t.round({ model: "m", role: "primary", ms: 10, tokens_input: 100, tokens_output: 5, tokens_cached: 50, tokens_cache_write: 0, cost_usd: 0.01, tool_calls: 1, outcome: "tools" })
    t.tool({ name: "x", connector: "shopify", ms: 5, ok: true })
    const s = t.summary()
    expect(normalizeTurnUsage(s)).toEqual(s)
  })

  it("lixo vira null; rounds malformados são descartados; ratio recalculado quando falta", () => {
    expect(normalizeTurnUsage(null)).toBeNull()
    expect(normalizeTurnUsage("x")).toBeNull()
    expect(normalizeTurnUsage([1])).toBeNull()
    const u = normalizeTurnUsage({ tokens_input: 200, tokens_cached: 50, rounds: [null, {}, { n: 1, model: "m" }], tools: ["a"] })
    expect(u!.rounds).toHaveLength(1)
    expect(u!.tools).toEqual([])
    expect(u!.cache_hit_ratio).toBe(0.25)
  })
})
