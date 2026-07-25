import { describe, it, expect } from "vitest"
import {
  normalizeModelKey,
  computeCostCents,
  resolveCostCents,
} from "./telemetry.callback"

describe("normalizeModelKey", () => {
  it("remove o prefixo de vendor", () => {
    expect(normalizeModelKey("anthropic/claude-opus-4.8")).toBe("claude-opus-4-8")
    expect(normalizeModelKey("openai/gpt-5.4-image-2")).toBe("gpt-5-4-image-2")
  })
  it("remove o sufixo de data -YYYYMMDD", () => {
    expect(normalizeModelKey("claude-sonnet-4-5-20250514")).toBe("claude-sonnet-4-5")
    expect(normalizeModelKey("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5")
  })
  it("troca ponto por hífen e é case-insensitive", () => {
    expect(normalizeModelKey("Claude-Sonnet-4.6")).toBe("claude-sonnet-4-6")
  })
  it("id já canônico passa intacto", () => {
    expect(normalizeModelKey("claude-opus-4-8")).toBe("claude-opus-4-8")
  })
})

describe("computeCostCents (preço por token, sub-centavo preservado)", () => {
  // 1M tokens de input isola o preço de input (output = 0).
  it("Opus cobra 15/Mtok (não vaza pro default de Sonnet)", () => {
    expect(computeCostCents("anthropic/claude-opus-4.8", 1_000_000, 0)).toBe(1500)
    expect(computeCostCents("claude-opus-4-8", 1_000_000, 0)).toBe(1500)
  })
  it("Sonnet em forma slash casa a mesma linha (sem drift)", () => {
    expect(computeCostCents("anthropic/claude-sonnet-4.6", 1_000_000, 0)).toBe(300)
    expect(computeCostCents("claude-sonnet-4-6", 1_000_000, 0)).toBe(300)
  })
  it("Haiku via OpenRouter cobra 1/Mtok, NÃO o preço de Sonnet", () => {
    // Antes: forma slash caía no default 3/15 → cobrava 300 (3× a mais).
    expect(computeCostCents("anthropic/claude-haiku-4-5", 1_000_000, 0)).toBe(100)
  })
  it("preserva sub-centavo (etapa barata não vira $0.000)", () => {
    // Sonnet, 1000 tokens input → $0.003 → 0,3 centavo (não zero).
    expect(computeCostCents("claude-sonnet-4-6", 1_000, 0)).toBe(0.3)
  })
  it("modelo desconhecido cai no default de Sonnet (3/15)", () => {
    expect(computeCostCents("modelo/inexistente-9", 1_000_000, 0)).toBe(300)
  })
})

describe("resolveCostCents (prefere o custo REAL do OpenRouter)", () => {
  it("usa costUsd quando presente, ignorando a estimativa por token", () => {
    const out = resolveCostCents({
      model: "anthropic/claude-opus-4.8",
      tokensInput: 1_000_000, // estimativa por token daria 1500
      tokensOutput: 0,
      costUsd: 0.0042, // custo real → 0,42 centavo
    })
    expect(out).toBe(0.42)
  })
  it("cai na estimativa por token quando costUsd é 0/ausente", () => {
    expect(
      resolveCostCents({
        model: "claude-sonnet-4-6",
        tokensInput: 1_000_000,
        tokensOutput: 0,
        costUsd: 0,
      }),
    ).toBe(300)
    expect(
      resolveCostCents({
        model: "claude-sonnet-4-6",
        tokensInput: 1_000_000,
        tokensOutput: 0,
      }),
    ).toBe(300)
  })
  it("costUsd negativo/inválido não é usado (fallback por token)", () => {
    expect(
      resolveCostCents({
        model: "claude-sonnet-4-6",
        tokensInput: 1_000_000,
        tokensOutput: 0,
        costUsd: -1,
      }),
    ).toBe(300)
  })
})
