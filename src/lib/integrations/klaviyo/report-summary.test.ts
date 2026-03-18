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

import { getKlaviyoRevenueForStore } from "./report-summary"
import { klaviyoRequest } from "./client"

const mockKlaviyoRequest = vi.mocked(klaviyoRequest)

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
      currency: "BRL",
      campaignReportAvailable: true,
      flowReportAvailable: true,
    })
  })
})
