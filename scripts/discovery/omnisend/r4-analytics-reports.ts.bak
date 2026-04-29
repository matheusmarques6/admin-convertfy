/**
 * TEMPORARY — Omnisend Discovery Round 4 (CRITICAL)
 *
 * Descoberta do Ryan: existe um endpoint /api/analytics/REPORTS distinto
 * de /api/analytics/STATISTICS. R1 testou ambos GET e POST mas:
 *   - GET caiu em notFounds
 *   - POST nao apareceu nem nos 200s, nem nos 404s, nem nos detailedErrors
 *     (slice(0,40) cortou os 43 errors finais)
 *
 * Doc oficial confirma:
 *   POST /api/analytics/reports
 *   "Returns aggregated marketing analytics grouped by message send date"
 *   "Covers delivery, engagement, and revenue attribution metrics for
 *    campaigns and automations"
 *   "Supports optional dimensions (timestamp, channel, activity), filters,
 *    and up to 4 queries per request"
 *
 * Este round testa esse endpoint com 14 variacoes para descobrir o nome
 * correto da dimension de breakdown por campanha/automation.
 *
 * Auth: Bearer + Omnisend-Version (scope `analytics.read`).
 * Rate limit: 5s entre calls pra nao queimar burst budget.
 *
 * Apagar depois.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"

export const maxDuration = 300
export const dynamic = "force-dynamic"

interface FetchResult {
  category: string
  label: string
  body: Record<string, unknown>
  status: number
  responseFull: string
  responseKeys: string[]
  latencyMs: number
}

async function callReports(
  apiKey: string,
  category: string,
  label: string,
  body: Record<string, unknown>,
): Promise<FetchResult> {
  const start = Date.now()
  try {
    const res = await fetch("https://api.omnisend.com/api/analytics/reports", {
      method: "POST",
      headers: {
        "Authorization": `Omnisend-API-Key ${apiKey}`,
        "Omnisend-Version": "2026-preview",
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const responseFull = await res.text()
    let responseKeys: string[] = []
    try {
      const parsed = JSON.parse(responseFull)
      if (parsed && typeof parsed === "object") {
        responseKeys = Array.isArray(parsed) ? [`array(${parsed.length})`] : Object.keys(parsed)
      }
    } catch { /* not json */ }
    return {
      category,
      label,
      body,
      status: res.status,
      responseFull,
      responseKeys,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      category,
      label,
      body,
      status: 0,
      responseFull: err instanceof Error ? err.message : String(err),
      responseKeys: [],
      latencyMs: Date.now() - start,
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function GET(request: NextRequest) {
  const uc = await createClient()
  await requireAuth(uc)

  const storeId = request.nextUrl.searchParams.get("store_id")
  if (!storeId) {
    return NextResponse.json({ error: "store_id query param required" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: store } = await admin
    .from("client_stores")
    .select("id, store_name, org_id")
    .eq("id", storeId)
    .single()
  if (!store) return NextResponse.json({ error: "store not found" }, { status: 404 })

  const creds = await getStoreCredentials(storeId, store.org_id)
  const apiKey = creds.omnisend_api_key
  if (!apiKey) return NextResponse.json({ error: "omnisend key not configured" }, { status: 404 })

  const from = "2026-03-30T00:00:00Z"
  const to = "2026-04-29T23:59:59Z"
  const dateRange = { from, to }

  const baseRevenueMetrics = [
    { name: "totalRevenue" },
    { name: "totalOrders" },
    { name: "attributedRevenue" },
    { name: "attributedOrders" },
  ]

  const results: FetchResult[] = []
  // 5s entre calls para evitar burst rate limit (R1 queimou com 67 reqs)
  const DELAY = 5000

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1 — Validation: existe? Query minima sem dimension
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P1_validation", "T1: query minima sem dimension", {
    queries: [{ alias: "test", metrics: baseRevenueMetrics, dateRange }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2 — Dimensions DOCUMENTADAS (timestamp, channel, activity)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P2_documented_dim", "T2a: dim:timestamp", {
    queries: [{
      alias: "ts",
      metrics: baseRevenueMetrics,
      dateRange,
      dimensions: [{ name: "timestamp", granularity: "day" }],
    }],
  }))
  await sleep(DELAY)

  results.push(await callReports(apiKey, "P2_documented_dim", "T2b: dim:channel", {
    queries: [{
      alias: "chan",
      metrics: baseRevenueMetrics,
      dateRange,
      dimensions: [{ name: "channel" }],
    }],
  }))
  await sleep(DELAY)

  results.push(await callReports(apiKey, "P2_documented_dim", "T2c: dim:activity", {
    queries: [{
      alias: "act",
      metrics: baseRevenueMetrics,
      dateRange,
      dimensions: [{ name: "activity" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3 — Dimensions HIPOTÉTICAS para breakdown por campanha/automation
  // (testa varias formas — qualquer 200 ou 400 com mensagem util ajuda)
  // ═══════════════════════════════════════════════════════════════════
  const hypotheticalDims = [
    "campaign", "workflow", "automation",
    "messageType", "messageID", "campaignID", "automationID",
    "message", "type",
  ]
  for (const dim of hypotheticalDims) {
    results.push(await callReports(apiKey, "P3_hypothetical_dim", `T3-dim:${dim}`, {
      queries: [{
        alias: "r",
        metrics: baseRevenueMetrics,
        dateRange,
        dimensions: [{ name: dim }],
      }],
    }))
    await sleep(DELAY)
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4 — Engagement metrics (sent, delivered, opened, clicked, bounced)
  // O R3 ja confirmou que esses NAO existem no /statistics. E no /reports?
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P4_engagement_metrics", "T4: engagement metrics sem dim", {
    queries: [{
      alias: "eng",
      metrics: [
        { name: "sent" },
        { name: "delivered" },
        { name: "opened" },
        { name: "clicked" },
        { name: "bounced" },
        { name: "unsubscribed" },
      ],
      dateRange,
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5 — Multi-query (campaign + workflow simultaneo)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P5_multiquery", "T5: 2 queries — campaign + workflow", {
    queries: [
      {
        alias: "campaigns",
        metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
        dateRange,
        dimensions: [{ name: "campaign" }],
      },
      {
        alias: "workflows",
        metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
        dateRange,
        dimensions: [{ name: "workflow" }],
      },
    ],
  }))

  // ═══════════════════════════════════════════════════════════════════
  // Aggregation
  // ═══════════════════════════════════════════════════════════════════
  const byStatus: Record<string, number> = {}
  for (const r of results) {
    const k = r.status === 0 ? "error" : String(r.status)
    byStatus[k] = (byStatus[k] || 0) + 1
  }

  // Highlight: hits 200 com rows ou body de erro 400 com mensagem informativa
  const promising = results.filter((r) => {
    if (r.status === 200) return true
    if (r.status === 400 || r.status === 422) {
      // erros 400 com mensagem podem revelar nomes corretos das dimensions
      const lower = r.responseFull.toLowerCase()
      return lower.includes("dimension") || lower.includes("unsupported")
        || lower.includes("invalid") || lower.includes("required")
    }
    return false
  })

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    summary: {
      totalTests: results.length,
      byStatus,
      promising: promising.length,
    },
    promising,
    results,
  })
}
