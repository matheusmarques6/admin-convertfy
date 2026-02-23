/**
 * Klaviyo Metrics helpers - find Placed Order metric ID.
 */

import { logger } from "@/lib/logger"
import { klaviyoRequest } from "./client"

const log = logger.child("KlaviyoMetrics")

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
  log.info("Fetching metrics with pagination...")

  const allMetrics: KlaviyoMetric[] = []
  // Do NOT use page[size] - Klaviyo rejects it for metrics resource
  let nextPage: string | null = "/metrics/"
  let pageCount = 0
  const maxPages = 20

  while (nextPage && pageCount < maxPages) {
    type MetricsPage = { data: KlaviyoMetric[]; links?: { next?: string } }
    const response: MetricsPage | null = await klaviyoRequest<MetricsPage>(apiKey, nextPage)

    if (!response?.data) break

    allMetrics.push(...response.data)
    pageCount++

    // Check for match on each page to return early
    const match = findMatch(response.data)
    if (match) {
      log.info(`Using metric (found on page ${pageCount}): ${match.attributes.name} (${match.id})`)
      return match.id
    }

    const nextLink: string | undefined = response.links?.next
    if (!nextLink) break
    // Strip base URL if present to get relative path
    nextPage = nextLink.includes("://") ? nextLink.replace(/^https?:\/\/[^/]+\/api/, "") : nextLink
  }

  log.info(`Total metrics scanned: ${allMetrics.length} (${pageCount} pages) - No Placed Order metric found`)
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
