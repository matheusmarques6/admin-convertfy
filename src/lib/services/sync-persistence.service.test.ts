import { describe, it, expect, vi, beforeEach } from "vitest"
import { upsertSyncResults, savePerfDataToCache } from "./sync-persistence.service"
import type { KlaviyoSyncData } from "./klaviyo-sync.service"
import type { KlaviyoPerformanceData } from "./klaviyo-performance.service"

// ── Mock Supabase client ────────────────────────────────────────────────────

function createMockSupabase() {
  const upsertFn = vi.fn().mockResolvedValue({ error: null })
  const deleteFn = vi.fn()
  const deleteLtFn = vi.fn().mockResolvedValue({ error: null })
  const deleteEqFn = vi.fn()
  const singleFn = vi.fn().mockResolvedValue({ data: { client_id: "client-1" }, error: null })
  const eqFn = vi.fn().mockReturnValue({ single: singleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })

  // delete().eq().eq().lt() chain — supports both cleanup (.lt) and audiences (.eq only)
  deleteEqFn.mockReturnValue({ eq: deleteEqFn, lt: deleteLtFn })
  deleteFn.mockReturnValue({ eq: deleteEqFn })

  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === "client_stores") {
      return { select: selectFn }
    }
    return { upsert: upsertFn, delete: deleteFn }
  })

  return {
    client: { from: fromFn } as unknown as Parameters<typeof upsertSyncResults>[0],
    from: fromFn,
    upsert: upsertFn,
    delete: deleteFn,
    deleteLt: deleteLtFn,
    select: selectFn,
    eq: eqFn,
    single: singleFn,
  }
}

// ── Test Data ────────────────────────────────────────────────────────────────

const STORE = { id: "store-1", org_id: "org-1" }

