import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock klaviyoRequest before importing the module ──────────────────────────
const mockKlaviyoRequest = vi.fn()
const mockSleep = vi.fn()

vi.mock("@/lib/integrations/klaviyo", () => ({
  klaviyoRequest: (...args: unknown[]) => mockKlaviyoRequest(...args),
  parseDateRangeInTimezone: vi.fn().mockReturnValue({
    startDateStr: "2026-02-01",
    endDateStr: "2026-03-03",
  }),
  KLAVIYO_API_URL: "https://a.klaviyo.com/api",
  sleep: (...args: unknown[]) => mockSleep(...args),
  MIN_REQUEST_INTERVAL: 0,
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

import {
  fetchFlowNames,
  fetchCampaignNames,
  fetchAudienceForStore,
  fetchStoreRevenueFromMetricAggregates,
  syncKlaviyoForPeriod,
} from "./klaviyo-sync.service"

describe("fetchFlowNames", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return a map of flow id → name info", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [
        { id: "f1", attributes: { name: "Welcome", status: "live", trigger_type: "trigger" } },
        { id: "f2", attributes: { name: "Abandoned Cart", status: "live", trigger_type: "trigger" } },
      ],
      links: {},
    })

    const result = await fetchFlowNames("test-key")

    expect(result.size).toBe(2)
    expect(result.get("f1")).toEqual({ name: "Welcome", status: "live", trigger_type: "trigger" })
    expect(result.get("f2")).toEqual({ name: "Abandoned Cart", status: "live", trigger_type: "trigger" })
  })

  it("should handle pagination via links.next", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce({
        data: [{ id: "f1", attributes: { name: "Flow 1", status: "live", trigger_type: "trigger" } }],
        links: { next: "https://a.klaviyo.com/api/flows/?page[cursor]=abc" },
      })
      .mockResolvedValueOnce({
        data: [{ id: "f2", attributes: { name: "Flow 2", status: "draft", trigger_type: "trigger" } }],
        links: {},
      })

    const result = await fetchFlowNames("test-key")

    expect(result.size).toBe(2)
    expect(mockKlaviyoRequest).toHaveBeenCalledTimes(2)
  })

  it("should return empty map when API returns null", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce(null)

    const result = await fetchFlowNames("test-key")

    expect(result.size).toBe(0)
  })
})

describe("fetchCampaignNames", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should fetch email and sms campaigns", async () => {
    // Email campaigns
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "c1", attributes: { name: "Newsletter", status: "sent", send_time: "2026-01-15T10:00:00Z", channel: "email", send_options: { subject: "Subject" } } }],
      links: {},
    })
    // SMS campaigns
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "c2", attributes: { name: "SMS Promo", status: "sent", send_time: null, channel: "sms" } }],
      links: {},
    })

    const result = await fetchCampaignNames("test-key")

    expect(result.size).toBe(2)
    expect(result.get("c1")?.channel).toBe("email")
    expect(result.get("c2")?.channel).toBe("sms")
  })

  it("should return empty map when both channels return null", async () => {
    mockKlaviyoRequest.mockResolvedValue(null)

    const result = await fetchCampaignNames("test-key")

    expect(result.size).toBe(0)
  })

  it("should extract subject from message.subject when send_options.subject is absent", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "c1", attributes: { name: "Test", status: "sent", send_time: null, channel: "email", message: { subject: "Fallback Subject" } } }],
      links: {},
    })
    mockKlaviyoRequest.mockResolvedValueOnce({ data: [], links: {} })

    const result = await fetchCampaignNames("test-key")

    expect(result.get("c1")?.subject).toBe("Fallback Subject")
  })

  it("should use channel filter param as fallback when attributes.channel is missing", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "c1", attributes: { name: "Test", status: "sent", send_time: null } }],
      links: {},
    })
    mockKlaviyoRequest.mockResolvedValueOnce({ data: [], links: {} })

    const result = await fetchCampaignNames("test-key")

    // The loop iterates "email" first, so channel defaults to "email"
    expect(result.get("c1")?.channel).toBe("email")
  })
})

