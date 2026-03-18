/**
 * Tests for cached-metadata.ts
 * Covers Story 16.7.7 — KlaviyoPermissionError re-throw in getCachedPlacedOrderMetric
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFindPlacedOrderMetric = vi.fn()
const mockGetAccountInfo = vi.fn()
const mockGetCache = vi.fn()
const mockSetCache = vi.fn()

vi.mock("./metrics", () => ({
  findPlacedOrderMetric: (...args: unknown[]) => mockFindPlacedOrderMetric(...args),
}))

vi.mock("./account", () => ({
  getAccountInfo: (...args: unknown[]) => mockGetAccountInfo(...args),
}))

vi.mock("@/lib/cache", () => ({
  getCache: (...args: unknown[]) => mockGetCache(...args),
  setCache: (...args: unknown[]) => mockSetCache(...args),
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }),
    }),
  }),
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

import { getCachedPlacedOrderMetric, getCachedAccountInfo } from "./cached-metadata"
import { KlaviyoPermissionError } from "./client"

describe("getCachedPlacedOrderMetric", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCache.mockResolvedValue(null) // no cache hit
    mockSetCache.mockResolvedValue(undefined)
  })

  it("should re-throw KlaviyoPermissionError instead of returning null", async () => {
    mockFindPlacedOrderMetric.mockRejectedValueOnce(
      new KlaviyoPermissionError(["metrics:read"])
    )

    await expect(
      getCachedPlacedOrderMetric("pk_test_key_123")
    ).rejects.toThrow("metrics:read")
  })

  it("should return null for generic errors (not re-throw)", async () => {
    mockFindPlacedOrderMetric.mockRejectedValueOnce(new Error("Network timeout"))

    const result = await getCachedPlacedOrderMetric("pk_test_key_123")

    expect(result).toBeNull()
  })

  it("should return metricId on success", async () => {
    mockFindPlacedOrderMetric.mockResolvedValueOnce("metric-abc-123")

    const result = await getCachedPlacedOrderMetric("pk_test_key_123")

    expect(result).toBe("metric-abc-123")
  })

  it("should use DB cache when storeId is provided", async () => {
    mockGetCache.mockResolvedValueOnce({ data: { metricId: "cached-metric-id" } })

    const result = await getCachedPlacedOrderMetric("pk_test_key_123", undefined, "store-uuid-123")

    expect(result).toBe("cached-metric-id")
    expect(mockFindPlacedOrderMetric).not.toHaveBeenCalled()
  })

  it("should skip DB cache when no storeId provided", async () => {
    mockFindPlacedOrderMetric.mockResolvedValueOnce("metric-from-api")

    const result = await getCachedPlacedOrderMetric("pk_test_key_123")

    expect(result).toBe("metric-from-api")
    expect(mockGetCache).not.toHaveBeenCalled()
  })
})

describe("getCachedAccountInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCache.mockResolvedValue(null)
    mockSetCache.mockResolvedValue(undefined)
  })

  it("should propagate KlaviyoPermissionError from getAccountInfo", async () => {
    mockGetAccountInfo.mockRejectedValueOnce(
      new KlaviyoPermissionError(["accounts:read"])
    )

    await expect(
      getCachedAccountInfo("pk_test_key_123")
    ).rejects.toThrow(KlaviyoPermissionError)
  })
})