const SYNC_DATA: KlaviyoSyncData = {
  campaignRevenue: 5000,
  flowRevenue: 3000,
  campaignDataAvailable: true,
  flowDataAvailable: true,
  storeRevenue: 12000,
  storeOrders: 150,
  currency: "BRL",
  startDateStr: "2026-01-01T00:00:00.000Z",
  endDateStr: "2026-01-31T23:59:59.999Z",
  flowRows: [
    {
      store_id: "store-1",
      org_id: "org-1",
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
      org_id: "org-1",
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find the summary upsert call by payload shape (has sync_status) */
function findSummaryUpsert(upsertFn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = upsertFn.mock.calls.find(
    (c: unknown[]) => {
      const payload = c[0] as Record<string, unknown>
      return payload?.sync_status !== undefined
    }
  )
  if (!call) throw new Error("Summary upsert call not found")
  return call[0] as Record<string, unknown>
}

/** Find upsert call for a specific table by checking array payload content */
function findTableUpsert(upsertFn: ReturnType<typeof vi.fn>, key: string, value: string): Record<string, unknown>[] | null {
  const call = upsertFn.mock.calls.find(
    (c: unknown[]) => {
      const payload = c[0]
      if (Array.isArray(payload) && payload.length > 0) {
        return payload[0][key] === value
      }
      return false
    }
  )
  return call ? call[0] as Record<string, unknown>[] : null
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("upsertSyncResults", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("should upsert flow metrics with fetched_at (atomic write, no pre-DELETE)", async () => {
    const { client, from, upsert, deleteLt } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    expect(from).toHaveBeenCalledWith("klaviyo_flow_metrics")

    // UPSERT should include fetched_at and period_label
    const flowUpsertCall = upsert.mock.calls.find(
      (c: unknown[]) => {
        const payload = c[0]
        return Array.isArray(payload) && payload.length > 0 && payload[0].flow_id === "flow-1"
      }
    )
    expect(flowUpsertCall).toBeDefined()
    expect(flowUpsertCall![0][0].fetched_at).toBeDefined()
    expect(flowUpsertCall![0][0].period_label).toBe("30d")

    // Post-UPSERT cleanup should be called (delete stale rows via .lt)
    expect(deleteLt).toHaveBeenCalled()
  })

  it("should upsert campaign metrics with fetched_at (atomic write, no pre-DELETE)", async () => {
    const { client, from, upsert, deleteLt } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    expect(from).toHaveBeenCalledWith("klaviyo_campaign_metrics")

    // UPSERT should include fetched_at and period_label
    const campUpsertCall = upsert.mock.calls.find(
      (c: unknown[]) => {
        const payload = c[0]
        return Array.isArray(payload) && payload.length > 0 && payload[0].campaign_id === "camp-1"
      }
    )
    expect(campUpsertCall).toBeDefined()
    expect(campUpsertCall![0][0].fetched_at).toBeDefined()
    expect(campUpsertCall![0][0].period_label).toBe("30d")

    // Post-UPSERT cleanup should be called
    expect(deleteLt).toHaveBeenCalled()
  })

  it("should skip flow upsert when flowRows is empty", async () => {
    const { client, from } = createMockSupabase()
    const dataNoFlows = { ...SYNC_DATA, flowRows: [] }

    await upsertSyncResults(client, STORE, dataNoFlows, "30d")

    const flowCall = from.mock.calls.find(
      (c: string[]) => c[0] === "klaviyo_flow_metrics"
    )
    expect(flowCall).toBeUndefined()
  })

  it("should skip campaign upsert when campRows is empty", async () => {
    const { client, from } = createMockSupabase()
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

    // Find the upsert call that contains the summary payload (has store_id + period_label)
    const summaryCall = upsert.mock.calls.find(
      (call: unknown[]) => {
        const payload = call[0] as Record<string, unknown>
        return payload?.store_id === "store-1" && payload?.period_label === "30d" && payload?.sync_status !== undefined
      }
    )
    expect(summaryCall).toBeDefined()
    const row = summaryCall![0] as Record<string, unknown>

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
    const { client, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d", AUDIENCE)

    const row = findSummaryUpsert(upsert)
    expect(row.total_leads).toBe(10000)
    expect(row.engaged_leads).toBe(3000)
    expect(row.engagement_rate).toBe(30)
  })

  it("should NOT include audience fields when audience param is omitted", async () => {
    const { client, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    const row = findSummaryUpsert(upsert)
    expect(row.total_leads).toBeUndefined()
    expect(row.engaged_leads).toBeUndefined()
    expect(row.engagement_rate).toBeUndefined()
  })

  it("should skip revenue summary upsert when org_id is null", async () => {
    const { client, upsert } = createMockSupabase()
    const storeNoOrg = { id: "store-1", org_id: null }

    await upsertSyncResults(client, storeNoOrg, SYNC_DATA, "30d")

    // Summary upsert should NOT have been called (guard returns early)
    const summaryCall = upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>
        return !Array.isArray(arg) && arg.store_id === "store-1" && "sync_status" in arg
      },
    )
    expect(summaryCall).toBeUndefined()
  })

  it("should skip revenue summary upsert when org_id is undefined", async () => {
    const { client, upsert } = createMockSupabase()
    const storeUndefinedOrg = { id: "store-1" } // org_id is undefined

    await upsertSyncResults(client, storeUndefinedOrg, SYNC_DATA, "30d")

    // Summary upsert should NOT have been called (guard returns early)
    const summaryCall = upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>
        return !Array.isArray(arg) && arg.store_id === "store-1" && "sync_status" in arg
      },
    )
    expect(summaryCall).toBeUndefined()
  })

  it("should set sync_status to 'partial' when only flow data is available", async () => {
    // Mock that supports store_revenue_summary SELECT + upsert + delete chains
    const upsertFn = vi.fn().mockResolvedValue({ error: null })
    const deleteLtFn = vi.fn().mockResolvedValue({ error: null })
    const deleteEqFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ lt: deleteLtFn }), lt: deleteLtFn })
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "client_stores") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { client_id: "client-1" }, error: null }),
            }),
          }),
        }
      }
      if (table === "store_revenue_summary") {
        return {
          upsert: upsertFn,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { klaviyo_campaign_revenue: 4000, klaviyo_flow_revenue: 2000 },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return { upsert: upsertFn, delete: deleteFn }
    })
    const client = { from: fromFn } as unknown as Parameters<typeof upsertSyncResults>[0]

    const partialData: KlaviyoSyncData = {
      ...SYNC_DATA,
      campaignRevenue: 0,
      campaignDataAvailable: false,
      flowDataAvailable: true,
      campRows: [],
    }

    await upsertSyncResults(client, STORE, partialData, "30d")

    // Find the upsert call for store_revenue_summary
    const summaryUpsertCall = upsertFn.mock.calls.find(
      (call: unknown[]) => {
        const payload = call[0] as Record<string, unknown>
        return payload.store_id === "store-1" && payload.period_label === "30d"
      }
    )
    expect(summaryUpsertCall).toBeDefined()
    const row = summaryUpsertCall![0] as Record<string, unknown>

    expect(row.sync_status).toBe("partial")
    expect(row.sync_error).toBe("Campaign report unavailable")
    expect(row.klaviyo_flow_revenue).toBe(3000)
    expect(row.klaviyo_campaign_revenue).toBeUndefined()
    // Total = flow (available) + campaign from DB (4000)
    expect(row.klaviyo_total_revenue).toBe(7000)
  })

  it("should set sync_status to 'error' when both reports unavailable", async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null })
    const singleFn = vi.fn().mockResolvedValue({ data: { client_id: "client-1" }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    const deleteLtFn = vi.fn().mockResolvedValue({ error: null })
    const deleteEqFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ lt: deleteLtFn }), lt: deleteLtFn })
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "client_stores") return { select: selectFn }
      return { upsert: upsertFn, delete: deleteFn }
    })
    const client = { from: fromFn } as unknown as Parameters<typeof upsertSyncResults>[0]

    const noDataAvailable: KlaviyoSyncData = {
      ...SYNC_DATA,
      campaignRevenue: 0,
      flowRevenue: 0,
      campaignDataAvailable: false,
      flowDataAvailable: false,
      flowRows: [],
      campRows: [],
    }

    await upsertSyncResults(client, STORE, noDataAvailable, "30d")

    const summaryCallIndex = fromFn.mock.calls.findIndex(
      (c: string[]) => c[0] === "store_revenue_summary"
    )
    const row = upsertFn.mock.calls[summaryCallIndex][0]

    expect(row.sync_status).toBe("error")
    expect(row.sync_error).toBe("Both campaign and flow reports unavailable")
    expect(row.klaviyo_total_revenue).toBe(0)
    expect(row.klaviyo_campaign_revenue).toBeUndefined()
    expect(row.klaviyo_flow_revenue).toBeUndefined()
  })

  it("should set expires_at to ~24 hours from now", async () => {
    const { client, upsert } = createMockSupabase()
    const before = Date.now()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    const after = Date.now()
    const row = findSummaryUpsert(upsert)

    const expiresAt = new Date(row.expires_at as string).getTime()
    const twentyFourHoursMs = 24 * 60 * 60 * 1000

    // expires_at should be ~24 hours from now (within 2 seconds tolerance)
    expect(expiresAt).toBeGreaterThanOrEqual(before + twentyFourHoursMs - 2000)
    expect(expiresAt).toBeLessThanOrEqual(after + twentyFourHoursMs + 2000)
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
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "client_stores") return { select: selectFn }
      return { upsert: upsertFn }
    })
    const client = { from: fromFn } as unknown as Parameters<typeof savePerfDataToCache>[0]

    // Should not throw
    await expect(
      savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")
    ).resolves.toBeUndefined()
  })

  it("should use attributedRevenue for klaviyo_total_revenue", async () => {
    const { client, upsert } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    const row = findSummaryUpsert(upsert)
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
    const { client, upsert } = createMockSupabase()
    const before = Date.now()

    await savePerfDataToCache(client, "store-1", "org-1", "7d", PERF_DATA, "2026-02-24", "2026-03-03")

    const after = Date.now()
    const row = findSummaryUpsert(upsert)

    // Validate period ISO dates
    expect(row.period_start).toBe(new Date("2026-02-24T00:00:00Z").toISOString())
    expect(row.period_end).toBe(new Date("2026-03-03T23:59:59.999Z").toISOString())

    // Validate expires_at ~24 hours
    const expiresAt = new Date(row.expires_at as string).getTime()
    const twentyFourHoursMs = 24 * 60 * 60 * 1000
    expect(expiresAt).toBeGreaterThanOrEqual(before + twentyFourHoursMs - 2000)
    expect(expiresAt).toBeLessThanOrEqual(after + twentyFourHoursMs + 2000)
  })

  it("should sync campaigns to calendar table", async () => {
    const { client, from, upsert } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    expect(from).toHaveBeenCalledWith("campaigns")
    const campaignRow = findTableUpsert(upsert, "klaviyo_campaign_id", "camp-1")
    expect(campaignRow).not.toBeNull()
    expect(campaignRow).toHaveLength(1)
    expect(campaignRow![0].klaviyo_campaign_id).toBe("camp-1")
    expect(campaignRow![0].name).toBe("Black Friday")
    expect(campaignRow![0].status).toBe("sent")
    expect(campaignRow![0].recipients).toBe(5000)
    expect(campaignRow![0].revenue).toBe(5000)
    expect(campaignRow![0].client_id).toBe("client-1")
  })

  it("should skip calendar sync when recentCampaigns is empty", async () => {
    const { client, from } = createMockSupabase()
    const dataNocamp = {
      ...PERF_DATA,
      recentCampaigns: [],
    } as unknown as KlaviyoPerformanceData

    await savePerfDataToCache(client, "store-1", "org-1", "30d", dataNocamp, "2026-01-01", "2026-01-31")

    const campaignsCall = from.mock.calls.find(
      (c: string[]) => c[0] === "campaigns"
    )
    expect(campaignsCall).toBeUndefined()
  })

  it("should resolve client_id from client_stores", async () => {
    const { client, from, eq } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "org-1", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    expect(from).toHaveBeenCalledWith("client_stores")
    expect(eq).toHaveBeenCalledWith("id", "store-1")
  })

  it("C1: should early-return when orgId is empty string (no upsert called)", async () => {
    const { client, from } = createMockSupabase()

    await savePerfDataToCache(client, "store-1", "", "30d", PERF_DATA, "2026-01-01", "2026-01-31")

    // Empty orgId triggers the guard before any DB call
    expect(from).not.toHaveBeenCalled()
  })
})

