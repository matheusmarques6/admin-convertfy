import { describe, it, expect, vi, beforeEach } from "vitest"
import { upsertSyncResults, savePerfDataToCache } from "./sync-persistence.service"
import type { KlaviyoSyncData } from "./klaviyo-sync.service"
import type { KlaviyoPerformanceData } from "./klaviyo-performance.service"

// ── Mock Supabase client ────────────────────────────────────────────────────

function createMockSupabase() {
  const upsertFn = vi.fn().mockResolvedValue({ error: null })
  const fromFn = vi.fn().mockReturnValue({ upsert: upsertFn })

  return {
    client: { from: fromFn } as unknown as Parameters<typeof upsertSyncResults>[0],
    from: fromFn,
    upsert: upsertFn,
  }
}

// ── Test Data ────────────────────────────────────────────────────────────────

const STORE = { id: "store-1", org_id: "org-1" }

const SYNC_DATA: KlaviyoSyncData = {
  campaignRevenue: 5000,
  flowRevenue: 3000,
  storeRevenue: 12000,
  storeOrders: 150,
  startDateStr: "2026-01-01T00:00:00.000Z",
  endDateStr: "2026-01-31T23:59:59.999Z",
  flowRows: [
    {
      store_id: "store-1",
      flow_id: "flow-1",
      flow_name: "Welcome",
      flow_status: "live",
      trigger_type: "trigger",
      period_start: "2026-01-01T00:00:00.000Z",
      period_end: "2026-01-31T23:59:59.999Z",
      recipients: 1000,
      delivered: 950,
      delivery_rate: 95,
      opened: 400,
      open_rate: 42.1,
      clicked: 100,
      click_rate: 10.5,
      click_to_open_rate: 25,
      conversions: 30,
      conversion_rate: 3.16,
      conversion_value: 3000,
      revenue_per_recipient: 3.0,
      average_order_value: 100,
      bounced: 50,
      bounce_rate: 5,
      unsubscribed: 10,
      unsubscribe_rate: 1.05,
      fetched_at: "2026-01-15T12:00:00.000Z",
    },
  ],
  campRows: [
    {
      store_id: "store-1",
      campaign_id: "camp-1",
      campaign_name: "Black Friday",
      campaign_status: "sent",
      send_time: "2026-01-10T10:00:00.000Z",
      subject: "Sale!",
      channel: "email",
      period_start: "2026-01-01T00:00:00.000Z",
      period_end: "2026-01-31T23:59:59.999Z",
      recipients: 5000,
      delivered: 4800,
      delivery_rate: 96,
      opened: 2000,
      open_rate: 41.67,
      clicked: 500,
      click_rate: 10.42,
      click_to_open_rate: 25,
      conversions: 100,
      conversion_rate: 2.08,
      conversion_value: 5000,
      revenue_per_recipient: 1.0,
      average_order_value: 50,
      bounced: 200,
      bounce_rate: 4,
      unsubscribed: 50,
      unsubscribe_rate: 1.04,
      spam_complaints: 5,
      fetched_at: "2026-01-15T12:00:00.000Z",
    },
  ],
}

const AUDIENCE = { totalLeads: 10000, engagedLeads: 3000, engagementRate: 30 }

// ── Tests ────────────────────────────────────────────────────────────────────

