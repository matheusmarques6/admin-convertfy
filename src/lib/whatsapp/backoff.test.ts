import { describe, it, expect, vi } from "vitest"
import { calculateBackoff, withRetry } from "./backoff"

describe("calculateBackoff", () => {
  it("respeita o maxDelay", () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect(calculateBackoff(attempt, { baseDelay: 1000, maxDelay: 5000 })).toBeLessThanOrEqual(5000)
    }
  })

  it("exponencial puro dobra a cada tentativa", () => {
    expect(calculateBackoff(1, { jitter: "none", baseDelay: 100, maxDelay: 60000 })).toBe(100)
    expect(calculateBackoff(2, { jitter: "none", baseDelay: 100, maxDelay: 60000 })).toBe(200)
    expect(calculateBackoff(4, { jitter: "none", baseDelay: 100, maxDelay: 60000 })).toBe(800)
  })

  it("decorrelated fica entre base e cap", () => {
    for (let i = 0; i < 20; i++) {
      const d = calculateBackoff(3, { baseDelay: 100, maxDelay: 10000 })
      expect(d).toBeGreaterThanOrEqual(100)
      expect(d).toBeLessThanOrEqual(10000)
    }
  })
})

describe("withRetry", () => {
  it("retorna no primeiro sucesso", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    await expect(withRetry(fn, { maxRetries: 3 })).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("faz retry em erro de rede e propaga após esgotar", async () => {
    const err = Object.assign(new Error("fetch failed"), {})
    const fn = vi.fn().mockRejectedValue(err)
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelay: 1, maxDelay: 2, jitter: "none" }),
    ).rejects.toThrow("fetch failed")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("não faz retry quando shouldRetry retorna false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"))
    await expect(
      withRetry(fn, { maxRetries: 5, shouldRetry: () => false }),
    ).rejects.toThrow("permanent")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("honra getDelayOverride (Retry-After)", async () => {
    const err = Object.assign(new Error("rate limited"), { code: 429, retryAfterMs: 5 })
    const delays: number[] = []
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok")
    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        getDelayOverride: (e) => (e as { retryAfterMs?: number }).retryAfterMs,
        onRetry: (_e, _a, delay) => delays.push(delay),
      }),
    ).resolves.toBe("ok")
    expect(delays).toEqual([5])
  })
})