describe("upsertSyncResults - atomic write (Story 54.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("should NOT run cleanup when upsert fails (flow metrics)", async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: { message: "upsert failed" } })
    const deleteLtFn = vi.fn().mockResolvedValue({ error: null })
    const deleteEqFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ lt: deleteLtFn }), lt: deleteLtFn })
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn })
    const singleFn = vi.fn().mockResolvedValue({ data: { client_id: "client-1" }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    const revSummarySingleFn = vi.fn().mockResolvedValue({
      data: { klaviyo_campaign_revenue: 0, klaviyo_flow_revenue: 0 },
      error: null,
    })
    const revSummaryEq2 = vi.fn().mockReturnValue({ single: revSummarySingleFn })
    const revSummaryEq1 = vi.fn().mockReturnValue({ eq: revSummaryEq2 })
    const revSummarySelect = vi.fn().mockReturnValue({ eq: revSummaryEq1 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "client_stores") return { select: selectFn }
      if (table === "store_revenue_summary") return { upsert: upsertFn, select: revSummarySelect }
      return { upsert: upsertFn, delete: deleteFn }
    })
    const client = { from: fromFn } as unknown as Parameters<typeof upsertSyncResults>[0]

    const dataFlowsOnly: KlaviyoSyncData = {
      ...SYNC_DATA,
      campRows: [],
      campaignDataAvailable: false,
      campaignRevenue: 0,
    }

    await upsertSyncResults(client, STORE, dataFlowsOnly, "30d")

    // Cleanup (.lt) should NOT be called since upsert returned an error
    expect(deleteLtFn).not.toHaveBeenCalled()
  })

  it("should NOT run cleanup when upsert fails (campaign metrics)", async () => {
    const callCount = { flowUpsertDone: false }
    const upsertFn = vi.fn().mockImplementation((rows: unknown[]) => {
      const arr = rows as Record<string, unknown>[]
      if (arr.length > 0 && "campaign_id" in arr[0]) {
        return Promise.resolve({ error: { message: "campaign upsert failed" } })
      }
      callCount.flowUpsertDone = true
      return Promise.resolve({ error: null })
    })
    const deleteLtFn = vi.fn().mockResolvedValue({ error: null })
    const deleteEqFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ lt: deleteLtFn }), lt: deleteLtFn })
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn })
    const singleFn = vi.fn().mockResolvedValue({ data: { client_id: "client-1" }, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "client_stores") return { select: selectFn }
      return { upsert: upsertFn, delete: deleteFn }
    })
    const client = { from: fromFn } as unknown as Parameters<typeof upsertSyncResults>[0]

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    // Flow cleanup should fire (flow upsert succeeds), but only 1 lt call for flows
    // Campaign cleanup should NOT fire (campaign upsert fails)
    // deleteLtFn is called once (for flow cleanup only)
    expect(deleteLtFn).toHaveBeenCalledTimes(1)
  })
})

