/**
 * Tests for src/lib/integrations/klaviyo/rate-limiter.ts
 * Covers Story AK-1: Tiered Rate Limiter (XS/S/M/L/XL)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  classifyEndpoint,
  enqueueKlaviyoRequest,
  TIER_INTERVALS,
  DAILY_REPORT_QUOTA_LIMIT,
  incrementReportQuota,
  isReportQuotaExhausted,
  getReportQuotaUsage,
  getAllReportQuotaUsage,
  _resetReportQuota,
  type RateTier,
} from "./rate-limiter"

// Mock logger — expose fns for assertions
const { mockLogWarn, mockLogError, mockLogInfo } = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: mockLogInfo,
      warn: mockLogWarn,
      error: mockLogError,
      debug: vi.fn(),
    }),
  },
}))

// ---------------------------------------------------------------------------
// classifyEndpoint tests
// ---------------------------------------------------------------------------

describe("classifyEndpoint", () => {
  describe("XS tier — Reporting API & metric-aggregates", () => {
    const xsPaths = [
      "/campaign-values-reports/",
      "/campaign-series-reports/",
      "/flow-values-reports/",
      "/flow-series-reports/",
      "/segment-values-reports/",
      "/segment-series-reports/",
      "/form-values-reports/",
      "/form-series-reports/",
      "/metric-aggregates/",
      "https://a.klaviyo.com/api/flow-values-reports/",
      "https://a.klaviyo.com/api/metric-aggregates/",
    ]

    it.each(xsPaths)("classifies %s as XS", (path) => {
      expect(classifyEndpoint(path)).toBe("XS")
    })
  })

  describe("S tier — Flows, Campaigns, Lists, Segments, Accounts, Webhooks", () => {
    const sPaths = [
      "/flows/",
      "/flows/abc123",
      "/flows/abc123/flow-actions",
      "/campaigns/",
      "/campaigns/abc123",
      "/lists/",
      "/lists/abc123",
      "/segments/",
      "/segments/abc123",
      "/accounts/",
      "/webhooks/",
    ]

    it.each(sPaths)("classifies %s as S", (path) => {
      expect(classifyEndpoint(path)).toBe("S")
    })
  })

  describe("M tier — Templates, Images, Metrics listing", () => {
    const mPaths = [
      "/templates/",
      "/templates/abc123",
      "/images/",
      "/images/abc123",
      "/metrics/",
      "/metrics/abc123",
    ]

    it.each(mPaths)("classifies %s as M", (path) => {
      expect(classifyEndpoint(path)).toBe("M")
    })
  })

  describe("L tier — Profiles & Events listing (collection)", () => {
    const lPaths = [
      "/profiles/",
      "/profiles",
      "/events/",
      "/events",
    ]

    it.each(lPaths)("classifies %s as L", (path) => {
      expect(classifyEndpoint(path)).toBe("L")
    })
  })

  describe("XL tier — Individual CRUD & Catalog", () => {
    const xlPaths = [
      "/profiles/abc123",
      "/profiles/abc123/relationships/lists",
      "/events/abc123",
      "/catalog/",
      "/catalog/items/",
      "/catalog/items/abc123",
    ]

    it.each(xlPaths)("classifies %s as XL", (path) => {
      expect(classifyEndpoint(path)).toBe("XL")
    })
  })

  describe("Default — unknown paths default to S", () => {
    const unknownPaths = [
      "/unknown-endpoint/",
      "/something-else",
      "/data-privacy/",
    ]

    it.each(unknownPaths)("classifies %s as S (default)", (path) => {
      expect(classifyEndpoint(path)).toBe("S")
    })
  })

  it("handles full URLs by stripping base URL", () => {
    expect(classifyEndpoint("https://a.klaviyo.com/api/flows/")).toBe("S")
    expect(classifyEndpoint("https://a.klaviyo.com/api/metric-aggregates/")).toBe("XS")
    expect(classifyEndpoint("https://a.klaviyo.com/api/profiles/abc123")).toBe("XL")
  })

  it("is case-insensitive", () => {
    expect(classifyEndpoint("/FLOWS/")).toBe("S")
    expect(classifyEndpoint("/Metric-Aggregates/")).toBe("XS")
    expect(classifyEndpoint("/PROFILES/ABC123")).toBe("XL")
  })
})

// ---------------------------------------------------------------------------
// TIER_INTERVALS tests
// ---------------------------------------------------------------------------

describe("TIER_INTERVALS", () => {
  it("has all 5 tiers defined", () => {
    const tiers: RateTier[] = ["XS", "S", "M", "L", "XL"]
    for (const tier of tiers) {
      expect(TIER_INTERVALS[tier]).toBeGreaterThan(0)
    }
  })

  it("XS has the longest interval (most restrictive)", () => {
    expect(TIER_INTERVALS.XS).toBeGreaterThan(TIER_INTERVALS.S)
    expect(TIER_INTERVALS.S).toBeGreaterThan(TIER_INTERVALS.M)
    expect(TIER_INTERVALS.M).toBeGreaterThan(TIER_INTERVALS.L)
    expect(TIER_INTERVALS.L).toBeGreaterThan(TIER_INTERVALS.XL)
  })

  it("XS interval yields ~15 req/min", () => {
    const reqPerMin = 60_000 / TIER_INTERVALS.XS
    expect(reqPerMin).toBeLessThanOrEqual(15)
  })
})

// ---------------------------------------------------------------------------
// enqueueKlaviyoRequest — timing & parallel behavior
// ---------------------------------------------------------------------------

describe("enqueueKlaviyoRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("two XS requests on same key have interval >= 4000ms", async () => {
    const timestamps: number[] = []
    const apiKey = "pk_test_key_12345678"

    const fn = () => {
      timestamps.push(Date.now())
      return Promise.resolve("ok")
    }

    const p1 = enqueueKlaviyoRequest(apiKey, fn, "/flow-values-reports/")
    const p2 = enqueueKlaviyoRequest(apiKey, fn, "/campaign-values-reports/")

    // Advance time to let both process
    await vi.advanceTimersByTimeAsync(10_000)

    await Promise.all([p1, p2])

    expect(timestamps).toHaveLength(2)
    const interval = timestamps[1] - timestamps[0]
    expect(interval).toBeGreaterThanOrEqual(TIER_INTERVALS.XS)
  })

  it("requests of different tiers for same key can run in parallel", async () => {
    const timestamps: Record<string, number> = {}
    const apiKey = "pk_test_key_parallel1"

    // Use unique keys to avoid interference with other tests
    const fnS = () => {
      timestamps.S = Date.now()
      return Promise.resolve("S")
    }
    const fnXL = () => {
      timestamps.XL = Date.now()
      return Promise.resolve("XL")
    }

    const pS = enqueueKlaviyoRequest(apiKey, fnS, "/flows/")
    const pXL = enqueueKlaviyoRequest(apiKey, fnXL, "/events/abc123")

    await vi.advanceTimersByTimeAsync(5_000)
    await Promise.all([pS, pXL])

    // Both should have executed — the XL request should NOT wait for S interval
    expect(timestamps.S).toBeDefined()
    expect(timestamps.XL).toBeDefined()

    // They should run nearly simultaneously (within 100ms of each other)
    const diff = Math.abs(timestamps.S - timestamps.XL)
    expect(diff).toBeLessThan(100)
  })

  it("same-tier same-key requests are serialized with proper interval", async () => {
    const timestamps: number[] = []
    const apiKey = "pk_test_key_serial1"

    const fn = () => {
      timestamps.push(Date.now())
      return Promise.resolve("ok")
    }

    // Two S-tier requests
    const p1 = enqueueKlaviyoRequest(apiKey, fn, "/flows/")
    const p2 = enqueueKlaviyoRequest(apiKey, fn, "/campaigns/")

    await vi.advanceTimersByTimeAsync(5_000)
    await Promise.all([p1, p2])

    expect(timestamps).toHaveLength(2)
    const interval = timestamps[1] - timestamps[0]
    expect(interval).toBeGreaterThanOrEqual(TIER_INTERVALS.S)
  })

  it("returns the value from the executed function", async () => {
    const apiKey = "pk_test_key_return1"
    const fn = () => Promise.resolve({ data: "test" })

    const p = enqueueKlaviyoRequest(apiKey, fn, "/flows/")
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await p

    expect(result).toEqual({ data: "test" })
  })

  it("propagates errors from the executed function", async () => {
    const apiKey = "pk_test_key_error1"
    const fn = () => { throw new Error("test error") }

    const p = enqueueKlaviyoRequest(apiKey, fn as () => Promise<string>, "/flows/")
    // Attach rejection handler immediately to prevent unhandled rejection warning
    const assertion = expect(p).rejects.toThrow("test error")
    await vi.advanceTimersByTimeAsync(5_000)

    await assertion
  })
})

// ---------------------------------------------------------------------------
// AK-2: Daily Report Quota Tracking
// ---------------------------------------------------------------------------

describe("AK-2: Daily Report Quota Tracking", () => {
  beforeEach(() => {
    _resetReportQuota()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe("incrementReportQuota & getReportQuotaUsage", () => {
    it("starts at 0 for a new API key", () => {
      const usage = getReportQuotaUsage("pk_test_quota_1")
      expect(usage.used).toBe(0)
      expect(usage.limit).toBe(DAILY_REPORT_QUOTA_LIMIT)
      expect(usage.exhausted).toBe(false)
    })

    it("increments count for each call", () => {
      const key = "pk_test_quota_inc"
      incrementReportQuota(key)
      incrementReportQuota(key)
      incrementReportQuota(key)

      const usage = getReportQuotaUsage(key)
      expect(usage.used).toBe(3)
      expect(usage.exhausted).toBe(false)
    })

    it("tracks counters independently per API key", () => {
      const key1 = "pk_test_quota_a"
      const key2 = "pk_test_quota_b"

      incrementReportQuota(key1)
      incrementReportQuota(key1)
      incrementReportQuota(key2)

      expect(getReportQuotaUsage(key1).used).toBe(2)
      expect(getReportQuotaUsage(key2).used).toBe(1)
    })
  })

  describe("date reset", () => {
    it("resets counter when UTC date changes", () => {
      const key = "pk_test_quota_date"

      // Increment on "today"
      incrementReportQuota(key)
      incrementReportQuota(key)
      expect(getReportQuotaUsage(key).used).toBe(2)

      // Mock Date to return tomorrow
      const tomorrow = new Date()
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      vi.useFakeTimers()
      vi.setSystemTime(tomorrow)

      // Counter should reset on next increment
      incrementReportQuota(key)
      expect(getReportQuotaUsage(key).used).toBe(1)

      vi.useRealTimers()
    })

    it("getReportQuotaUsage returns 0 for a different date", () => {
      const key = "pk_test_quota_stale"
      incrementReportQuota(key)
      expect(getReportQuotaUsage(key).used).toBe(1)

      // Advance to tomorrow
      const tomorrow = new Date()
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      vi.useFakeTimers()
      vi.setSystemTime(tomorrow)

      // Without incrementing, should return 0
      expect(getReportQuotaUsage(key).used).toBe(0)

      vi.useRealTimers()
    })
  })

  describe("soft halt at 220", () => {
    it("isReportQuotaExhausted returns true at threshold", () => {
      const key = "pk_test_quota_halt"

      // Fill up to 220
      for (let i = 0; i < 220; i++) {
        incrementReportQuota(key)
      }

      expect(isReportQuotaExhausted(key)).toBe(true)
      expect(getReportQuotaUsage(key).exhausted).toBe(true)
    })

    it("isReportQuotaExhausted returns false below threshold", () => {
      const key = "pk_test_quota_below"

      for (let i = 0; i < 219; i++) {
        incrementReportQuota(key)
      }

      expect(isReportQuotaExhausted(key)).toBe(false)
      expect(getReportQuotaUsage(key).exhausted).toBe(false)
    })

    it("enqueueKlaviyoRequest returns null for XS tier when quota exhausted", async () => {
      vi.useFakeTimers()
      const key = "pk_test_quota_enqueue_halt"

      // Exhaust quota
      for (let i = 0; i < 220; i++) {
        incrementReportQuota(key)
      }

      const fn = vi.fn().mockResolvedValue({ data: "should not be called" })
      const result = await enqueueKlaviyoRequest(key, fn, "/flow-values-reports/")

      expect(result).toBeNull()
      expect(fn).not.toHaveBeenCalled()
    })

    it("force: true bypasses soft halt", async () => {
      vi.useFakeTimers()
      const key = "pk_test_quota_force"

      // Exhaust quota
      for (let i = 0; i < 220; i++) {
        incrementReportQuota(key)
      }

      const fn = vi.fn().mockResolvedValue({ data: "forced" })
      const p = enqueueKlaviyoRequest(key, fn, "/flow-values-reports/", { force: true })
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await p

      expect(result).toEqual({ data: "forced" })
      expect(fn).toHaveBeenCalled()
    })

    it("non-XS tier is not affected by quota", async () => {
      vi.useFakeTimers()
      const key = "pk_test_quota_non_xs"

      // Exhaust quota
      for (let i = 0; i < 220; i++) {
        incrementReportQuota(key)
      }

      const fn = vi.fn().mockResolvedValue({ data: "flows" })
      const p = enqueueKlaviyoRequest(key, fn, "/flows/")
      await vi.advanceTimersByTimeAsync(5_000)
      const result = await p

      expect(result).toEqual({ data: "flows" })
      expect(fn).toHaveBeenCalled()
    })
  })

  describe("warning logs", () => {
    it("logs warning at 80% threshold (180)", () => {
      const key = "pk_test_quota_warn180"

      for (let i = 0; i < 180; i++) {
        incrementReportQuota(key)
      }

      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining("at 80% of daily report quota (180/225)")
      )
    })

    it("logs error at 98% threshold (220)", () => {
      const key = "pk_test_quota_warn220"

      for (let i = 0; i < 220; i++) {
        incrementReportQuota(key)
      }

      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining("approaching daily report limit (220/225)")
      )
    })
  })

  describe("getAllReportQuotaUsage", () => {
    it("returns all keys with usage today", () => {
      const key1 = "pk_test_quota_all_1"
      const key2 = "pk_test_quota_all_2"

      incrementReportQuota(key1)
      incrementReportQuota(key1)
      incrementReportQuota(key2)

      const all = getAllReportQuotaUsage()
      expect(all.size).toBe(2)
      expect(all.get(key1)!.used).toBe(2)
      expect(all.get(key2)!.used).toBe(1)
    })

    it("excludes keys from a different date", () => {
      const key = "pk_test_quota_old"
      incrementReportQuota(key)

      // Advance to tomorrow
      const tomorrow = new Date()
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      vi.useFakeTimers()
      vi.setSystemTime(tomorrow)

      const all = getAllReportQuotaUsage()
      expect(all.size).toBe(0)

      vi.useRealTimers()
    })
  })
})
