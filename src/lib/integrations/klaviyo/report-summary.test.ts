/**
 * Tests for src/lib/integrations/klaviyo/report-summary.ts
 * Covers Story AK-4: Serialize Promise.all in report-summary
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock dependencies before importing the module under test
vi.mock("@/lib/services/credentials.service", () => ({
  getStoreCredentials: vi.fn().mockResolvedValue({
    klaviyo_private_key: "pk_test_key",
    klaviyo_api_key: null,
  }),
}))

vi.mock("./cached-metadata", () => ({
  getCachedAccountInfo: vi.fn().mockResolvedValue({
    timezone: "America/Sao_Paulo",
    currency: "BRL",
  }),
  getCachedPlacedOrderMetric: vi.fn().mockResolvedValue("metric_placed_order_123"),
}))

vi.mock("./account", () => ({
  getTimezoneOffset: vi.fn().mockReturnValue("-03:00"),
}))

vi.mock("@/lib/shared/data-status", () => ({
  isCachedPeriod: vi.fn().mockReturnValue(true),
  isCustomPeriod: vi.fn().mockReturnValue(false),
  buildCustomPeriodLabel: vi.fn().mockImplementation((s: string, e: string) => `custom:${s}:${e}`),
  isCustomRangeCacheFresh: vi.fn().mockReturnValue(false),
  getCustomRangeTTL: vi.fn().mockReturnValue(30 * 60_000),
  LIVE_FETCH_CACHE_TTL_MS: 5 * 60_000,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}))

// Track call order for klaviyoRequest
const callOrder: string[] = []

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client")
  return {
    ...actual,
    klaviyoRequest: vi.fn(),
    parseDateRangeInTimezone: vi.fn().mockReturnValue({
      startDateStr: "2026-01-01",
      endDateStr: "2026-01-31",
    }),
  }
})

const { mockLogWarn, mockLogInfo } = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogInfo: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: mockLogInfo,
      warn: mockLogWarn,
      error: vi.fn(),
    }),
  },
}))

import { getKlaviyoRevenueForStore, CACHE_FRESH_MS } from "./report-summary"
import { klaviyoRequest } from "./client"
import { createAdminClient } from "@/lib/supabase/server"
import { isCachedPeriod } from "@/lib/shared/data-status"

const mockKlaviyoRequest = vi.mocked(klaviyoRequest)
const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockIsCachedPeriod = vi.mocked(isCachedPeriod)

/**
 * Build a fake Supabase admin client whose chained query builder
 * (from → select → eq → eq → order → limit → single) resolves to `row`.
 */
function buildMockAdminClient(row: Record<string, unknown> | null) {
  // Chainable builder: every method returns `chain`, except `single` which resolves
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data: row, error: null })
  const fromFn = vi.fn().mockReturnValue(chain)
  return { from: fromFn } as unknown as ReturnType<typeof createAdminClient>
}

/**
 * Build a multi-table mock admin client that returns different data per table.
 * Supports both read chains and upsert calls. Tracks upsert payloads.
 */
function buildMultiTableMockClient(tableData: Record<string, Record<string, unknown> | null>) {
  const upsertCalls: Array<{ table: string; payload: unknown }> = []

  const fromFn = vi.fn().mockImplementation((table: string) => {
    const row = tableData[table] ?? null
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: row, error: null })
    chain.upsert = vi.fn().mockImplementation((payload: unknown) => {
      upsertCalls.push({ table, payload })
      return Promise.resolve({ data: null, error: null })
    })
    return chain
  })

  const client = { from: fromFn } as unknown as ReturnType<typeof createAdminClient>
  return { client, upsertCalls }
}

// Helper to build a report response
function makeReport(conversionValue: number) {
  return {
    data: {
      attributes: {
        results: [{ statistics: { conversion_value: conversionValue } }],
      },
    },
  }
}