describe("upsertSyncResults - org_id null still saves metrics", () => {
  it("C2: should upsert flow and campaign metrics but skip revenue summary when org_id is null", async () => {
    const { client, from, upsert } = createMockSupabase()
    const storeNoOrg = { id: "store-1", org_id: null }

    await upsertSyncResults(client, storeNoOrg, SYNC_DATA, "30d")

    // Flow metrics MUST be saved
    expect(from).toHaveBeenCalledWith("klaviyo_flow_metrics")
    // Campaign metrics MUST be saved
    expect(from).toHaveBeenCalledWith("klaviyo_campaign_metrics")

    // Revenue summary MUST NOT be saved
    const summaryCall = upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>
        return !Array.isArray(arg) && "sync_status" in arg
      },
    )
    expect(summaryCall).toBeUndefined()
  })

  it("C3: should NOT call syncCampaignsToCalendarFromCron when org_id is null", async () => {
    const { client, from } = createMockSupabase()
    const storeNoOrg = { id: "store-1", org_id: null }

    await upsertSyncResults(client, storeNoOrg, SYNC_DATA, "30d")

    // The "campaigns" table should NOT be accessed (calendar sync is after the guard)
    const campaignsCall = from.mock.calls.find(
      (c: string[]) => c[0] === "campaigns"
    )
    expect(campaignsCall).toBeUndefined()
  })
})

