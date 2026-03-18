/**
 * Global Klaviyo Tiered Rate Limiter
 *
 * Enforces per-tier rate limits matching Klaviyo's 5-tier system (XS/S/M/L/XL).
 * Each API key + tier combination gets its own queue so that requests to different
 * tiers can run in parallel while same-tier requests remain serialized.
 *
 * Klaviyo rate limits (from docs):
 * | Tier | Burst (req/s) | Steady (req/min) | Endpoints                              |
 * |------|---------------|-------------------|----------------------------------------|
 * | XS   | 1             | 15                | Reporting API, metric-aggregates       |
 * | S    | 3             | 60                | Flows, Campaigns, Lists, Segments, etc |
 * | M    | 10            | 150               | Templates, Images, Metrics listing     |
 * | L    | 75            | 700               | Profiles, Events listing               |
 * | XL   | 350           | 3500              | Events CRUD, Profiles CRUD, Catalog    |
 */
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoRateLimiter")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateTier = "XS" | "S" | "M" | "L" | "XL"

// ---------------------------------------------------------------------------
// Tier configuration — conservative intervals (well within steady limits)
// ---------------------------------------------------------------------------

export const TIER_INTERVALS: Record<RateTier, number> = {
  XS: 4000,  // ~15 req/min — respects steady 15/min
  S:  1200,  // ~50 req/min — conservative within 60/min
  M:  600,   // ~100 req/min — conservative within 150/min
  L:  350,   // ~170 req/min — conservative within 700/min
  XL: 200,   // ~300 req/min — conservative within 3500/min
}

// ---------------------------------------------------------------------------
// Endpoint → Tier classifier
// ---------------------------------------------------------------------------

/**
 * Classify a Klaviyo API endpoint path into its rate limit tier.
 * Pure function, no side effects.
 *
 * Classification rules (evaluated in order):
 * - XS: reporting endpoints and metric-aggregates
 * - S:  flows, campaigns, lists, segments, accounts, webhooks (collection)
 * - M:  templates, images, metrics listing
 * - L:  profiles listing, events listing (GET collections)
 * - XL: CRUD individual (events, profiles by id, catalog)
 * - Default: S (conservative)
 */
export function classifyEndpoint(path: string): RateTier {
  // Normalize: strip base URL if present, lowercase for matching
  const normalized = path
    .replace(/^https?:\/\/[^/]+\/api/, "")
    .toLowerCase()

  // XS — Reporting API and metric-aggregates
  if (
    normalized.includes("-values-reports") ||
    normalized.includes("-series-reports") ||
    normalized.includes("metric-aggregates")
  ) {
    return "XS"
  }

  // M — Templates, Images, Metrics listing
  if (
    normalized.startsWith("/templates") ||
    normalized.startsWith("/images") ||
    normalized.startsWith("/metrics")
  ) {
    return "M"
  }

  // S — Flows, Campaigns, Lists, Segments, Accounts, Webhooks
  if (
    normalized.startsWith("/flows") ||
    normalized.startsWith("/campaigns") ||
    normalized.startsWith("/lists") ||
    normalized.startsWith("/segments") ||
    normalized.startsWith("/accounts") ||
    normalized.startsWith("/webhooks")
  ) {
    return "S"
  }

  // L — Profiles listing, Events listing (collection endpoints)
  // XL — Individual CRUD (profiles/{id}, events/{id}, catalog)
  if (normalized.startsWith("/profiles") || normalized.startsWith("/events")) {
    // Individual resource: /profiles/{id} or /events/{id}
    const segments = normalized.split("/").filter(Boolean)
    if (segments.length >= 2 && segments[1] && !segments[1].startsWith("?")) {
      return "XL"
    }
    return "L"
  }

  // XL — Catalog endpoints
  if (normalized.startsWith("/catalog")) {
    return "XL"
  }

  // Default: S (conservative)
  return "S"
}

// ---------------------------------------------------------------------------
// Daily Report Quota Tracking (Story AK-2)
// ---------------------------------------------------------------------------

/** Configurable daily report quota limit per API key (empirically observed ~225). */
export const DAILY_REPORT_QUOTA_LIMIT = 225

