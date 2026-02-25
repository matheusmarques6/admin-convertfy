/**
 * Global Klaviyo Rate Limiter
 *
 * Ensures all outgoing Klaviyo API requests are throttled globally per API key,
 * preventing rate limit (429) errors when multiple stores/routes fetch data
 * simultaneously.
 *
 * Uses a queue-based approach: requests are enqueued and processed one at a time
 * per API key with a minimum interval between them.
 *
 * Klaviyo rate limits (from docs):
 * - Reporting endpoints (POST /campaign-values-reports, /flow-values-reports, /metric-aggregates):
 *   1 request/second burst, lower steady rate
 * - General endpoints (GET /campaigns, /flows, /metrics, /accounts):
 *   3 requests/second burst, 75/min steady
 */
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoRateLimiter")

// Minimum ms between requests per API key
const MIN_INTERVAL_MS = 1200 // ~50 req/min, safely under Klaviyo's 75/min steady limit

interface QueueItem {
  execute: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

// Per-API-key queues (use last 8 chars of key as identifier for logging)
const queues = new Map<string, QueueItem[]>()
const processing = new Map<string, boolean>()
const lastRequestTime = new Map<string, number>()

function keyId(apiKey: string): string {
  return apiKey.slice(-8)
}

async function processQueue(apiKey: string): Promise<void> {
  if (processing.get(apiKey)) return
  processing.set(apiKey, true)

  const queue = queues.get(apiKey)
  while (queue && queue.length > 0) {
    const item = queue.shift()!

    // Enforce minimum interval between requests
    const lastTime = lastRequestTime.get(apiKey) || 0
    const elapsed = Date.now() - lastTime
    if (elapsed < MIN_INTERVAL_MS) {
      const waitMs = MIN_INTERVAL_MS - elapsed
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }

    lastRequestTime.set(apiKey, Date.now())

    try {
      const result = await item.execute()
      item.resolve(result)
    } catch (error) {
      item.reject(error)
    }
  }

  processing.set(apiKey, false)
}

/**
 * Enqueue a Klaviyo API request to be rate-limited per API key.
 * All requests for the same key are serialized with MIN_INTERVAL_MS between them.
 */
export function enqueueKlaviyoRequest<T>(
  apiKey: string,
  fn: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!queues.has(apiKey)) {
      queues.set(apiKey, [])
    }

    const queue = queues.get(apiKey)!
    const queueLength = queue.length

    if (queueLength > 0 && queueLength % 10 === 0) {
      log.info(`[RateLimiter] Queue depth for key ...${keyId(apiKey)}: ${queueLength}`)
    }

    queue.push({
      execute: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    })

    processQueue(apiKey)
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