describe("upsertSyncResults", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("should upsert flow metrics when flowRows exist", async () => {
    const { client, from, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    expect(from).toHaveBeenCalledWith("klaviyo_flow_metrics")
    expect(upsert).toHaveBeenCalledWith(
      SYNC_DATA.flowRows,
      { onConflict: "store_id,flow_id,period_start,period_end" },
    )
  })

  it("should upsert campaign metrics when campRows exist", async () => {
    const { client, from, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    expect(from).toHaveBeenCalledWith("klaviyo_campaign_metrics")
    expect(upsert).toHaveBeenCalledWith(
      SYNC_DATA.campRows,
      { onConflict: "store_id,campaign_id,period_start,period_end" },
    )
  })

  it("should skip flow upsert when flowRows is empty", async () => {
    const { client, from, upsert } = createMockSupabase()
    const dataNoFlows = { ...SYNC_DATA, flowRows: [] }

    await upsertSyncResults(client, STORE, dataNoFlows, "30d")

    const flowCall = from.mock.calls.find(
      (c: string[]) => c[0] === "klaviyo_flow_metrics"
    )
    expect(flowCall).toBeUndefined()
  })

  it("should skip campaign upsert when campRows is empty", async () => {
    const { client, from, upsert } = createMockSupabase()
    const dataNoFlows = { ...SYNC_DATA, campRows: [] }

    await upsertSyncResults(client, STORE, dataNoFlows, "30d")

    const campCall = from.mock.calls.find(
      (c: string[]) => c[0] === "klaviyo_campaign_metrics"
    )
    expect(campCall).toBeUndefined()
  })

  it("should upsert revenue summary with correct calculated fields", async () => {
    const { client, from, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    expect(from).toHaveBeenCalledWith("store_revenue_summary")

    // Find the revenue summary upsert call
    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    expect(summaryCallIndex).toBeGreaterThanOrEqual(0)

    // The upsert is called on the return value of from()
    const upsertCall = upsert.mock.calls[summaryCallIndex]
    const row = upsertCall[0]

    expect(row.store_id).toBe("store-1")
    expect(row.org_id).toBe("org-1")
    expect(row.period_label).toBe("30d")
    expect(row.klaviyo_total_revenue).toBe(8000) // 5000 + 3000
    expect(row.klaviyo_campaign_revenue).toBe(5000)
    expect(row.klaviyo_flow_revenue).toBe(3000)
    expect(row.store_total_revenue).toBe(12000)
    expect(row.store_orders).toBe(150)
    expect(row.sync_status).toBe("ok")
    expect(row.sync_error).toBeNull()
    expect(row.expires_at).toBeDefined()
    expect(row.fetched_at).toBeDefined()
  })

  it("should include audience fields when audience param is provided", async () => {
    const { client, from, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d", AUDIENCE)

    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsert.mock.calls[summaryCallIndex][0]

    expect(row.total_leads).toBe(10000)
    expect(row.engaged_leads).toBe(3000)
    expect(row.engagement_rate).toBe(30)
  })

  it("should NOT include audience fields when audience param is omitted", async () => {
    const { client, from, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsert.mock.calls[summaryCallIndex][0]

    expect(row.total_leads).toBeUndefined()
    expect(row.engaged_leads).toBeUndefined()
    expect(row.engagement_rate).toBeUndefined()
  })

  it("should handle null org_id gracefully", async () => {
    const { client, from, upsert } = createMockSupabase()
    const storeNoOrg = { id: "store-1", org_id: null }

    await upsertSyncResults(client, storeNoOrg, SYNC_DATA, "30d")

    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsert.mock.calls[summaryCallIndex][0]

    expect(row.org_id).toBeNull()
  })

  it("should coerce undefined org_id to null (store.org_id || null)", async () => {
    const { client, from, upsert } = createMockSupabase()
    const storeUndefinedOrg = { id: "store-1" } // org_id is undefined

    await upsertSyncResults(client, storeUndefinedOrg, SYNC_DATA, "30d")

    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsert.mock.calls[summaryCallIndex][0]

    expect(row.org_id).toBeNull()
  })

  it("should set expires_at to ~6 hours from now", async () => {
    const { client, from, upsert } = createMockSupabase()
    const before = Date.now()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    const after = Date.now()
    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsert.mock.calls[summaryCallIndex][0]

    const expiresAt = new Date(row.expires_at).getTime()
    const sixHoursMs = 6 * 60 * 60 * 1000

    // expires_at should be ~6 hours from now (within 2 seconds tolerance)
    expect(expiresAt).toBeGreaterThanOrEqual(before + sixHoursMs - 2000)
    expect(expiresAt).toBeLessThanOrEqual(after + sixHoursMs + 2000)
  })
})

describe("savePerfDataToCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const PERF_DATA: KlaviyoPerformanceData = {
    storeRevenue: 12000,
    storeOrders: 150,
    attributedRevenue: 8000,
    campaignRevenue: 5000,
    flowRevenue: 3000,
    recoveryRate: 66.67,
    sentCampaigns: 10,
    totalFlows: 5,
    liveFlows: 4,
    totalDelivered: 50000,
    totalOpens: 20000,
    totalClicks: 5000,
    avgOpenRate: 40,
    avgClickRate: 10,
    bounceRate: 3,
    unsubscribeRate: 1,
    totalLeads: 10000,
    engagedLeads: 3000,
    engagementRate: 30,
    recentCampaigns: [
      {
        campaignId: "camp-1",
        name: "Black Friday",
        sendTime: "2026-01-10T10:00:00.000Z",
        recipients: 5000,
        delivered: 4800,
        openRate: 41.67,
        clickRate: 10.42,
        revenue: 5000,
      },
    ],
    topFlows: [
      {
        flowId: "flow-1",
        name: "Welcome",
        status: "live",
        delivered: 950,
        openRate: 42.1,
        clickRate: 10.5,
        revenue: 3000,
      },
    ],
  } as unknown as KlaviyoPerformanceData

  it("should save cache for cached periods (30d)", async () => {
    const { client, from, upsert } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    expect(from).toHaveBeenCalledWith("store_revenue_summary")
    expect(upsert).toHaveBeenCalled()
  })

  it("should NOT save cache for non-cached periods (1d)", async () => {
    const { client, from } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "1d", PERF_DATA, "2026-03-02", "2026-03-03")

    expect(from).not.toHaveBeenCalled()
  })

  it("should NOT save cache for custom period", async () => {
    const { client, from } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "custom", PERF_DATA, "2026-01-01", "2026-02-15")

    expect(from).not.toHaveBeenCalled()
  })

  it("should save campaign detail rows when recentCampaigns exist", async () => {
    const { client, from } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    expect(from).toHaveBeenCalledWith("klaviyo_campaign_metrics")
  })

  it("should save flow detail rows when topFlows exist", async () => {
    const { client, from } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    expect(from).toHaveBeenCalledWith("klaviyo_flow_metrics")
  })

  it("should not throw on supabase error (non-fatal)", async () => {
    const upsertFn = vi.fn().mockRejectedValue(new Error("DB Error"))
    const fromFn = vi.fn().mockReturnValue({ upsert: upsertFn })
    const client = { from: fromFn } as unknown as Parameters<typeof savePerfDataToCache>[0]

    // Should not throw
    await expect(
      savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")
    ).resolves.toBeUndefined()
  })

  it("should use attributedRevenue for klaviyo_total_revenue", async () => {
    const { client, from, upsert } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsert.mock.calls[summaryCallIndex][0]

    expect(row.klaviyo_total_revenue).toBe(8000) // attributedRevenue
    expect(row.klaviyo_campaign_revenue).toBe(5000)
    expect(row.klaviyo_flow_revenue).toBe(3000)
  })

  it("should skip campaign upsert when recentCampaigns is empty", async () => {
    const { client, from } = createMockSupabase()
    const dataNocamp = {
      ...PERF_DATA,
      recentCampaigns: [],
    } as unknown as KlaviyoPerformanceData

    await savePerfDataToCache(client, "store-1", "org-1", "30d", dataNocamp, "2026-01-01", "2026-01-31")

    const campCall = from.mock.calls.find(
      (c: string[]) => c[0] === "klaviyo_campaign_metrics"
    )
    expect(campCall).toBeUndefined()
  })

  it("should skip flow upsert when topFlows is empty", async () => {
    const { client, from } = createMockSupabase()
    const dataNoFlows = {
      ...PERF_DATA,
      topFlows: [],
    } as unknown as KlaviyoPerformanceData

    await savePerfDataToCache(client, "store-1", "org-1", "30d", dataNoFlows, "2026-01-01", "2026-01-31")

    const flowCall = from.mock.calls.find(
      (c: string[]) => c[0] === "klaviyo_flow_metrics"
    )
    expect(flowCall).toBeUndefined()
  })

  it("should set correct expires_at and ISO dates", async () => {
    const { client, from, upsert } = createMockSupabase()
    const before = Date.now()

    await savePerfDataToCache(client, "store-1", "org-1", "7d", PERF_DATA, "2026-02-24", "2026-03-03")

    const after = Date.now()
    const summaryCallIndex = from.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsert.mock.calls[summaryCallIndex][0]

    // Validate period ISO dates
    expect(row.period_start).toBe(new Date("2026-02-24T00:00:00Z").toISOString())
    expect(row.period_end).toBe(new Date("2026-03-03T23:59:59.999Z").toISOString())

    // Validate expires_at ~6 hours
    const expiresAt = new Date(row.expires_at).getTime()
    const sixHoursMs = 6 * 60 * 60 * 1000
    expect(expiresAt).toBeGreaterThanOrEqual(before + sixHoursMs - 2000)
    expect(expiresAt).toBeLessThanOrEqual(after + sixHoursMs + 2000)
  })
})
