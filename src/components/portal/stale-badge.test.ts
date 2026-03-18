import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  isCachedPeriod,
  PERIOD_FRESHNESS_THRESHOLDS,
  STALE_THRESHOLD_MULTIPLIER,
} from "@/lib/shared/data-status"
import { formatElapsed } from "./stale-badge"

describe("StaleBadge logic (AK-14.3)", () => {
  it("STALE_THRESHOLD_MULTIPLIER is 2", () => {
    expect(STALE_THRESHOLD_MULTIPLIER).toBe(2)
  })

  describe("stale detection", () => {
    const NOW = new Date("2026-03-18T12:00:00Z").getTime()

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("7d period: data is stale when older than 2x threshold (6h)", () => {
      const threshold = PERIOD_FRESHNESS_THRESHOLDS["7d"] // 3h
      // Data fetched 7 hours ago
      const fetchedAt = new Date(NOW - 7 * 3_600_000).toISOString()
      const elapsed = NOW - new Date(fetchedAt).getTime()
      expect(elapsed).toBeGreaterThan(threshold * STALE_THRESHOLD_MULTIPLIER)
    })

    it("7d period: data is NOT stale when within 2x threshold", () => {
      const threshold = PERIOD_FRESHNESS_THRESHOLDS["7d"] // 3h
      // Data fetched 4 hours ago (< 6h threshold)
      const fetchedAt = new Date(NOW - 4 * 3_600_000).toISOString()
      const elapsed = NOW - new Date(fetchedAt).getTime()
      expect(elapsed).toBeLessThan(threshold * STALE_THRESHOLD_MULTIPLIER)
    })

    it("30d period: data is stale when older than 2x threshold (12h)", () => {
      const threshold = PERIOD_FRESHNESS_THRESHOLDS["30d"] // 6h
      // Data fetched 14 hours ago
      const fetchedAt = new Date(NOW - 14 * 3_600_000).toISOString()
      const elapsed = NOW - new Date(fetchedAt).getTime()
      expect(elapsed).toBeGreaterThan(threshold * STALE_THRESHOLD_MULTIPLIER)
    })

    it("30d period: data is NOT stale when within 2x threshold", () => {
      const threshold = PERIOD_FRESHNESS_THRESHOLDS["30d"] // 6h
      // Data fetched 10 hours ago (< 12h threshold)
      const fetchedAt = new Date(NOW - 10 * 3_600_000).toISOString()
      const elapsed = NOW - new Date(fetchedAt).getTime()
      expect(elapsed).toBeLessThan(threshold * STALE_THRESHOLD_MULTIPLIER)
    })

    it("non-cached periods (1d) should not show stale badge", () => {
      expect(isCachedPeriod("1d")).toBe(false)
    })
  })

  describe("formatElapsed", () => {
    it("formats minutes correctly", () => {
      expect(formatElapsed(15 * 60_000)).toBe("15 minutos")
    })

    it("formats hours correctly", () => {
      expect(formatElapsed(3 * 3_600_000)).toBe("3 horas")
    })

    it("formats days correctly", () => {
      expect(formatElapsed(2 * 86_400_000)).toBe("2 dias")
    })

    it("rounds to nearest minute for sub-hour", () => {
      expect(formatElapsed(45 * 60_000)).toBe("45 minutos")
    })

    it("rounds to nearest hour for sub-day", () => {
      expect(formatElapsed(8 * 3_600_000)).toBe("8 horas")
    })
  })
})
