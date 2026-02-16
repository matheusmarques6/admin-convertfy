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
  log.info("Fetching metrics...")

  const response = await klaviyoRequest<{
    data: KlaviyoMetric[]
  }>(apiKey, "/metrics/?page[size]=100")

  if (!response?.data) return null

  const metrics = response.data
  log.info(`Total metrics: ${metrics.length}`)

  // Log all metrics for debugging
  metrics.forEach(m => {
    log.debug(`Metric: ${m.attributes.name} (${m.id}) - Integration: ${m.attributes.integration?.name || 'none'}`)
  })

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

  if (match) {
    log.info(`Using metric: ${match.attributes.name} (${match.id})`)
    return match.id
  }

  log.info("No Placed Order metric found")
  return null
}
