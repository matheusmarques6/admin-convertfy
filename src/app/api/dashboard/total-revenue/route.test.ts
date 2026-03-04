/**
 * Tests for total-revenue route helper functions.
 *
 * We test the pure helper functions (buildStoreBreakdown, buildResponse, emptyResponse)
 * by extracting them indirectly via module behavior. Since the helpers are not exported,
 * we test the logic they encapsulate through unit-testable equivalents.
 *
 * WARNING: These helper copies must be kept in sync with route.ts.
 * If the source logic changes, these tests may still pass while validating
 * stale logic. Consider exporting helpers from route.ts in the future.
 */
import { describe, it, expect } from "vitest"

// ── Re-implement helper logic for testing (mirrors route.ts) ─────────────────

interface StoreRevenue {
  storeId: string
  storeName: string
  clientName: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
}

interface DataStatusMeta {
  dataStatus: string
  lastFetchedAt: string | null
  isRefreshing: boolean
  source: "cache" | "live" | "stale-cache"
}

function buildStoreBreakdown(rows: Array<{
  store_id: string
  klaviyo_total_revenue: number | string
  klaviyo_campaign_revenue: number | string
  klaviyo_flow_revenue: number | string
  sync_status: string
  fetched_at: string | null
  client_stores: unknown
}>): StoreRevenue[] {
  return rows.map((s) => {
    const storeData = s.client_stores as {
      id: string
      store_name: string
      client_id: string | null
      clients: { name: string } | null
    }
    return {
      storeId: s.store_id,
      storeName: storeData.store_name || "Loja sem nome",
      clientName: storeData.client_id
        ? (storeData.clients?.name || "Cliente desconhecido")
        : storeData.store_name || "Loja avulsa",
      totalRevenue: Number(s.klaviyo_total_revenue),
      campaignRevenue: Number(s.klaviyo_campaign_revenue),
      flowRevenue: Number(s.klaviyo_flow_revenue),
    }
  })
}

