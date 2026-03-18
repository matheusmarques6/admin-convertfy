/**
 * Tests for cron sync-reports route.ts
 * Covers Story 16.7.7 — KlaviyoPermissionError handling in pre-fetch and period loop
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Track DB calls ──────────────────────────────────────────────────────────
const upsertCalls: Array<{ table: string; data: Record<string, unknown> }> = []
const updateCalls: Array<{ table: string; data: Record<string, unknown>; eqId: string }> = []

let mockStoreList = [{ id: "store-1", store_name: "Test Store", org_id: "org-1" }]

// Chainable result that always succeeds
const ok = { data: null, error: null }

function chainable(table: string) {
  let inCallCount = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: Record<string, (...args: any[]) => any> = {}
  self.select = () => self
  self.eq = () => self
  self.not = () => self
  self.in = () => {
    inCallCount++
    // store_revenue_summary freshness query: .in("store_id",...).in("sync_status",...)
    // Return empty data on the terminal (2nd) .in() call
    if (table === "store_revenue_summary" && inCallCount >= 2) {
      return { data: [], error: null }
    }
    return self
  }
  self.single = () => {
    if (table === "cron_locks") return { data: { is_running: false }, error: null }
    return { data: null, error: null }
  }
  self.or = () => ({
    not: () => ({ data: mockStoreList, error: null }),
  })
  self.upsert = (data: Record<string, unknown>) => {
    upsertCalls.push({ table, data })
    return ok
  }
  self.update = (data: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      updateCalls.push({ table, data, eqId: id })
      return ok
    },
  })
  return self
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => chainable(table),
    rpc: (fnName: string) => {
      if (fnName === "acquire_sync_lock") return { data: true, error: null }
      return { data: 0, error: null }
    },
  }),
}))

vi.mock("@/lib/cache", () => ({
  cleanExpiredCache: vi.fn().mockResolvedValue(0),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

// ── Mock Klaviyo integrations ─────────────────────────────────────────────
const mockGetCachedAccountInfo = vi.fn()
const mockGetCachedPlacedOrderMetric = vi.fn()

vi.mock("@/lib/integrations/klaviyo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/klaviyo")>()
  return {
    ...actual,
    getCachedAccountInfo: (...args: unknown[]) => mockGetCachedAccountInfo(...args),
    getCachedPlacedOrderMetric: (...args: unknown[]) => mockGetCachedPlacedOrderMetric(...args),
    getTimezoneOffset: () => "-03:00",
    parseDateRangeInTimezone: () => ({ startDateStr: "2026-03-01", endDateStr: "2026-03-04" }),
  }
})

// ── Mock sync services ─────────────────────────────────────────────────────
const mockFetchFlowNames = vi.fn()
const mockFetchCampaignNames = vi.fn()
const mockFetchAudienceForStore = vi.fn()
const mockSyncKlaviyoForPeriod = vi.fn()

vi.mock("@/lib/services/klaviyo-sync.service", () => ({
  fetchFlowNames: (...args: unknown[]) => mockFetchFlowNames(...args),
  fetchCampaignNames: (...args: unknown[]) => mockFetchCampaignNames(...args),
  fetchAudienceForStore: (...args: unknown[]) => mockFetchAudienceForStore(...args),
  syncKlaviyoForPeriod: (...args: unknown[]) => mockSyncKlaviyoForPeriod(...args),
}))

vi.mock("@/lib/services/sync-persistence.service", () => ({
  upsertSyncResults: vi.fn().mockResolvedValue(undefined),
  upsertAudiences: vi.fn().mockResolvedValue(undefined),
}))

const mockGetStoreCredentials = vi.fn()

vi.mock("@/lib/services/credentials.service", () => ({
  getStoreCredentials: (...args: unknown[]) => mockGetStoreCredentials(...args),
  KLAVIYO_CREDENTIALS_FILTER: "klaviyo_private_key.not.is.null,klaviyo_api_key.not.is.null",
}))

let mockPeriods = ["7d", "30d"]
vi.mock("@/lib/shared/data-status", () => ({
  get CACHED_PERIODS() { return mockPeriods },
  PERIOD_FRESHNESS_THRESHOLDS: { "7d": 0, "15d": 4 * 60 * 60_000, "30d": 6 * 60 * 60_000, "90d": 12 * 60 * 60_000 },
}))

import { GET } from "./route"
import { KlaviyoPermissionError, KlaviyoRateLimitError } from "@/lib/integrations/klaviyo"

function makeRequest() {
  return new Request("http://localhost/api/cron/sync-reports", {
    headers: { authorization: "Bearer test-secret" },
  }) as unknown as Parameters<typeof GET>[0]
}

function successSyncResult() {
  return {
    success: true,
    data: {
      flowRevenue: 100, campaignRevenue: 200,
      flowDataAvailable: true, campaignDataAvailable: true,
      storeRevenue: 300, storeOrders: 5,
      startDateStr: "2026-03-01", endDateStr: "2026-03-04",
      flowRows: [], campRows: [], currency: "BRL",
    },
    source: "live",
    fetchedAt: new Date().toISOString(),
  }
}

/** Filter updateCalls to only client_stores (exclude cron_locks) */
function clientStoresUpdates() {
  return updateCalls.filter(c => c.table === "client_stores")
}

