/**
 * Klaviyo Metrics helpers - find Placed Order metric ID.
 */

import { klaviyoRequest } from "./client"

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
  console.log("[Klaviyo] Fetching metrics...")

  const response = await klaviyoRequest<{
    data: KlaviyoMetric[]
  }>(apiKey, "/metrics/?page[size]=100")

  if (!response?.data) return null

  const metrics = response.data
  console.log(`[Klaviyo] Total metrics: ${metrics.length}`)

  // Log all metrics for debugging
  metrics.forEach(m => {
    console.log(`[Klaviyo] Metric: ${m.attributes.name} (${m.id}) - Integration: ${m.attributes.integration?.name || 'none'}`)
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
    console.log(`[Klaviyo] Using metric: ${match.attributes.name} (${match.id})`)
    return match.id
  }

  console.log("[Klaviyo] No Placed Order metric found")
  return null
}