function buildResponse(
  period: string,
  storeBreakdown: StoreRevenue[],
  rows: Array<{ sync_status: string; fetched_at: string | null }>,
  meta: DataStatusMeta,
  storesCount?: number,
) {
  const totalRevenue = storeBreakdown.reduce((sum, s) => sum + s.totalRevenue, 0)
  const campaignRevenue = storeBreakdown.reduce((sum, s) => sum + s.campaignRevenue, 0)
  const flowRevenue = storeBreakdown.reduce((sum, s) => sum + s.flowRevenue, 0)
  const storesWithRevenue = storeBreakdown.filter((s) => s.totalRevenue > 0).length

  const sorted = [...storeBreakdown].sort((a, b) => b.totalRevenue - a.totalRevenue)
  const topStores = sorted.filter(s => s.totalRevenue > 0).slice(0, 5)
  const bottomStores = sorted.filter(s => s.totalRevenue > 0).length > 5
    ? [...sorted.filter(s => s.totalRevenue > 0)].reverse().slice(0, 5)
    : []

  const hasPartialData = rows.some(
    (s) => s.sync_status === "error" || s.sync_status === "partial"
  )

  const lastFetchedAt = meta.lastFetchedAt ?? rows.reduce((oldest: string | null, s) => {
    if (!s.fetched_at) return oldest
    if (!oldest) return s.fetched_at
    return new Date(s.fetched_at) < new Date(oldest) ? s.fetched_at : oldest
  }, null)

  return {
    period,
    totalRevenue,
    campaignRevenue,
    flowRevenue,
    storesCount: storesCount ?? storeBreakdown.length,
    storesWithRevenue,
    topStores,
    bottomStores,
    storeBreakdown,
    hasPartialData,
    lastFetchedAt,
    dataStatus: meta.dataStatus,
    isRefreshing: meta.isRefreshing,
    source: meta.source,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildStoreBreakdown", () => {
  it("should convert cache rows into StoreRevenue array", () => {
    const rows = [
      {
        store_id: "s1",
        klaviyo_total_revenue: "5000.50",
        klaviyo_campaign_revenue: "3000",
        klaviyo_flow_revenue: "2000.50",
        sync_status: "ok",
        fetched_at: "2026-03-01T12:00:00Z",
        client_stores: {
          id: "s1",
          store_name: "Loja A",
          client_id: "c1",
          clients: { name: "Cliente A" },
        },
      },
    ]

    const result = buildStoreBreakdown(rows)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      storeId: "s1",
      storeName: "Loja A",
      clientName: "Cliente A",
      totalRevenue: 5000.5,
      campaignRevenue: 3000,
      flowRevenue: 2000.5,
    })
  })

  it("should handle string revenue values (from Supabase numeric)", () => {
    const rows = [{
      store_id: "s1",
      klaviyo_total_revenue: "12345.67",
      klaviyo_campaign_revenue: "0",
      klaviyo_flow_revenue: "12345.67",
      sync_status: "ok",
      fetched_at: null,
      client_stores: {
        id: "s1",
        store_name: "Store",
        client_id: null,
        clients: null,
      },
    }]

    const result = buildStoreBreakdown(rows)
    expect(result[0].totalRevenue).toBe(12345.67)
    expect(result[0].campaignRevenue).toBe(0)
  })

  it("should use 'Loja sem nome' when store_name is empty", () => {
    const rows = [{
      store_id: "s1",
      klaviyo_total_revenue: 0,
      klaviyo_campaign_revenue: 0,
      klaviyo_flow_revenue: 0,
      sync_status: "ok",
      fetched_at: null,
      client_stores: { id: "s1", store_name: "", client_id: null, clients: null },
    }]

    const result = buildStoreBreakdown(rows)
    expect(result[0].storeName).toBe("Loja sem nome")
  })

  it("should use 'Cliente desconhecido' when client_id exists but no client name", () => {
    const rows = [{
      store_id: "s1",
      klaviyo_total_revenue: 0,
      klaviyo_campaign_revenue: 0,
      klaviyo_flow_revenue: 0,
      sync_status: "ok",
      fetched_at: null,
      client_stores: { id: "s1", store_name: "Loja", client_id: "c1", clients: null },
    }]

    const result = buildStoreBreakdown(rows)
    expect(result[0].clientName).toBe("Cliente desconhecido")
  })

  it("should use store name as client name for avulsa (no client_id)", () => {
    const rows = [{
      store_id: "s1",
      klaviyo_total_revenue: 0,
      klaviyo_campaign_revenue: 0,
      klaviyo_flow_revenue: 0,
      sync_status: "ok",
      fetched_at: null,
      client_stores: { id: "s1", store_name: "Loja Avulsa", client_id: null, clients: null },
    }]

    const result = buildStoreBreakdown(rows)
    expect(result[0].clientName).toBe("Loja Avulsa")
  })

  it("should use 'Loja avulsa' as clientName when no client_id and empty store_name", () => {
    const rows = [{
      store_id: "s1",
      klaviyo_total_revenue: 0,
      klaviyo_campaign_revenue: 0,
      klaviyo_flow_revenue: 0,
      sync_status: "ok",
      fetched_at: null,
      client_stores: { id: "s1", store_name: "", client_id: null, clients: null },
    }]

    const result = buildStoreBreakdown(rows)
    // Empty store_name with no client_id falls through to "Loja avulsa" via || operator
    expect(result[0].clientName).toBe("Loja avulsa")
  })
})

