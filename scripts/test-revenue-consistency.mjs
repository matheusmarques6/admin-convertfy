/**
 * Test: Numeric Consistency — store_revenue_summary vs Klaviyo API
 *
 * Para uma loja de teste, compara o revenue no store_revenue_summary
 * com o resultado direto da Klaviyo API (flow-values-reports + campaign-values-reports).
 *
 * Uso: node scripts/test-revenue-consistency.mjs [store_id]
 *
 * Se store_id nao for fornecido, usa a primeira loja com dados no summary.
 * Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import crypto from "crypto"

config({ path: ".env.local" })

// Inline decryption (mirrors src/lib/crypto.ts)
const ENC_PREFIX = "enc:v1:"
function decryptValue(ciphertext) {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext
  const encKey = process.env.ENCRYPTION_KEY
  if (!encKey) throw new Error("ENCRYPTION_KEY not set in .env.local")
  const key = Buffer.from(encKey, "hex")
  const combined = Buffer.from(ciphertext.slice(ENC_PREFIX.length), "base64")
  const iv = combined.subarray(0, 12)
  const tag = combined.subarray(12, 28)
  const encrypted = combined.subarray(28)
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8")
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)
const KLAVIYO_API_URL = "https://a.klaviyo.com/api"

async function klaviyoRequest(apiKey, path, options = {}) {
  const url = path.startsWith("http") ? path : `${KLAVIYO_API_URL}${path}`
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: "2024-10-15",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  if (!res.ok) {
    console.error(`Klaviyo ${res.status}: ${await res.text()}`)
    return null
  }
  return res.json()
}

async function main() {
  const targetStoreId = process.argv[2]

  console.log("=== Revenue Consistency Test ===\n")

  // 1. Get a store with revenue summary data
  let query = supabase
    .from("store_revenue_summary")
    .select("store_id, period_label, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue, period_start, period_end")
    .eq("period_label", "30d")
    .order("fetched_at", { ascending: false })
    .limit(1)

  if (targetStoreId) {
    query = query.eq("store_id", targetStoreId)
  }

  const { data: summaries, error } = await query
  if (error || !summaries?.length) {
    console.error("No revenue summary data found.", error?.message)
    process.exit(1)
  }

  const summary = summaries[0]
  console.log(`Store: ${summary.store_id}`)
  console.log(`Period: ${summary.period_start} to ${summary.period_end}`)
  console.log(`Cached revenue: total=${summary.klaviyo_total_revenue} campaign=${summary.klaviyo_campaign_revenue} flow=${summary.klaviyo_flow_revenue}`)

  // 2. Get store's Klaviyo API key
  const { data: store } = await supabase
    .from("client_stores")
    .select("klaviyo_private_key, store_name")
    .eq("id", summary.store_id)
    .single()

  if (!store?.klaviyo_private_key) {
    console.error("Store has no Klaviyo API key")
    process.exit(1)
  }

  const apiKey = decryptValue(store.klaviyo_private_key)
  console.log(`Store name: ${store.store_name}\n`)

  // 3. Find Placed Order metric
  const metricsResp = await klaviyoRequest(apiKey, "/metrics/")
  const placedOrderMetric = metricsResp?.data?.find(
    (m) => m.attributes.name === "Placed Order"
  )
  if (!placedOrderMetric) {
    console.error("Could not find Placed Order metric")
    process.exit(1)
  }

  const metricId = placedOrderMetric.id
  const timeframe = {
    start: summary.period_start,
    end: summary.period_end,
  }

  // 4. Fetch flow revenue from API
  const flowResp = await klaviyoRequest(apiKey, "/flow-values-reports/", {
    method: "POST",
    body: {
      data: {
        type: "flow-values-report",
        attributes: {
          timeframe,
          conversion_metric_id: metricId,
          statistics: ["conversion_value"],
        },
      },
    },
  })

  let apiFlowRevenue = 0
  if (flowResp?.data?.attributes?.results) {
    for (const r of flowResp.data.attributes.results) {
      apiFlowRevenue += r.statistics.conversion_value || 0
    }
  }

  // 5. Fetch campaign revenue from API
  const campResp = await klaviyoRequest(apiKey, "/campaign-values-reports/", {
    method: "POST",
    body: {
      data: {
        type: "campaign-values-report",
        attributes: {
          timeframe,
          conversion_metric_id: metricId,
          statistics: ["conversion_value"],
        },
      },
    },
  })

  let apiCampaignRevenue = 0
  if (campResp?.data?.attributes?.results) {
    for (const r of campResp.data.attributes.results) {
      apiCampaignRevenue += r.statistics.conversion_value || 0
    }
  }

  const apiTotalRevenue = apiFlowRevenue + apiCampaignRevenue

  // 6. Compare
  console.log("--- API Results ---")
  console.log(`Flow revenue:     ${apiFlowRevenue.toFixed(2)}`)
  console.log(`Campaign revenue: ${apiCampaignRevenue.toFixed(2)}`)
  console.log(`Total revenue:    ${apiTotalRevenue.toFixed(2)}`)

  console.log("\n--- Cached Results ---")
  console.log(`Flow revenue:     ${Number(summary.klaviyo_flow_revenue).toFixed(2)}`)
  console.log(`Campaign revenue: ${Number(summary.klaviyo_campaign_revenue).toFixed(2)}`)
  console.log(`Total revenue:    ${Number(summary.klaviyo_total_revenue).toFixed(2)}`)

  const totalDivergence = apiTotalRevenue > 0
    ? Math.abs(apiTotalRevenue - Number(summary.klaviyo_total_revenue)) / apiTotalRevenue * 100
    : 0

  console.log(`\nDivergence: ${totalDivergence.toFixed(2)}%`)
  console.log(`\n=== Result: ${totalDivergence < 1 ? "PASS" : "FAIL"} (threshold: <1%) ===`)

  if (totalDivergence >= 1) {
    process.exit(1)
  }
}

main().catch(console.error)
