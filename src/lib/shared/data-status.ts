/**
 * Shared types and constants for cache-first + live fallback strategy.
 * Used by cron, admin endpoints, portal endpoints, and frontend.
 *
 * Epic 10 - Cache-First + Live Fallback Unificado
 */

// ─── DataStatus ──────────────────────────────────────────────────────────────

/** Unified data status across all endpoints */
export type DataStatus = "loading" | "stale" | "ready" | "error" | "empty" | "syncing"

/** Metadata returned alongside data to inform frontend about freshness */
export interface DataStatusMeta {
  dataStatus: DataStatus
  lastFetchedAt: string | null
  isRefreshing: boolean
  /** Where the data came from */
  source: "cache" | "live" | "stale-cache"
}

// ─── Periods ─────────────────────────────────────────────────────────────────

/** Periods that the cron pre-populates — cache always available after first sync */
export const CACHED_PERIODS = ["30d", "7d", "15d", "90d", "12m"] as const
export type CachedPeriod = (typeof CACHED_PERIODS)[number]

/** Periods that require live fetch (not cached by cron) */
export const LIVE_ONLY_PERIODS = ["1d", "custom"] as const
export type LiveOnlyPeriod = (typeof LIVE_ONLY_PERIODS)[number]

/** All valid periods */
export const ALL_PERIODS = [...CACHED_PERIODS, ...LIVE_ONLY_PERIODS] as const
export type Period = (typeof ALL_PERIODS)[number]

/** Type guard: is this period pre-cached by cron? */
export function isCachedPeriod(period: string): period is CachedPeriod {
  return (CACHED_PERIODS as readonly string[]).includes(period)
}

// ─── Custom Period Helpers (RG-1 / CR1) ─────────────────────────────────────

/**
 * Check if a period string represents a custom date range.
 * Handles both legacy `'custom'` (from frontend params) and composite
 * `'custom:YYYY-MM-DD:YYYY-MM-DD'` (from DB period_label).
 */
export function isCustomPeriod(period: string): boolean {
  return period === "custom" || period.startsWith("custom:")
}

/**
 * Build composite period_label for a custom date range.
 * Format: 'custom:2026-01-01:2026-03-18'
 * This is what gets stored in store_revenue_summary.period_label.
 */
export function buildCustomPeriodLabel(startDate: string, endDate: string): string {
  return `custom:${startDate}:${endDate}`
}

/**
 * Parse a composite custom period_label back into start/end dates.
 * Returns null if the label is not a valid composite custom period.
 */
export function parseCustomPeriodLabel(label: string): { startDate: string; endDate: string } | null {
  if (!label.startsWith("custom:")) return null
  const parts = label.split(":")
  if (parts.length !== 3) return null
  return { startDate: parts[1], endDate: parts[2] }
}

// ─── Sync Result ─────────────────────────────────────────────────────────────

/** Generic result type for sync service operations (replaces silent null returns) */
export interface SyncResult<T> {
  success: boolean
  data: T | null
  error?: string
  source: "cache" | "live" | "stale-cache"
  fetchedAt: string
}

// ─── Freshness Thresholds (Cron Skip) ───────────────────────────────────────

/** How long each period's cache is considered "fresh enough" to skip re-sync.
 *  0 = always sync. Used by cron to avoid re-fetching data that barely changed. */
export const PERIOD_FRESHNESS_THRESHOLDS: Record<CachedPeriod, number> = {
  "7d":  3 * 60 * 60_000,   // 3 hours  (AK-10 — relaxed from 1h, ~55% fewer report calls)
  "15d": 4 * 60 * 60_000,   // 4 hours  (AK-10 — relaxed from 2h)
  "30d": 3 * 60 * 60_000,   // 3 hours  (aligned with 7d for fresher campaign data)
  "90d": 12 * 60 * 60_000,  // 12 hours (AK-10 — relaxed from 8h)
  "12m": 24 * 60 * 60_000,  // 24 hours — annual data barely changes intra-day (AK-11)
}

// ─── Attribution Settling (AK-14) ────────────────────────────────────────────

/** Periods where Klaviyo attribution data is still settling (< attribution window) */
export const SETTLING_PERIODS = ["1d", "7d"] as const
export type SettlingPeriod = (typeof SETTLING_PERIODS)[number]

/** Days for Klaviyo last-touch attribution to stabilize (default email window) */
export const ATTRIBUTION_SETTLING_DAYS = 5

/** Type guard: is this period still within the attribution settling window? */
export function isSettlingPeriod(period: string): period is SettlingPeriod {
  return (SETTLING_PERIODS as readonly string[]).includes(period)
}

/** Multiplier for freshness threshold to consider data "stale" in the UI */
export const STALE_THRESHOLD_MULTIPLIER = 2

// ─── Cooldown Constants ──────────────────────────────────────────────────────

/** Cooldown in ms between live fetches for the same store+period */
export const LIVE_FETCH_COOLDOWN_MS = 60_000

/** Cooldown for custom date ranges (M2: key = store_id + date_range_hash) */
export const CUSTOM_RANGE_COOLDOWN_MS = 30 * 60_000

/** TTL for live fetch results cached in store_revenue_summary */
export const LIVE_FETCH_CACHE_TTL_MS = 5 * 60_000

// ─── Custom Range Cache TTL (RG-1) ─────────────────────────────────────────

/**
 * TTL in ms for custom range cache, tiered by how "historical" the range is.
 *
 * | Condition                              | TTL        |
 * |----------------------------------------|------------|
 * | end_date < today - 7d (historical)     | 30 days    |
 * | end_date < today (recent)              | 6 hours    |
 * | end_date >= today, range > 30d (long)  | 2 hours    |
 * | end_date >= today, range <= 30d (short)| 30 minutes |
 */
export function getCustomRangeTTL(rangeStart: Date, rangeEnd: Date): number {
  const now = new Date()
  const msPerDay = 24 * 60 * 60_000
  const daysSinceEnd = (now.getTime() - rangeEnd.getTime()) / msPerDay
  const rangeDays = (rangeEnd.getTime() - rangeStart.getTime()) / msPerDay

  if (daysSinceEnd > 7) return 30 * 24 * 60 * 60_000    // historical: 30 days
  if (daysSinceEnd >= 1) return 6 * 60 * 60_000           // recent: 6 hours
  if (rangeDays > 30) return 2 * 60 * 60_000              // ongoing long: 2 hours
  return 30 * 60_000                                       // ongoing short: 30 minutes
}

/**
 * Check if a custom range cache row is still fresh based on tiered TTL.
 */
export function isCustomRangeCacheFresh(
  fetchedAt: string | Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const fetchedDate = typeof fetchedAt === "string" ? new Date(fetchedAt) : fetchedAt
  const ttl = getCustomRangeTTL(rangeStart, rangeEnd)
  return Date.now() - fetchedDate.getTime() < ttl
}