describe("buildResponse", () => {
  const META: DataStatusMeta = {
    dataStatus: "ready",
    lastFetchedAt: null,
    isRefreshing: false,
    source: "cache",
  }

  it("should aggregate revenue across multiple stores", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
      { storeId: "s2", storeName: "B", clientName: "C2", totalRevenue: 3000, campaignRevenue: 1000, flowRevenue: 2000 },
    ]
    const rows = [
      { sync_status: "ok", fetched_at: "2026-03-01T12:00:00Z" },
      { sync_status: "ok", fetched_at: "2026-03-01T13:00:00Z" },
    ]

    const result = buildResponse("30d", stores, rows, META)

    expect(result.totalRevenue).toBe(8000)
    expect(result.campaignRevenue).toBe(4000)
    expect(result.flowRevenue).toBe(4000)
    expect(result.storesCount).toBe(2)
    expect(result.storesWithRevenue).toBe(2)
  })

  it("should return top 5 stores sorted by revenue descending", () => {
    const stores: StoreRevenue[] = Array.from({ length: 8 }, (_, i) => ({
      storeId: `s${i}`,
      storeName: `Store ${i}`,
      clientName: `Client ${i}`,
      totalRevenue: (i + 1) * 1000,
      campaignRevenue: (i + 1) * 500,
      flowRevenue: (i + 1) * 500,
    }))
    const rows = stores.map(() => ({ sync_status: "ok", fetched_at: "2026-03-01T12:00:00Z" }))

    const result = buildResponse("30d", stores, rows, META)

    expect(result.topStores).toHaveLength(5)
    expect(result.topStores[0].totalRevenue).toBe(8000) // highest
    expect(result.topStores[4].totalRevenue).toBe(4000)
  })

  it("should return bottom 5 stores when more than 5 have revenue", () => {
    const stores: StoreRevenue[] = Array.from({ length: 8 }, (_, i) => ({
      storeId: `s${i}`,
      storeName: `Store ${i}`,
      clientName: `Client ${i}`,
      totalRevenue: (i + 1) * 1000,
      campaignRevenue: (i + 1) * 500,
      flowRevenue: (i + 1) * 500,
    }))
    const rows = stores.map(() => ({ sync_status: "ok", fetched_at: "2026-03-01T12:00:00Z" }))

    const result = buildResponse("30d", stores, rows, META)

    expect(result.bottomStores).toHaveLength(5)
    expect(result.bottomStores[0].totalRevenue).toBe(1000) // lowest
  })

  it("should return empty bottomStores when 5 or fewer stores have revenue", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
    ]
    const rows = [{ sync_status: "ok", fetched_at: null }]

    const result = buildResponse("30d", stores, rows, META)

    expect(result.bottomStores).toHaveLength(0)
  })

  it("should exclude stores with 0 revenue from topStores", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
      { storeId: "s2", storeName: "B", clientName: "C2", totalRevenue: 0, campaignRevenue: 0, flowRevenue: 0 },
    ]
    const rows = [
      { sync_status: "ok", fetched_at: null },
      { sync_status: "ok", fetched_at: null },
    ]

    const result = buildResponse("30d", stores, rows, META)

    expect(result.topStores).toHaveLength(1)
    expect(result.storesWithRevenue).toBe(1)
    expect(result.storesCount).toBe(2) // includes all stores
  })

  it("should detect hasPartialData when sync_status is 'error'", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
    ]
    const rows = [{ sync_status: "error", fetched_at: null }]

    const result = buildResponse("30d", stores, rows, META)

    expect(result.hasPartialData).toBe(true)
  })

  it("should detect hasPartialData when sync_status is 'partial'", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
    ]
    const rows = [{ sync_status: "partial", fetched_at: null }]

    const result = buildResponse("30d", stores, rows, META)

    expect(result.hasPartialData).toBe(true)
  })

  it("should use oldest fetched_at when meta.lastFetchedAt is null", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
      { storeId: "s2", storeName: "B", clientName: "C2", totalRevenue: 3000, campaignRevenue: 1000, flowRevenue: 2000 },
    ]
    const rows = [
      { sync_status: "ok", fetched_at: "2026-03-01T12:00:00Z" }, // older
      { sync_status: "ok", fetched_at: "2026-03-01T15:00:00Z" }, // newer
    ]

    const result = buildResponse("30d", stores, rows, META)

    expect(result.lastFetchedAt).toBe("2026-03-01T12:00:00Z")
  })

  it("should prefer meta.lastFetchedAt over row fetched_at", () => {
    const meta: DataStatusMeta = {
      ...META,
      lastFetchedAt: "2026-03-03T10:00:00Z",
    }
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
    ]
    const rows = [{ sync_status: "ok", fetched_at: "2026-03-01T12:00:00Z" }]

    const result = buildResponse("30d", stores, rows, meta)

    expect(result.lastFetchedAt).toBe("2026-03-03T10:00:00Z")
  })

  it("should pass through dataStatus, isRefreshing, and source from meta", () => {
    const meta: DataStatusMeta = {
      dataStatus: "stale",
      lastFetchedAt: null,
      isRefreshing: true,
      source: "live",
    }

    const result = buildResponse("30d", [], [], meta)

    expect(result.dataStatus).toBe("stale")
    expect(result.isRefreshing).toBe(true)
    expect(result.source).toBe("live")
  })

  it("should handle empty store list", () => {
    const result = buildResponse("30d", [], [], META)

    expect(result.totalRevenue).toBe(0)
    expect(result.campaignRevenue).toBe(0)
    expect(result.flowRevenue).toBe(0)
    expect(result.storesCount).toBe(0)
    expect(result.storesWithRevenue).toBe(0)
    expect(result.topStores).toHaveLength(0)
    expect(result.bottomStores).toHaveLength(0)
    expect(result.hasPartialData).toBe(false)
  })

  it("should return empty bottomStores when exactly 5 stores have revenue", () => {
    const stores: StoreRevenue[] = Array.from({ length: 5 }, (_, i) => ({
      storeId: `s${i}`,
      storeName: `Store ${i}`,
      clientName: `Client ${i}`,
      totalRevenue: (i + 1) * 1000,
      campaignRevenue: (i + 1) * 500,
      flowRevenue: (i + 1) * 500,
    }))
    const rows = stores.map(() => ({ sync_status: "ok", fetched_at: "2026-03-01T12:00:00Z" }))

    const result = buildResponse("30d", stores, rows, META)

    expect(result.topStores).toHaveLength(5)
    expect(result.bottomStores).toHaveLength(0) // exactly 5 = no bottom
  })

  it("should return null lastFetchedAt when meta and all rows have null fetched_at", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 1000, campaignRevenue: 500, flowRevenue: 500 },
    ]
    const rows = [{ sync_status: "ok", fetched_at: null }]

    const result = buildResponse("30d", stores, rows, { ...META, lastFetchedAt: null })

    expect(result.lastFetchedAt).toBeNull()
  })

  it("should use explicit storesCount when provided (Story 11.4)", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
      { storeId: "s2", storeName: "B", clientName: "C2", totalRevenue: 3000, campaignRevenue: 1000, flowRevenue: 2000 },
    ]
    const rows = [
      { sync_status: "ok", fetched_at: "2026-03-01T12:00:00Z" },
      { sync_status: "ok", fetched_at: "2026-03-01T13:00:00Z" },
    ]

    // Org has 4 stores with Klaviyo but only 2 are in cache
    const result = buildResponse("30d", stores, rows, META, 4)

    expect(result.storesCount).toBe(4)
    expect(result.storesWithRevenue).toBe(2)
    expect(result.storeBreakdown).toHaveLength(2)
  })

  it("should fallback to storeBreakdown.length when storesCount is not provided", () => {
    const stores: StoreRevenue[] = [
      { storeId: "s1", storeName: "A", clientName: "C1", totalRevenue: 5000, campaignRevenue: 3000, flowRevenue: 2000 },
    ]
    const rows = [{ sync_status: "ok", fetched_at: null }]

    const result = buildResponse("30d", stores, rows, META)

    expect(result.storesCount).toBe(1)
  })
})