/** Max XS (reporting) calls per cron cycle per API key group.
 *  Prevents single invocation from exhausting daily cap (~225/key).
 *  With ~288 invocations/day and freshness skip, most cycles use 0 XS calls.
 *  Peak cycles (after deploy / cold cache) may need 6-12 calls per key.
 *  Budget of 60 allows ~3.75 peak cycles/day before exhausting daily cap. */
export const XS_BUDGET_PER_CYCLE = Number(process.env.XS_BUDGET_PER_CYCLE) || 60

/** Threshold at 80% for warning log. */
const QUOTA_WARNING_THRESHOLD = 180

/** Threshold at ~98% for soft halt (stop non-forced reporting requests). */
const QUOTA_SOFT_HALT_THRESHOLD = 220

export interface ReportQuotaInfo {
  used: number
  limit: number
  date: string
  exhausted: boolean
}

/** In-memory daily report call counter per API key. Resets on UTC date change. */
const reportQuota = new Map<string, { count: number; date: string }>()

/** Get current UTC date as YYYY-MM-DD. */
function utcDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Increment the daily report quota counter for an API key.
 * Resets automatically when the UTC date changes.
 * Logs warnings at 80% and 98% thresholds.
 */
export function incrementReportQuota(apiKey: string): void {
  const today = utcDateString()
  const kid = keyId(apiKey)
  let entry = reportQuota.get(apiKey)

  if (!entry || entry.date !== today) {
    entry = { count: 0, date: today }
    reportQuota.set(apiKey, entry)
  }

  entry.count++

  if (entry.count === QUOTA_WARNING_THRESHOLD) {
    log.warn(`[RateLimit] API key ...${kid} at 80% of daily report quota (${QUOTA_WARNING_THRESHOLD}/${DAILY_REPORT_QUOTA_LIMIT})`)
  } else if (entry.count === QUOTA_SOFT_HALT_THRESHOLD) {
    log.error(`[RateLimit] API key ...${kid} approaching daily report limit (${QUOTA_SOFT_HALT_THRESHOLD}/${DAILY_REPORT_QUOTA_LIMIT}) — skipping non-critical reports`)
  }
}

/**
 * Check if the daily report quota is exhausted for an API key.
 * Returns true if count >= QUOTA_SOFT_HALT_THRESHOLD (220).
 */
export function isReportQuotaExhausted(apiKey: string): boolean {
  const today = utcDateString()
  const entry = reportQuota.get(apiKey)
  if (!entry || entry.date !== today) return false
  return entry.count >= QUOTA_SOFT_HALT_THRESHOLD
}

/**
 * Get current report quota usage for an API key.
 * Returns an immutable snapshot.
 */
export function getReportQuotaUsage(apiKey: string): ReportQuotaInfo {
  const today = utcDateString()
  const entry = reportQuota.get(apiKey)
  if (!entry || entry.date !== today) {
    return { used: 0, limit: DAILY_REPORT_QUOTA_LIMIT, date: today, exhausted: false }
  }
  return {
    used: entry.count,
    limit: DAILY_REPORT_QUOTA_LIMIT,
    date: entry.date,
    exhausted: entry.count >= QUOTA_SOFT_HALT_THRESHOLD,
  }
}

/**
 * Get all API keys that have report quota usage today.
 * Used for cron summary logging.
 */
export function getAllReportQuotaUsage(): Map<string, ReportQuotaInfo> {
  const today = utcDateString()
  const result = new Map<string, ReportQuotaInfo>()
  for (const [apiKey, entry] of reportQuota) {
    if (entry.date === today) {
      result.set(apiKey, {
        used: entry.count,
        limit: DAILY_REPORT_QUOTA_LIMIT,
        date: entry.date,
        exhausted: entry.count >= QUOTA_SOFT_HALT_THRESHOLD,
      })
    }
  }
  return result
}

/** Reset quota for testing purposes only. */
export function _resetReportQuota(): void {
  reportQuota.clear()
}

// ---------------------------------------------------------------------------
// Queue internals
// ---------------------------------------------------------------------------