describe("upsertSyncResults - calendar sync", () => {
  it("should sync campaigns to calendar table from cron path", async () => {
    const { client, from, upsert } = createMockSupabase()

    await upsertSyncResults(client, STORE, SYNC_DATA, "30d")

    expect(from).toHaveBeenCalledWith("campaigns")
    const campaignRow = findTableUpsert(upsert, "klaviyo_campaign_id", "camp-1")
    expect(campaignRow).not.toBeNull()
    expect(campaignRow).toHaveLength(1)
    expect(campaignRow![0].klaviyo_campaign_id).toBe("camp-1")
    expect(campaignRow![0].name).toBe("Black Friday")
    expect(campaignRow![0].status).toBe("sent")
    expect(campaignRow![0].subject_line).toBe("Sale!")
    expect(campaignRow![0].recipients).toBe(5000)
    expect(campaignRow![0].delivered).toBe(4800)
    expect(campaignRow![0].revenue).toBe(5000)
  })

  it("should skip calendar sync when campRows is empty", async () => {
    const { client, from } = createMockSupabase()
    const dataNocamp = { ...SYNC_DATA, campRows: [] }

    await upsertSyncResults(client, STORE, dataNocamp, "30d")

    const campaignsCall = from.mock.calls.find(
      (c: string[]) => c[0] === "campaigns"
    )
    expect(campaignsCall).toBeUndefined()
  })
})
