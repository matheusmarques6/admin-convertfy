/**
 * Tests for fetchStoreReport (pure async function) and formatTimeRemaining.
 *
 * Hook-level tests (useStoresFanOut) require @testing-library/react-hooks
 * which is not installed. The pure functions cover the critical logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchStoreReport } from "./use-stores-fan-out"
import { formatTimeRemaining } from "@/components/reports/report-generation-banner"
import type { DateRange } from "@/types/report"

// ─── Setup ──────────────────────────────────────────────────────────────────

const range: DateRange = { startDate: "2026-01-01", endDate: "2026-01-31" }

function mockFetchResponse(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchResponse({}))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── fetchStoreReport ───────────────────────────────────────────────────────

describe("fetchStoreReport", () => {
  it("should build correct URL with query params", async () => {
    const body = {
      revenue: {
        totalRevenue: 1000,
        campaignRevenue: 400,
        flowRevenue: 600,
        currency: "BRL",
      },
    }
    vi.stubGlobal("fetch", mockFetchResponse(body))

    const controller = new AbortController()
    await fetchStoreReport("store-123", range, controller.signal)

    expect(fetch).toHaveBeenCalledWith(
      "/api/integrations/klaviyo/report?store_id=store-123&period=custom&start_date=2026-01-01&end_date=2026-01-31",
      { signal: controller.signal }
    )
  })

  it("should extract revenue from nested revenue object", async () => {
    const body = {
      revenue: {
        totalRevenue: 5000,
        campaignRevenue: 2000,
        flowRevenue: 3000,
        currency: "USD",
      },
    }
    vi.stubGlobal("fetch", mockFetchResponse(body))

    const result = await fetchStoreReport("s1", range, new AbortController().signal)

    expect(result).toEqual({
      totalRevenue: 5000,
      campaignRevenue: 2000,
      flowRevenue: 3000,
      currency: "USD",
    })
  })

  it("should extract revenue from flat response (fallback)", async () => {
    const body = {
      totalRevenue: 1500,
      campaignRevenue: 500,
      flowRevenue: 1000,
      account: { currency: "EUR" },
    }
    vi.stubGlobal("fetch", mockFetchResponse(body))

    const result = await fetchStoreReport("s2", range, new AbortController().signal)

    expect(result).toEqual({
      totalRevenue: 1500,
      campaignRevenue: 500,
      flowRevenue: 1000,
      currency: "EUR",
    })
  })

  it("should default to zero and BRL when fields are missing", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({}))

    const result = await fetchStoreReport("s3", range, new AbortController().signal)

    expect(result).toEqual({
      totalRevenue: 0,
      campaignRevenue: 0,
      flowRevenue: 0,
      currency: "BRL",
    })
  })

  it("should handle falsy-zero correctly (revenue = 0 is valid)", async () => {
    const body = {
      revenue: {
        totalRevenue: 0,
        campaignRevenue: 0,
        flowRevenue: 0,
        currency: "BRL",
      },
    }
    vi.stubGlobal("fetch", mockFetchResponse(body))

    const result = await fetchStoreReport("s4", range, new AbortController().signal)

    expect(result.totalRevenue).toBe(0)
    expect(result.campaignRevenue).toBe(0)
    expect(result.flowRevenue).toBe(0)
  })

  it("should throw on HTTP error with JSON error message", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({ error: "Klaviyo key invalid" }, 403)
    )

    await expect(
      fetchStoreReport("s5", range, new AbortController().signal)
    ).rejects.toThrow("Klaviyo key invalid")
  })

  it("should throw on HTTP error with plain text body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    }))

    await expect(
      fetchStoreReport("s6", range, new AbortController().signal)
    ).rejects.toThrow("Internal Server Error")
  })

  it("should throw AbortError when signal is aborted", async () => {
    const controller = new AbortController()
    controller.abort()

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")))

    await expect(
      fetchStoreReport("s7", range, controller.signal)
    ).rejects.toThrow("Aborted")
  })
})

// ─── formatTimeRemaining ────────────────────────────────────────────────────

describe("formatTimeRemaining", () => {
  it("should return empty string when all done", () => {
    expect(formatTimeRemaining(8, 8, 60000)).toBe("")
  })

  it("should return 'calculando...' when no stores completed", () => {
    expect(formatTimeRemaining(0, 8, 0)).toBe("calculando...")
  })

  it("should return '<1 min' for short remaining time", () => {
    // 2 completed in 10s, 1 remaining => ~5s => <1 min
    expect(formatTimeRemaining(2, 3, 10000)).toBe("<1 min")
  })

  it("should return '~1 min' for about a minute remaining", () => {
    // 1 completed in 10s, 6 remaining => avg 10s * 6 = 60s => ceil(60/60) = ~1 min
    expect(formatTimeRemaining(1, 7, 10000)).toBe("~1 min")
  })

  it("should return '~2 min' for two minutes remaining", () => {
    // 2 completed in 24s, 8 remaining => ~96s => ~2 min
    expect(formatTimeRemaining(2, 10, 24000)).toBe("~2 min")
  })
})