interface QueueItem {
  execute: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

// Key format: `${apiKeyHash}:${tier}`
const queues = new Map<string, QueueItem[]>()
const processing = new Map<string, boolean>()
const lastRequestTime = new Map<string, number>()

// Cleanup timers for empty queues
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

// TTL for lastRequestTime entries (5 min) — prevents stale state in warm Vercel functions
const LAST_REQUEST_TTL_MS = 300_000

// Delay before removing empty queue entries from Map
const QUEUE_CLEANUP_DELAY_MS = 60_000

function queueKey(apiKey: string, tier: RateTier): string {
  return `${apiKey}:${tier}`
}

function keyId(apiKey: string): string {
  return apiKey.slice(-8)
}

async function processQueue(key: string, tier: RateTier): Promise<void> {
  if (processing.get(key)) return
  processing.set(key, true)

  const interval = TIER_INTERVALS[tier]
  const queue = queues.get(key)

  while (queue && queue.length > 0) {
    const item = queue.shift()!

    // Enforce minimum interval between requests of the same tier
    const lastTime = lastRequestTime.get(key) || 0
    const elapsed = Date.now() - lastTime
    if (elapsed < interval) {
      const waitMs = interval - elapsed
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }

    lastRequestTime.set(key, Date.now())

    try {
      const result = await item.execute()
      item.resolve(result)
    } catch (error) {
      item.reject(error)
    }
  }

  processing.set(key, false)

  // Schedule cleanup of empty queue entry after 60s
  scheduleCleanup(key)
}

function scheduleCleanup(key: string): void {
  // Cancel any existing cleanup timer
  const existing = cleanupTimers.get(key)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    const queue = queues.get(key)
    if (!queue || queue.length === 0) {
      queues.delete(key)
      processing.delete(key)
    }

    // Clean up lastRequestTime if stale
    const lastTime = lastRequestTime.get(key)
    if (lastTime && Date.now() - lastTime > LAST_REQUEST_TTL_MS) {
      lastRequestTime.delete(key)
    }

    cleanupTimers.delete(key)
  }, QUEUE_CLEANUP_DELAY_MS)

  cleanupTimers.set(key, timer)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a Klaviyo API request to be rate-limited per API key and tier.
 *
 * Requests to different tiers for the same API key run in parallel.
 * Requests to the same tier for the same API key are serialized with
 * the appropriate interval between them.
 *
 * For XS-tier (reporting) requests: increments the daily quota counter
 * and enforces a soft halt at 220 calls/day. Pass `force: true` to
 * bypass the halt (e.g. for user-triggered refresh).
 */
export function enqueueKlaviyoRequest<T>(
  apiKey: string,
  fn: () => Promise<T>,
  endpoint: string,
  options?: { force?: boolean }
): Promise<T> {
  const tier = classifyEndpoint(endpoint)
  const key = queueKey(apiKey, tier)

  // AK-2: Soft halt for XS (reporting) tier when daily quota is exhausted
  if (tier === "XS" && !options?.force && isReportQuotaExhausted(apiKey)) {
    log.warn(`[RateLimiter] Daily quota exhausted for key ...${keyId(apiKey)} — returning null for ${endpoint}`)
    return Promise.resolve(null as T)
  }

  // AK-2: Increment quota counter for XS (reporting) tier
  if (tier === "XS") {
    incrementReportQuota(apiKey)
  }

  return new Promise<T>((resolve, reject) => {
    if (!queues.has(key)) {
      queues.set(key, [])
    }

    const queue = queues.get(key)!
    const queueLength = queue.length

    if (queueLength > 0 && queueLength % 10 === 0) {
      log.info(`[RateLimiter] Queue depth for key ...${keyId(apiKey)} [${tier}]: ${queueLength}`)
    }

    log.debug(`[RateLimiter] Enqueue ...${keyId(apiKey)} [${tier}] ${endpoint} (interval=${TIER_INTERVALS[tier]}ms)`)

    queue.push({
      execute: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    })

    // Cancel any pending cleanup since we have new work
    const cleanupTimer = cleanupTimers.get(key)
    if (cleanupTimer) {
      clearTimeout(cleanupTimer)
      cleanupTimers.delete(key)
    }

    processQueue(key, tier)
  })
}

/**
 * Process multiple stores with limited concurrency.
 * Instead of Promise.all (which fires everything at once),
 * this processes at most `concurrency` stores simultaneously.
 */
export async function withConcurrencyLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index])
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  )

  await Promise.all(workers)
  return results
}
