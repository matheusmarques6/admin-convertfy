import { describe, it, expect } from "vitest"
import {
  nextBackoffMs,
  shouldSubscribeThreads,
  shouldRefetchNow,
  nextAttempt,
  FALLBACK_BASE_MS,
  FALLBACK_MAX_MS,
} from "./inbox-realtime-policy"

describe("nextBackoffMs", () => {
  it("primeira tentativa espera a base", () => {
    expect(nextBackoffMs(0, () => 0)).toBe(FALLBACK_BASE_MS)
  })

  it("dobra a cada tentativa", () => {
    expect(nextBackoffMs(1, () => 0)).toBe(60_000)
    expect(nextBackoffMs(2, () => 0)).toBe(120_000)
    expect(nextBackoffMs(3, () => 0)).toBe(240_000)
  })

  it("não passa do teto", () => {
    expect(nextBackoffMs(4, () => 0)).toBe(FALLBACK_MAX_MS)
    expect(nextBackoffMs(50, () => 0)).toBe(FALLBACK_MAX_MS)
  })

  it("nunca revalida mais rápido que a base", () => {
    for (let i = 0; i < 12; i++) {
      expect(nextBackoffMs(i, () => 0)).toBeGreaterThanOrEqual(FALLBACK_BASE_MS)
    }
  })

  it("jitter só adiciona, e no máximo 30%", () => {
    expect(nextBackoffMs(0, () => 1)).toBe(Math.round(FALLBACK_BASE_MS * 1.3))
    expect(nextBackoffMs(0, () => 0.5)).toBe(Math.round(FALLBACK_BASE_MS * 1.15))
  })

  it("duas abas com sorteios diferentes não caem no mesmo instante", () => {
    expect(nextBackoffMs(2, () => 0.1)).not.toBe(nextBackoffMs(2, () => 0.9))
  })

  it("tolera entrada inválida", () => {
    expect(nextBackoffMs(-3, () => 0)).toBe(FALLBACK_BASE_MS)
    expect(nextBackoffMs(NaN, () => 0)).toBe(FALLBACK_BASE_MS)
  })
})

describe("shouldSubscribeThreads (fail-closed)", () => {
  it("assina com org resolvida", () => {
    expect(shouldSubscribeThreads({ enabled: true, orgId: "org-1" })).toBe(true)
  })

  it("NÃO assina sem org — assinar sem filtro entregaria todas as orgs", () => {
    expect(shouldSubscribeThreads({ enabled: true, orgId: null })).toBe(false)
    expect(shouldSubscribeThreads({ enabled: true, orgId: undefined })).toBe(false)
    expect(shouldSubscribeThreads({ enabled: true, orgId: "" })).toBe(false)
  })

  it("respeita o desligamento explícito", () => {
    expect(shouldSubscribeThreads({ enabled: false, orgId: "org-1" })).toBe(false)
  })
})

describe("shouldRefetchNow", () => {
  it("aba visível revalida", () => {
    expect(shouldRefetchNow("visible")).toBe(true)
  })

  it("aba oculta não revalida", () => {
    expect(shouldRefetchNow("hidden")).toBe(false)
  })

  it("sem document (SSR) não bloqueia", () => {
    expect(shouldRefetchNow(undefined)).toBe(true)
    expect(shouldRefetchNow(null)).toBe(true)
  })
})

describe("nextAttempt", () => {
  it("zera ao conectar", () => {
    expect(nextAttempt(true, 7)).toBe(0)
  })

  it("cresce enquanto desconectado, com teto", () => {
    expect(nextAttempt(false, 0)).toBe(1)
    expect(nextAttempt(false, 9)).toBe(10)
    expect(nextAttempt(false, 10)).toBe(10)
  })
})
