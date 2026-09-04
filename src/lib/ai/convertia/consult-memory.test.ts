import { describe, expect, it } from "vitest"
import { buildConsultedBlock, digestToolOutput } from "./consult-memory"

describe("digestToolOutput", () => {
  it("colapsa espaços, tira pontuação de JSON e corta em 300", () => {
    const json = JSON.stringify({ campanhas: [{ nome: "Black Friday", status: "sent" }] }, null, 2)
    const d = digestToolOutput(json)
    expect(d).toBe("campanhas: nome: Black Friday, status: sent")
    const long = "x".repeat(1000)
    expect(digestToolOutput(long)).toHaveLength(300)
    expect(digestToolOutput(long).endsWith("…")).toBe(true)
  })
})

describe("buildConsultedBlock", () => {
  it("vazio sem consultas", () => {
    expect(buildConsultedBlock([])).toBe("")
    expect(buildConsultedBlock([{ index: 1, sources: [{ tool: "t", label: "L" }] }])).toBe("")
  })

  it("lista em ordem cronológica, marca execução e erro", () => {
    const block = buildConsultedBlock([
      { index: 1, sources: [{ tool: "a", label: "Campanhas", args_summary: "status: sent", digest: "3 campanhas" }] },
      {
        index: 2,
        sources: [
          { tool: "b", label: "Criar popup", write: true, digest: "popup criado id 42" },
          { tool: "c", label: "Métricas", summary: "erro", error_code: "rate_limited" },
        ],
      },
    ])
    const lines = block.split("\n").filter((l) => l.startsWith("- "))
    expect(lines).toEqual([
      "- [turno 1] consultou Campanhas (status: sent) → 3 campanhas",
      "- [turno 2] executou Criar popup → popup criado id 42",
      "- [turno 2] consultou Métricas → falhou (rate_limited)",
    ])
  })

  it("respeita o teto priorizando o mais recente", () => {
    const turns = Array.from({ length: 50 }, (_, i) => ({
      index: i + 1,
      sources: [{ tool: "t", label: `Consulta ${i + 1}`, digest: "y".repeat(120) }],
    }))
    const block = buildConsultedBlock(turns, 800)
    expect(block.length).toBeLessThanOrEqual(1100) // cabeçalho + linhas
    expect(block).toContain("[turno 50]")
    expect(block).not.toContain("[turno 1]")
  })
})

import { TurnTelemetry } from "./telemetry"

describe("TurnTelemetry.summaryNew", () => {
  it("fatura só as rodadas depois do seed (continuação não cobra em dobro)", () => {
    const seed = { rounds: [{ n: 1, model: "m", role: "primary" as const, ms: 10, tokens_input: 100, tokens_output: 10, tokens_cached: 0, tokens_cache_write: 0, cost_usd: 0.2, tool_calls: 1, outcome: "tools" as const }], tools: [{ name: "a", connector: "c", ms: 5, ok: true }], startedAt: 0 }
    const t = new TurnTelemetry(() => 1000, seed)
    t.round({ model: "m", role: "primary", ms: 20, tokens_input: 50, tokens_output: 5, tokens_cached: 0, tokens_cache_write: 0, cost_usd: 0.05, tool_calls: 0, outcome: "final" })
    expect(t.summary().cost_usd).toBeCloseTo(0.25)
    expect(t.summary().rounds).toHaveLength(2)
    const fresh = t.summaryNew()
    expect(fresh.cost_usd).toBeCloseTo(0.05)
    expect(fresh.rounds).toHaveLength(1)
    expect(fresh.tools).toHaveLength(0)
  })
})
