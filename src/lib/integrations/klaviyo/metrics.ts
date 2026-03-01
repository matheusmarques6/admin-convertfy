/**
 * Klaviyo Metrics helpers - find Placed Order metric ID.
 */

import { logger } from "@/lib/logger"
import { klaviyoRequest } from "./client"

const log = logger.child("KlaviyoMetrics")

// In-memory cache for metric IDs (metric IDs are stable per Klaviyo account)
const metricIdCache = new Map<string, { id: string | null; timestamp: number }>()
const METRIC_CACHE_TTL = 60 * 60 * 1000 // 1 hour

interface KlaviyoMetric {
  id: string
  attributes: {
    name: string
    integration?: { name: string }
  }
}

/**
 * Find the "Placed Order" metric ID used for revenue attribution.
 *
 * Searches for exact match first, then case-insensitive variations
 * including Portuguese ("Pedido Realizado").
 *
 * Returns null if no matching metric is found (e.g. no e-commerce integration).
 */
export async function findPlacedOrderMetric(apiKey: string): Promise<string | null> {
  // Return cached if valid
  const cached = metricIdCache.get(apiKey)
  if (cached && (Date.now() - cached.timestamp) < METRIC_CACHE_TTL) {
    log.info(`Using cached metric ID: ${cached.id}`)
    return cached.id
  }

  log.info("Fetching metrics with pagination...")

  const allMetrics: KlaviyoMetric[] = []
  // Do NOT use page[size] - Klaviyo rejects it for metrics resource
  let nextPage: string | null = "/metrics/"
  let pageCount = 0
  const maxPages = 20
  let apiCallFailed = false

  while (nextPage && pageCount < maxPages) {
    type MetricsPage = { data: KlaviyoMetric[]; links?: { next?: string } }
    const response: MetricsPage | null = await klaviyoRequest<MetricsPage>(apiKey, nextPage)

    if (!response) {
      // API error (429, timeout, auth error) — do NOT cache null
      log.warn("[PlacedOrderMetric] API call failed, not caching null result")
      apiCallFailed = true
      break
    }

    if (!response.data || response.data.length === 0) break

    allMetrics.push(...response.data)
    pageCount++

    // Check for match on each page to return early
    const match = findMatch(response.data)
    if (match) {
      log.info(`Using metric (found on page ${pageCount}): ${match.attributes.name} (${match.id})`)
      metricIdCache.set(apiKey, { id: match.id, timestamp: Date.now() })
      return match.id
    }

    const nextLink: string | undefined = response.links?.next
    if (!nextLink) break
    // Strip base URL if present to get relative path
    nextPage = nextLink.includes("://") ? nextLink.replace(/^https?:\/\/[^/]+\/api/, "") : nextLink
  }

  if (apiCallFailed) {
    // Return null but do NOT cache — next call will retry the API
    return null
  }

  // Metric genuinely not found after scanning all pages — cache the null result
  log.info(`Total metrics scanned: ${allMetrics.length} (${pageCount} pages) - No Placed Order metric found`)
  metricIdCache.set(apiKey, { id: null, timestamp: Date.now() })
  return null
}

function findMatch(metrics: KlaviyoMetric[]): KlaviyoMetric | undefined {
  // 1. Exact match (English)
  let match = metrics.find(m => m.attributes.name === "Placed Order")

  // 2. Case-insensitive variations (English + Portuguese)
  if (!match) {
    match = metrics.find(m => {
      const name = m.attributes.name.toLowerCase()
      return name === "placed order"
        || name === "order placed"
        || name === "pedido realizado"
        || name.includes("placed order")
    })
  }

  return match
}