describe("Story 16.7.7 — KlaviyoPermissionError in cron sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertCalls.length = 0
    updateCalls.length = 0
    mockStoreList = [{ id: "store-1", store_name: "Test Store", org_id: "org-1" }]
    mockPeriods = ["7d", "30d"]
    process.env.CRON_SECRET = "test-secret"
    mockGetStoreCredentials.mockResolvedValue({ klaviyo_private_key: "pk_test_key" })
    mockFetchAudienceForStore.mockResolvedValue({ success: false, error: "skip" })
  })

  it("records [PERMISSION] error for ALL periods when getCachedAccountInfo throws", async () => {
    mockGetCachedAccountInfo.mockRejectedValue(
      new KlaviyoPermissionError(["metrics:read", "campaigns:read"])
    )

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(body.stores).toBeDefined()
    const errors = body.stores.filter((s: { status: string }) => s.status === "error")
    expect(errors).toHaveLength(2) // 2 periods (7d, 30d)

    for (const err of errors) {
      expect(err.error).toContain("[PERMISSION]")
      expect(err.error).toContain("metrics:read")
    }

    // store_revenue_summary upserts for both periods
    const summaryUpserts = upsertCalls.filter(c => c.table === "store_revenue_summary")
    expect(summaryUpserts).toHaveLength(2)
    for (const u of summaryUpserts) {
      expect(u.data.sync_status).toBe("error")
      expect(u.data.sync_error).toContain("[PERMISSION]")
    }

    // client_stores updated with validation fields
    const csUpdates = clientStoresUpdates()
    expect(csUpdates).toHaveLength(1)
    expect(csUpdates[0].data.klaviyo_validation_error).toContain("[PERMISSION]")
    expect(csUpdates[0].data.klaviyo_missing_scopes).toEqual(["metrics:read", "campaigns:read"])
    expect(csUpdates[0].data.klaviyo_has_reporting_access).toBe(false)
  })

  it("records [PERMISSION] error when fetchFlowNames throws", async () => {
    mockGetCachedAccountInfo.mockResolvedValue({ timezone: "America/Sao_Paulo", currency: "BRL" })
    mockGetCachedPlacedOrderMetric.mockResolvedValue("metric-123")
    mockFetchFlowNames.mockRejectedValue(new KlaviyoPermissionError(["flows:read"]))
    mockFetchCampaignNames.mockResolvedValue(new Map())

    const response = await GET(makeRequest())
    const body = await response.json()

    const errors = body.stores.filter((s: { status: string }) => s.status === "error")
    expect(errors).toHaveLength(2)
    for (const err of errors) {
      expect(err.error).toContain("[PERMISSION]")
      expect(err.error).toContain("flows:read")
    }
  })

  it("records [PERMISSION] error when getCachedPlacedOrderMetric throws (not 'No Placed Order metric')", async () => {
    mockGetCachedAccountInfo.mockResolvedValue({ timezone: "America/Sao_Paulo", currency: "BRL" })
    mockGetCachedPlacedOrderMetric.mockRejectedValue(
      new KlaviyoPermissionError(["metrics:read"])
    )

    const response = await GET(makeRequest())
    const body = await response.json()

    const errors = body.stores.filter((s: { status: string }) => s.status === "error")
    expect(errors).toHaveLength(2)
    for (const err of errors) {
      expect(err.error).not.toContain("No Placed Order metric")
      expect(err.error).toContain("[PERMISSION]")
    }
  })

  it("handles KlaviyoPermissionError in period loop with break", async () => {
    mockGetCachedAccountInfo.mockResolvedValue({ timezone: "America/Sao_Paulo", currency: "BRL" })
    mockGetCachedPlacedOrderMetric.mockResolvedValue("metric-123")
    mockFetchFlowNames.mockResolvedValue(new Map())
    mockFetchCampaignNames.mockResolvedValue(new Map())
    mockSyncKlaviyoForPeriod.mockRejectedValue(
      new KlaviyoPermissionError(["flows:read"])
    )

    const response = await GET(makeRequest())
    const body = await response.json()

    const errors = body.stores.filter((s: { status: string }) => s.status === "error")
    // break after first period — only 1 error, second period not attempted
    expect(errors).toHaveLength(1)
    expect(errors[0].error).toContain("[PERMISSION]")
    expect(mockSyncKlaviyoForPeriod).toHaveBeenCalledTimes(1)

    // client_stores updated
    const csUpdates = clientStoresUpdates()
    expect(csUpdates).toHaveLength(1)
    expect(csUpdates[0].data.klaviyo_missing_scopes).toEqual(["flows:read"])
  })

  it("healthy stores are not affected by a store with permission error (batch isolation)", async () => {
    mockStoreList = [
      { id: "store-bad", store_name: "Bad Store", org_id: "org-1" },
      { id: "store-good", store_name: "Good Store", org_id: "org-1" },
    ]

    mockGetStoreCredentials.mockImplementation((storeId: string) =>
      Promise.resolve({ klaviyo_private_key: `pk_${storeId}` })
    )

    mockGetCachedAccountInfo.mockImplementation((apiKey: string) => {
      if (apiKey === "pk_store-bad") {
        return Promise.reject(new KlaviyoPermissionError(["metrics:read"]))
      }
      return Promise.resolve({ timezone: "America/Sao_Paulo", currency: "BRL" })
    })

    mockGetCachedPlacedOrderMetric.mockResolvedValue("metric-123")
    mockFetchFlowNames.mockResolvedValue(new Map())
    mockFetchCampaignNames.mockResolvedValue(new Map())
    mockSyncKlaviyoForPeriod.mockResolvedValue(successSyncResult())

    const response = await GET(makeRequest())
    const body = await response.json()

    // Bad store: 2 errors (both periods)
    const badResults = body.stores.filter((s: { storeId: string }) => s.storeId === "store-bad")
    expect(badResults).toHaveLength(2)
    expect(badResults.every((r: { status: string }) => r.status === "error")).toBe(true)

    // Good store: 2 ok (both periods)
    const goodResults = body.stores.filter((s: { storeId: string }) => s.storeId === "store-good")
    expect(goodResults).toHaveLength(2)
    expect(goodResults.every((r: { status: string }) => r.status === "ok")).toBe(true)
  })
})