describe("AK-4: Serialize report calls in report-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callOrder.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls campaign report BEFORE flow report (sequential, not parallel)", async () => {
    mockKlaviyoRequest.mockImplementation(async (_apiKey, endpoint) => {
      const name = String(endpoint).includes("campaign") ? "campaign" : "flow"
      callOrder.push(name)
      // Small delay to ensure ordering is observable
      await new Promise(r => setTimeout(r, 10))
      return makeReport(name === "campaign" ? 100 : 200)
    })

    await getKlaviyoRevenueForStore("store-1", "30d")

    // Campaign must be called first, flow second (sequential)
    expect(callOrder).toEqual(["campaign", "flow"])
  })

  it("still calls flow report when campaign report returns null", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce(null) // campaign = null
      .mockResolvedValueOnce(makeReport(500)) // flow = 500

    const result = await getKlaviyoRevenueForStore("store-1", "30d")

    expect(result.success).toBe(true)
    expect(result.data?.flowRevenue).toBe(500)
    expect(result.data?.campaignRevenue).toBe(0)
    expect(result.data?.campaignReportAvailable).toBe(false)
    expect(result.data?.flowReportAvailable).toBe(true)
  })

  it("returns failure when BOTH reports return null", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const result = await getKlaviyoRevenueForStore("store-1", "30d")

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
  })

  it("returns correct KlaviyoRevenueSummary with both reports", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce(makeReport(300)) // campaign
      .mockResolvedValueOnce(makeReport(700)) // flow

    const result = await getKlaviyoRevenueForStore("store-1", "30d")

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      totalRevenue: 1000,
      campaignRevenue: 300,
      flowRevenue: 700,
      storeRevenue: 0,
      currency: "BRL",
      campaignReportAvailable: true,
      flowReportAvailable: true,
    })
  })
})

describe("AK-3.2: Cache-first lookups in report-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsCachedPeriod.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns cached data without calling API when cache is fresh (< 1h)", async () => {
    const freshFetchedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 min ago
    const mockClient = buildMockAdminClient({
      klaviyo_campaign_revenue: 400,
      klaviyo_flow_revenue: 600,
      store_total_revenue: 5000,
      currency: "BRL",
      fetched_at: freshFetchedAt,
      sync_status: "ok",
    })
    mockCreateAdminClient.mockReturnValue(mockClient)

    const result = await getKlaviyoRevenueForStore("store-1", "30d")

    expect(result.success).toBe(true)
    expect(result.source).toBe("cache")
    expect(result.data).toEqual({
      totalRevenue: 1000,
      campaignRevenue: 400,
      flowRevenue: 600,
      storeRevenue: 5000,
      currency: "BRL",
    })
    // klaviyoRequest must NOT be called — data served from cache
    expect(mockKlaviyoRequest).not.toHaveBeenCalled()
  })

  it("falls through to live API when cache is stale (> 1h)", async () => {
    const staleFetchedAt = new Date(Date.now() - CACHE_FRESH_MS - 60_000).toISOString() // 1h + 1min ago
    const mockClient = buildMockAdminClient({
      klaviyo_campaign_revenue: 100,
      klaviyo_flow_revenue: 200,
      currency: "BRL",
      fetched_at: staleFetchedAt,
      sync_status: "ok",
    })
    mockCreateAdminClient.mockReturnValue(mockClient)

    mockKlaviyoRequest
      .mockResolvedValueOnce(makeReport(500)) // campaign
      .mockResolvedValueOnce(makeReport(800)) // flow

    const result = await getKlaviyoRevenueForStore("store-1", "30d")

    expect(result.success).toBe(true)
    expect(result.source).toBe("live")
    expect(result.data?.campaignRevenue).toBe(500)
    expect(result.data?.flowRevenue).toBe(800)
    // Must have called the API since cache was stale
    expect(mockKlaviyoRequest).toHaveBeenCalledTimes(2)
  })

  it("falls through to live API when cached row has sync_status 'error'", async () => {
    const freshFetchedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago (fresh)
    const mockClient = buildMockAdminClient({
      klaviyo_campaign_revenue: 0,
      klaviyo_flow_revenue: 0,
      currency: "BRL",
      fetched_at: freshFetchedAt,
      sync_status: "error",
    })
    mockCreateAdminClient.mockReturnValue(mockClient)

    mockKlaviyoRequest
      .mockResolvedValueOnce(makeReport(150)) // campaign
      .mockResolvedValueOnce(makeReport(350)) // flow

    const result = await getKlaviyoRevenueForStore("store-1", "30d")

    expect(result.success).toBe(true)
    expect(result.source).toBe("live")
    expect(result.data?.campaignRevenue).toBe(150)
    expect(result.data?.flowRevenue).toBe(350)
    // Must have called the API since error rows are skipped
    expect(mockKlaviyoRequest).toHaveBeenCalledTimes(2)
  })
})