describe("fetchAudienceForStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return audience data from lists and segments", async () => {
    // Lists
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [
        { id: "l1", attributes: { profile_count: 10000 } },
        { id: "l2", attributes: { profile_count: 500 } },
      ],
      links: {},
    })
    // Segments
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [
        { id: "seg1", attributes: { name: "Engaged 90d", profile_count: 3000 } },
        { id: "seg2", attributes: { name: "VIPs", profile_count: 200 } },
      ],
      links: {},
    })

    const result = await fetchAudienceForStore("test-key")

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.totalLeads).toBe(10000) // largest list
    expect(result.data!.engagedLeads).toBe(3000) // Engaged 90d segment
    expect(result.data!.engagementRate).toBe(30)
  })

  it("should handle lists with zero profile_count (API quirk)", async () => {
    // Lists - collection returns 0 count
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "l1", attributes: { profile_count: 0 } }],
      links: {},
    })
    // Individual list fetch returns real count
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: { attributes: { profile_count: 5000 } },
    })
    // Segments
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "seg1", attributes: { name: "Engaged 90d", profile_count: 1500 } }],
      links: {},
    })

    const result = await fetchAudienceForStore("test-key")

    expect(result.success).toBe(true)
    expect(result.data!.totalLeads).toBe(5000)
    expect(result.data!.engagedLeads).toBe(1500)
  })

  it("should find engaged segment by Portuguese name", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "l1", attributes: { profile_count: 8000 } }],
      links: {},
    })
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [
        { id: "seg1", attributes: { name: "Engajados 90 dias", profile_count: 2000 } },
      ],
      links: {},
    })

    const result = await fetchAudienceForStore("test-key")

    expect(result.success).toBe(true)
    expect(result.data!.engagedLeads).toBe(2000)
  })

  it("should return failure on API error", async () => {
    mockKlaviyoRequest.mockRejectedValueOnce(new Error("Rate limited"))

    const result = await fetchAudienceForStore("test-key")

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
    expect(result.error).toContain("Rate limited")
  })

  it("should individually fetch engaged segment when profile_count is 0", async () => {
    // Lists with real count
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "l1", attributes: { profile_count: 8000 } }],
      links: {},
    })
    // Segments with 0 count on engaged segment
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "seg1", attributes: { name: "Engaged 90d", profile_count: 0 } }],
      links: {},
    })
    // Individual segment fetch returns real count
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: { attributes: { profile_count: 2500 } },
    })

    const result = await fetchAudienceForStore("test-key")

    expect(result.success).toBe(true)
    expect(result.data!.engagedLeads).toBe(2500)
    // Verify the individual fetch was made with correct URL pattern
    expect(mockKlaviyoRequest).toHaveBeenCalledTimes(3)
  })

  it("should handle no engaged segment found (0 engaged leads)", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "l1", attributes: { profile_count: 5000 } }],
      links: {},
    })
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: [{ id: "seg1", attributes: { name: "VIPs", profile_count: 200 } }],
      links: {},
    })

    const result = await fetchAudienceForStore("test-key")

    expect(result.success).toBe(true)
    expect(result.data!.engagedLeads).toBe(0)
    expect(result.data!.engagementRate).toBe(0)
  })
})

describe("fetchStoreRevenueFromMetricAggregates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return total revenue and order count from metric aggregates", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: {
        attributes: {
          dates: [
            "2026-02-01T00:00:00+00:00",
            "2026-02-02T00:00:00+00:00",
          ],
          data: [{
            measurements: {
              sum_value: [5000, 3000],
              count: [50, 30],
            },
          }],
        },
      },
    })

    const result = await fetchStoreRevenueFromMetricAggregates(
      "test-key", "metric-123", "2026-02-01", "2026-02-28", "America/Sao_Paulo"
    )

    expect(result.success).toBe(true)
    expect(result.data!.storeRevenue).toBe(8000)
    expect(result.data!.storeOrders).toBe(80)
  })

  it("should skip buckets before the start date (Klaviyo extra bucket bug)", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: {
        attributes: {
          dates: [
            "2026-01-31T00:00:00+00:00", // before start date — should be skipped
            "2026-02-01T00:00:00+00:00",
          ],
          data: [{
            measurements: {
              sum_value: [999, 5000],
              count: [10, 50],
            },
          }],
        },
      },
    })

    const result = await fetchStoreRevenueFromMetricAggregates(
      "test-key", "metric-123", "2026-02-01", "2026-02-28", "America/Sao_Paulo"
    )

    expect(result.success).toBe(true)
    expect(result.data!.storeRevenue).toBe(5000) // 999 skipped
    expect(result.data!.storeOrders).toBe(50)
  })

  it("should return failure when API returns null", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce(null)

    const result = await fetchStoreRevenueFromMetricAggregates(
      "test-key", "metric-123", "2026-02-01", "2026-02-28", "America/Sao_Paulo"
    )

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
    expect(result.error).toContain("null")
  })

  it("should return failure on exception", async () => {
    mockKlaviyoRequest.mockRejectedValueOnce(new Error("Network error"))

    const result = await fetchStoreRevenueFromMetricAggregates(
      "test-key", "metric-123", "2026-02-01", "2026-02-28", "America/Sao_Paulo"
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain("Network error")
  })

  it("should handle non-array measurements (scalar values)", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: {
        attributes: {
          dates: ["2026-02-01T00:00:00+00:00"],
          data: [{
            measurements: {
              sum_value: 7500,  // scalar, not array
              count: 75,
            },
          }],
        },
      },
    })

    const result = await fetchStoreRevenueFromMetricAggregates(
      "test-key", "metric-123", "2026-02-01", "2026-02-28", "America/Sao_Paulo"
    )

    expect(result.success).toBe(true)
    expect(result.data!.storeRevenue).toBe(7500)
    expect(result.data!.storeOrders).toBe(75)
  })

  it("should handle empty data array gracefully", async () => {
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: {
        attributes: {
          dates: [],
          data: [],
        },
      },
    })

    const result = await fetchStoreRevenueFromMetricAggregates(
      "test-key", "metric-123", "2026-02-01", "2026-02-28", "America/Sao_Paulo"
    )

    expect(result.success).toBe(true)
    expect(result.data!.storeRevenue).toBe(0)
    expect(result.data!.storeOrders).toBe(0)
  })
})