describe("Story 16.8 — KlaviyoRateLimitError handling in cron sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertCalls.length = 0
    updateCalls.length = 0
    mockStoreList = [{ id: "store-1", store_name: "Test Store", org_id: "org-1" }]
    mockPeriods = ["7d", "30d"]
    process.env.CRON_SECRET = "test-secret"
    mockGetStoreCredentials.mockResolvedValue({ klaviyo_private_key: "pk_test_key" })
    mockFetchAudienceForStore.mockResolvedValue({ success: false, error: "skip" })
  })

  it("AC 16.8.1: records [RATE_LIMIT] error for ALL periods when getCachedAccountInfo throws KlaviyoRateLimitError", async () => {
    mockGetCachedAccountInfo.mockRejectedValue(new KlaviyoRateLimitError(3723000))

    const response = await GET(makeRequest())
    const body = await response.json()

    const errors = body.stores.filter((s: { status: string }) => s.status === "error")
    expect(errors).toHaveLength(2) // 2 periods (7d, 30d)

    for (const err of errors) {
      expect(err.error).toContain("[RATE_LIMIT]")
      expect(err.error).toContain("pre-fetch")
      expect(err.error).toContain("3723000ms")
    }

    // store_revenue_summary upserts for both periods
    const summaryUpserts = upsertCalls.filter(c => c.table === "store_revenue_summary")
    expect(summaryUpserts).toHaveLength(2)
    for (const u of summaryUpserts) {
      expect(u.data.sync_status).toBe("error")
      expect(u.data.sync_error).toContain("[RATE_LIMIT]")
    }

    // syncKlaviyoForPeriod should NOT have been called (store was skipped)
    expect(mockSyncKlaviyoForPeriod).not.toHaveBeenCalled()
  })

  it("AC 16.8.2: continues to next period after single rate limit in period loop", async () => {
    vi.useFakeTimers()
    mockGetCachedAccountInfo.mockResolvedValue({ timezone: "America/Sao_Paulo", currency: "BRL" })
    mockGetCachedPlacedOrderMetric.mockResolvedValue("metric-123")
    mockFetchFlowNames.mockResolvedValue(new Map())
    mockFetchCampaignNames.mockResolvedValue(new Map())

    // Period 1 (7d) = rate limit, Period 2 (30d) = success
    mockSyncKlaviyoForPeriod
      .mockRejectedValueOnce(new KlaviyoRateLimitError(60000))
      .mockResolvedValueOnce(successSyncResult())

    const resultPromise = GET(makeRequest())
    await vi.runAllTimersAsync()
    const response = await resultPromise
    const body = await response.json()

    // Both periods attempted
    expect(mockSyncKlaviyoForPeriod).toHaveBeenCalledTimes(2)

    // Period 1 = error with [RATE_LIMIT], Period 2 = ok
    const results = body.stores
    expect(results).toHaveLength(2)
    expect(results[0].status).toBe("error")
    expect(results[0].error).toContain("[RATE_LIMIT]")
    expect(results[1].status).toBe("ok")
    vi.useRealTimers()
  })

  it("AC 16.8.2: breaks after 3 consecutive rate limits", async () => {
    vi.useFakeTimers()
    mockPeriods = ["7d", "30d", "90d", "365d"]
    mockGetCachedAccountInfo.mockResolvedValue({ timezone: "America/Sao_Paulo", currency: "BRL" })
    mockGetCachedPlacedOrderMetric.mockResolvedValue("metric-123")
    mockFetchFlowNames.mockResolvedValue(new Map())
    mockFetchCampaignNames.mockResolvedValue(new Map())

    // All periods throw rate limit
    mockSyncKlaviyoForPeriod.mockRejectedValue(new KlaviyoRateLimitError(60000))

    const resultPromise = GET(makeRequest())
    await vi.runAllTimersAsync()
    const response = await resultPromise
    const body = await response.json()

    // Only 3 periods attempted (break after 3 consecutive)
    expect(mockSyncKlaviyoForPeriod).toHaveBeenCalledTimes(3)

    const errors = body.stores.filter((s: { status: string }) => s.status === "error")
    expect(errors).toHaveLength(3)
    for (const err of errors) {
      expect(err.error).toContain("[RATE_LIMIT]")
    }
    vi.useRealTimers()
  })

  it("AC 16.8.2: resets consecutiveRateLimits after success (no break on non-consecutive)", async () => {
    vi.useFakeTimers()
    mockPeriods = ["7d", "30d", "90d"]
    mockGetCachedAccountInfo.mockResolvedValue({ timezone: "America/Sao_Paulo", currency: "BRL" })
    mockGetCachedPlacedOrderMetric.mockResolvedValue("metric-123")
    mockFetchFlowNames.mockResolvedValue(new Map())
    mockFetchCampaignNames.mockResolvedValue(new Map())

    // Period 1 = rate limit, Period 2 = success, Period 3 = rate limit
    // Should NOT break because they are not consecutive
    mockSyncKlaviyoForPeriod
      .mockRejectedValueOnce(new KlaviyoRateLimitError(60000))
      .mockResolvedValueOnce(successSyncResult())
      .mockRejectedValueOnce(new KlaviyoRateLimitError(60000))

    const resultPromise = GET(makeRequest())
    await vi.runAllTimersAsync()
    const response = await resultPromise
    const body = await response.json()

    // All 3 periods attempted (no break)
    expect(mockSyncKlaviyoForPeriod).toHaveBeenCalledTimes(3)

    const results = body.stores
    expect(results).toHaveLength(3)
    expect(results[0].status).toBe("error")
    expect(results[0].error).toContain("[RATE_LIMIT]")
    expect(results[1].status).toBe("ok")
    expect(results[2].status).toBe("error")
    expect(results[2].error).toContain("[RATE_LIMIT]")
    vi.useRealTimers()
  })

  it("AC 16.8.3: prefixes [PERMISSION] when KlaviyoPermissionError in period loop", async () => {
    mockGetCachedAccountInfo.mockResolvedValue({ timezone: "America/Sao_Paulo", currency: "BRL" })
    mockGetCachedPlacedOrderMetric.mockResolvedValue("metric-123")
    mockFetchFlowNames.mockResolvedValue(new Map())
    mockFetchCampaignNames.mockResolvedValue(new Map())
    mockSyncKlaviyoForPeriod.mockRejectedValue(
      new KlaviyoPermissionError(["flows:read"])
    )

    const response = await GET(makeRequest())
    const body = await response.json()

    const errors = body.stores.filter((s: { status: string }) => s.status === "error")
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0].error).toContain("[PERMISSION]")

    // Verify sync_error in upsert has [PERMISSION] prefix
    const summaryUpserts = upsertCalls.filter(
      c => c.table === "store_revenue_summary" && typeof c.data.sync_error === "string" && (c.data.sync_error as string).includes("[PERMISSION]")
    )
    expect(summaryUpserts.length).toBeGreaterThanOrEqual(1)
  })
})