describe("AK-13: Write-through cache for 1d period", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 1d is NOT a cached period (live-only)
    mockIsCachedPeriod.mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("persists live fetch result to DB with sync_source='live' for 1d", async () => {
    const { client, upsertCalls } = buildMultiTableMockClient({
      // 1d cache check: no cached row
      store_revenue_summary: null,
      // org_id lookup for write-through
      client_stores: { org_id: "org-123" },
    })
    mockCreateAdminClient.mockReturnValue(client)

    mockKlaviyoRequest
      .mockResolvedValueOnce(makeReport(200)) // campaign
      .mockResolvedValueOnce(makeReport(300)) // flow

    const result = await getKlaviyoRevenueForStore("store-1", "1d")

    expect(result.success).toBe(true)
    expect(result.source).toBe("live")
    expect(result.data?.campaignRevenue).toBe(200)
    expect(result.data?.flowRevenue).toBe(300)

    // Verify write-through upsert was called
    const summaryUpserts = upsertCalls.filter(c => c.table === "store_revenue_summary")
    expect(summaryUpserts).toHaveLength(1)

    const payload = summaryUpserts[0].payload as Record<string, unknown>
    expect(payload.period_label).toBe("1d")
    expect(payload.sync_source).toBe("live")
    expect(payload.klaviyo_campaign_revenue).toBe(200)
    expect(payload.klaviyo_flow_revenue).toBe(300)
    expect(payload.klaviyo_total_revenue).toBe(500)
    expect(payload.sync_status).toBe("ok")
    expect(payload.org_id).toBe("org-123")
  })

  it("returns cache hit when 1d cache is fresh (< 5 min)", async () => {
    const freshFetchedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString() // 2 min ago
    const { client } = buildMultiTableMockClient({
      store_revenue_summary: {
        klaviyo_campaign_revenue: 150,
        klaviyo_flow_revenue: 250,
        currency: "BRL",
        fetched_at: freshFetchedAt,
        sync_status: "ok",
      },
    })
    mockCreateAdminClient.mockReturnValue(client)

    const result = await getKlaviyoRevenueForStore("store-1", "1d")

    expect(result.success).toBe(true)
    expect(result.source).toBe("cache")
    expect(result.data).toEqual({
      totalRevenue: 400,
      campaignRevenue: 150,
      flowRevenue: 250,
      storeRevenue: 0,
      currency: "BRL",
    })
    // Must NOT call Klaviyo API
    expect(mockKlaviyoRequest).not.toHaveBeenCalled()
  })

  it("does live fetch when 1d cache is stale (> 5 min)", async () => {
    const staleFetchedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString() // 6 min ago
    const { client } = buildMultiTableMockClient({
      store_revenue_summary: {
        klaviyo_campaign_revenue: 100,
        klaviyo_flow_revenue: 200,
        currency: "BRL",
        fetched_at: staleFetchedAt,
        sync_status: "ok",
      },
      client_stores: { org_id: "org-123" },
    })
    mockCreateAdminClient.mockReturnValue(client)

    mockKlaviyoRequest
      .mockResolvedValueOnce(makeReport(400)) // campaign
      .mockResolvedValueOnce(makeReport(600)) // flow

    const result = await getKlaviyoRevenueForStore("store-1", "1d")

    expect(result.success).toBe(true)
    expect(result.source).toBe("live")
    expect(result.data?.campaignRevenue).toBe(400)
    expect(result.data?.flowRevenue).toBe(600)
    // Must have called the API since cache was stale
    expect(mockKlaviyoRequest).toHaveBeenCalledTimes(2)
  })

  it("does NOT affect cached periods — 30d still uses isCachedPeriod path", async () => {
    // For this test, 30d IS a cached period
    mockIsCachedPeriod.mockReturnValue(true)

    const freshFetchedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const mockClient = buildMockAdminClient({
      klaviyo_campaign_revenue: 500,
      klaviyo_flow_revenue: 500,
      currency: "BRL",
      fetched_at: freshFetchedAt,
      sync_status: "ok",
    })
    mockCreateAdminClient.mockReturnValue(mockClient)

    const result = await getKlaviyoRevenueForStore("store-1", "30d")

    expect(result.success).toBe(true)
    expect(result.source).toBe("cache")
    // 1d write-through path must NOT be triggered for cached periods
    expect(mockKlaviyoRequest).not.toHaveBeenCalled()
  })
})
