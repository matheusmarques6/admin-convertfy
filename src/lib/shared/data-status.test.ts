import { describe, it, expect } from "vitest"
import {
  CACHED_PERIODS,
  LIVE_ONLY_PERIODS,
  ALL_PERIODS,
  isCachedPeriod,
  PERIOD_FRESHNESS_THRESHOLDS,
  LIVE_FETCH_COOLDOWN_MS,
  CUSTOM_RANGE_COOLDOWN_MS,
  LIVE_FETCH_CACHE_TTL_MS,
} from "./data-status"

describe("data-status constants", () => {
  it("CACHED_PERIODS should contain 4 standard periods", () => {
    expect(CACHED_PERIODS).toEqual(["30d", "7d", "15d", "90d"])
    expect(CACHED_PERIODS).toHaveLength(4)
  })

  it("LIVE_ONLY_PERIODS should contain non-cached periods", () => {
    expect(LIVE_ONLY_PERIODS).toEqual(["1d", "12m", "custom"])
    expect(LIVE_ONLY_PERIODS).toHaveLength(3)
  })

  it("ALL_PERIODS should be the union of CACHED + LIVE_ONLY", () => {
    expect(ALL_PERIODS).toHaveLength(CACHED_PERIODS.length + LIVE_ONLY_PERIODS.length)
    for (const p of CACHED_PERIODS) {
      expect(ALL_PERIODS).toContain(p)
    }
    for (const p of LIVE_ONLY_PERIODS) {
      expect(ALL_PERIODS).toContain(p)
    }
  })

  it("cooldown constants should be positive numbers", () => {
    expect(LIVE_FETCH_COOLDOWN_MS).toBe(60_000)
    expect(CUSTOM_RANGE_COOLDOWN_MS).toBe(30 * 60_000)
    expect(LIVE_FETCH_CACHE_TTL_MS).toBe(5 * 60_000)
  })
})

describe("isCachedPeriod", () => {
  it("should return true for cached periods", () => {
    expect(isCachedPeriod("7d")).toBe(true)
    expect(isCachedPeriod("15d")).toBe(true)
    expect(isCachedPeriod("30d")).toBe(true)
    expect(isCachedPeriod("90d")).toBe(true)
  })

  it("should return false for live-only periods", () => {
    expect(isCachedPeriod("1d")).toBe(false)
    expect(isCachedPeriod("12m")).toBe(false)
    expect(isCachedPeriod("custom")).toBe(false)
  })

  it("should return false for unknown periods", () => {
    expect(isCachedPeriod("")).toBe(false)
    expect(isCachedPeriod("365d")).toBe(false)
    expect(isCachedPeriod("invalid")).toBe(false)
  })
})

describe("PERIOD_FRESHNESS_THRESHOLDS (AK-6)", () => {
  it("7d threshold is 1 hour", () => {
    expect(PERIOD_FRESHNESS_THRESHOLDS["7d"]).toBe(1 * 60 * 60_000)
  })

  it("7d is fresh when fetched less than 1h ago", () => {
    const threshold = PERIOD_FRESHNESS_THRESHOLDS["7d"]
    const fetchedAt = new Date(Date.now() - 30 * 60_000) // 30 min ago
    const ageMs = Date.now() - fetchedAt.getTime()
    expect(ageMs < threshold).toBe(true)
  })

  it("7d is stale when fetched more than 1h ago", () => {
    const threshold = PERIOD_FRESHNESS_THRESHOLDS["7d"]
    const fetchedAt = new Date(Date.now() - 2 * 60 * 60_000) // 2h ago
    const ageMs = Date.now() - fetchedAt.getTime()
    expect(ageMs < threshold).toBe(false)
  })

  it("other periods are not affected", () => {
    expect(PERIOD_FRESHNESS_THRESHOLDS["15d"]).toBe(2 * 60 * 60_000)
    expect(PERIOD_FRESHNESS_THRESHOLDS["30d"]).toBe(4 * 60 * 60_000)
    expect(PERIOD_FRESHNESS_THRESHOLDS["90d"]).toBe(8 * 60 * 60_000)
  })
})