describe("syncKlaviyoForPeriod", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const BASE_PARAMS = {
    storeId: "store-1",
    orgId: "org-1",
    apiKey: "test-key",
    timezone: "America/Sao_Paulo",
    timezoneOffset: "-03:00",
    metricId: "metric-123",
    period: "30d",
    flowNames: new Map([["f1", { name: "Welcome", status: "live", trigger_type: "trigger" }]]),
    campNames: new Map([["c1", { name: "Newsletter", status: "sent", send_time: "2026-02-15T10:00:00Z", channel: "email", subject: "Welcome!" }]]),
  }

  it("should aggregate flow + campaign + metric data into KlaviyoSyncData", async () => {
    // Flow report
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: {
        attributes: {
          results: [{
            groupings: { flow_id: "f1", send_channel: "email", flow_message_id: "m1" },
            statistics: {
              recipients: 1000, delivered: 950, opens: 400, clicks: 100,
              conversions: 30, conversion_value: 3000, bounced: 50, unsubscribes: 10,
            },
          }],
        },
      },
    })
    // Campaign report
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: {
        attributes: {
          results: [{
            groupings: { campaign_id: "c1", send_channel: "email" },
            statistics: {
              recipients: 5000, delivered: 4800, opens: 2000, clicks: 500,
              conversions: 100, conversion_value: 5000, bounced: 200, unsubscribes: 50, spam_complaints: 5,
            },
          }],
        },
      },
    })
    // Metric aggregates
    mockKlaviyoRequest.mockResolvedValueOnce({
      data: {
        attributes: {
          dates: ["2026-02-01T00:00:00+00:00"],
          data: [{ measurements: { sum_value: [12000], count: [150] } }],
        },
      },
    })

    const result = await syncKlaviyoForPeriod(BASE_PARAMS)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    const data = result.data!
    expect(data.flowRevenue).toBe(3000)
    expect(data.campaignRevenue).toBe(5000)
    expect(data.storeRevenue).toBe(12000)
    expect(data.storeOrders).toBe(150)
    expect(data.flowRows).toHaveLength(1)
    expect(data.campRows).toHaveLength(1)
  })

  it("should recalculate rates from aggregated counts (not use raw API rates)", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce({
        data: {
          attributes: {
            results: [{
              groupings: { flow_id: "f1", send_channel: "email", flow_message_id: "m1" },
              statistics: { recipients: 1000, delivered: 800, opens: 320, clicks: 80, conversions: 20, conversion_value: 2000, bounced: 200, unsubscribes: 8 },
            }],
          },
        },
      })
      .mockResolvedValueOnce({ data: { attributes: { results: [] } } })
      .mockResolvedValueOnce({
        data: { attributes: { dates: ["2026-02-01T00:00:00+00:00"], data: [{ measurements: { sum_value: [2000], count: [20] } }] } },
      })

    const result = await syncKlaviyoForPeriod(BASE_PARAMS)
    const flow = result.data!.flowRows[0]

    expect(flow.open_rate).toBe((320 / 800) * 100) // 40%
    expect(flow.click_rate).toBe((80 / 800) * 100) // 10%
    expect(flow.click_to_open_rate).toBe((80 / 320) * 100) // 25%
    expect(flow.delivery_rate).toBe((800 / 1000) * 100) // 80%
    expect(flow.bounce_rate).toBe((200 / 1000) * 100) // 20%
    expect(flow.conversion_rate).toBe((20 / 800) * 100) // 2.5%
    expect(flow.revenue_per_recipient).toBe(2000 / 1000) // 2.0
    expect(flow.average_order_value).toBe(2000 / 20) // 100
  })

  it("should filter out non-sent campaigns", async () => {
    const paramsWithDraft = {
      ...BASE_PARAMS,
      campNames: new Map([
        ["c1", { name: "Draft Campaign", status: "draft", send_time: null, channel: "email", subject: null }],
      ]),
    }

    mockKlaviyoRequest
      .mockResolvedValueOnce({ data: { attributes: { results: [] } } })
      .mockResolvedValueOnce({
        data: {
          attributes: {
            results: [{
              groupings: { campaign_id: "c1", send_channel: "email" },
              statistics: { recipients: 100, delivered: 90, opens: 30, clicks: 10, conversions: 5, conversion_value: 500, bounced: 10, unsubscribes: 2, spam_complaints: 0 },
            }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { attributes: { dates: [], data: [] } },
      })

    const result = await syncKlaviyoForPeriod(paramsWithDraft)

    expect(result.data!.campRows).toHaveLength(0)
    expect(result.data!.campaignRevenue).toBe(0)
  })

  it("should aggregate multiple messages for the same flow", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce({
        data: {
          attributes: {
            results: [
              {
                groupings: { flow_id: "f1", send_channel: "email", flow_message_id: "m1" },
                statistics: { recipients: 500, delivered: 480, opens: 200, clicks: 50, conversions: 10, conversion_value: 1000, bounced: 20, unsubscribes: 5 },
              },
              {
                groupings: { flow_id: "f1", send_channel: "email", flow_message_id: "m2" },
                statistics: { recipients: 300, delivered: 290, opens: 100, clicks: 30, conversions: 5, conversion_value: 500, bounced: 10, unsubscribes: 3 },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ data: { attributes: { results: [] } } })
      .mockResolvedValueOnce({
        data: { attributes: { dates: [], data: [] } },
      })

    const result = await syncKlaviyoForPeriod(BASE_PARAMS)

    expect(result.data!.flowRows).toHaveLength(1) // Aggregated into 1 row
    const flow = result.data!.flowRows[0]
    expect(flow.recipients).toBe(800) // 500 + 300
    expect(flow.delivered).toBe(770) // 480 + 290
    expect(flow.conversion_value).toBe(1500) // 1000 + 500
  })

  it("should handle null API responses gracefully", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce(null) // flow report null
      .mockResolvedValueOnce(null) // campaign report null
      .mockResolvedValueOnce(null) // metric aggregates null

    const result = await syncKlaviyoForPeriod(BASE_PARAMS)

    expect(result.success).toBe(true)
    expect(result.data!.flowRows).toHaveLength(0)
    expect(result.data!.campRows).toHaveLength(0)
    expect(result.data!.flowRevenue).toBe(0)
    expect(result.data!.campaignRevenue).toBe(0)
    expect(result.data!.storeRevenue).toBe(0)
  })

  it("should return failure on exception", async () => {
    mockKlaviyoRequest.mockRejectedValueOnce(new Error("API timeout"))

    const result = await syncKlaviyoForPeriod(BASE_PARAMS)

    expect(result.success).toBe(false)
    expect(result.data).toBeNull()
    expect(result.error).toContain("API timeout")
  })

  it("should handle zero denominators in rate calculations (no division by zero)", async () => {
    mockKlaviyoRequest
      .mockResolvedValueOnce({
        data: {
          attributes: {
            results: [{
              groupings: { flow_id: "f1", send_channel: "email", flow_message_id: "m1" },
              statistics: { recipients: 0, delivered: 0, opens: 0, clicks: 0, conversions: 0, conversion_value: 0, bounced: 0, unsubscribes: 0 },
            }],
          },
        },
      })
      .mockResolvedValueOnce({ data: { attributes: { results: [] } } })
      .mockResolvedValueOnce({ data: { attributes: { dates: [], data: [] } } })

    const result = await syncKlaviyoForPeriod(BASE_PARAMS)
    const flow = result.data!.flowRows[0]

    expect(flow.open_rate).toBe(0)
    expect(flow.click_rate).toBe(0)
    expect(flow.delivery_rate).toBe(0)
    expect(flow.bounce_rate).toBe(0)
    expect(flow.conversion_rate).toBe(0)
    expect(flow.revenue_per_recipient).toBe(0)
    expect(flow.average_order_value).toBe(0)
    // Should not be NaN or Infinity
    expect(Number.isFinite(flow.open_rate)).toBe(true)
    expect(Number.isFinite(flow.click_rate)).toBe(true)
  })
})
