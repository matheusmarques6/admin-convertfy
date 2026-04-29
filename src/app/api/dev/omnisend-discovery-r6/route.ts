/**
 * TEMPORARY — Omnisend Discovery R6 (FINAL — engagement + filter)
 *
 * R5 confirmou:
 *   ✅ /api/analytics/reports funciona com schema correto
 *   ✅ Returna attributedRevenue €19.591,11 + engagement em UMA chamada
 *   ❌ Dimensions campaign/workflow/automation/messageType/channel/activity
 *      todas REJEITADAS para metrics de revenue (attributedRevenue etc)
 *   ⚠️ Combos timestamp+dim deram 429 — inconclusivos
 *
 * Duas hipoteses ainda nao testadas:
 *
 *   1) Dimensions REJEITADAS para revenue podem FUNCIONAR para engagement
 *      (sent, opened, clicked). Isso daria breakdown REAL de engagement
 *      por campanha (sent/opened/click count por campaign).
 *
 *   2) A doc menciona "Supports optional dimensions, FILTERS, and up to
 *      4 queries". Filtro pode ser o caminho: filter messageType=campaign
 *      em query 1, filter messageType=automation em query 2 — total
 *      separado em uma unica request.
 *
 * R6 testa essas duas em 8 cenarios.
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
  apiKey: string, category: string, label: string, body: Record<string, unknown>,
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
      category, label, body, status: res.status, responseFull, responseKeys,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      category, label, body, status: 0,
      responseFull: err instanceof Error ? err.message : String(err),
      responseKeys: [], latencyMs: Date.now() - start,
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function GET(request: NextRequest) {
  const uc = await createClient()
  await requireAuth(uc)

  const storeId = request.nextUrl.searchParams.get("store_id")
  if (!storeId) return NextResponse.json({ error: "store_id required" }, { status: 400 })

  const admin = createAdminClient()
  const { data: store } = await admin
    .from("client_stores").select("id, store_name, org_id").eq("id", storeId).single()
  if (!store) return NextResponse.json({ error: "store not found" }, { status: 404 })

  const creds = await getStoreCredentials(storeId, store.org_id)
  const apiKey = creds.omnisend_api_key
  if (!apiKey) return NextResponse.json({ error: "key missing" }, { status: 404 })

  const dateRange = {
    interval: "custom",
    from: "2026-03-30T00:00:00Z",
    to: "2026-04-29T23:59:59Z",
  }
  const engagementMetrics = [
    { name: "sent" }, { name: "opened" }, { name: "openedUnique" },
    { name: "clicked" }, { name: "clickedUnique" }, { name: "failed" },
  ]
  const revenueMetrics = [
    { name: "attributedRevenue" }, { name: "attributedOrders" },
  ]

  const results: FetchResult[] = []
  const DELAY = 6000  // 6s — mais defensivo apos 429s do R5

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1 — HIPOTESE 1: dimensions rejeitadas pra revenue
  // podem funcionar com engagement metrics
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P1_engagement_dim", "T1: dim:campaign + sent/opened/clicked", {
    queries: [{
      alias: "by_campaign",
      metrics: engagementMetrics,
      dateRange,
      dimensions: [{ name: "campaign" }],
    }],
  }))
  await sleep(DELAY)

  results.push(await callReports(apiKey, "P1_engagement_dim", "T2: dim:workflow + sent/opened/clicked", {
    queries: [{
      alias: "by_workflow",
      metrics: engagementMetrics,
      dateRange,
      dimensions: [{ name: "workflow" }],
    }],
  }))
  await sleep(DELAY)

  results.push(await callReports(apiKey, "P1_engagement_dim", "T3: dim:channel + sent (engagement)", {
    queries: [{
      alias: "by_channel",
      metrics: engagementMetrics,
      dateRange,
      dimensions: [{ name: "channel" }],
    }],
  }))
  await sleep(DELAY)

  results.push(await callReports(apiKey, "P1_engagement_dim", "T4: dim:activity + sent (engagement)", {
    queries: [{
      alias: "by_activity",
      metrics: engagementMetrics,
      dateRange,
      dimensions: [{ name: "activity" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2 — HIPOTESE 2: filters separam campaign vs automation
  // ═══════════════════════════════════════════════════════════════════
  // Tentativa A: filter como string
  results.push(await callReports(apiKey, "P2_filter_string", "T5a: filter='messageType=campaign'", {
    queries: [{
      alias: "campaigns_only",
      metrics: revenueMetrics,
      dateRange,
      filter: "messageType=campaign",
    }],
  }))
  await sleep(DELAY)

  // Tentativa B: filter como string com equals()
  results.push(await callReports(apiKey, "P2_filter_string", "T5b: filter=equals(messageType,'campaign')", {
    queries: [{
      alias: "campaigns_only",
      metrics: revenueMetrics,
      dateRange,
      filter: "equals(messageType,'campaign')",
    }],
  }))
  await sleep(DELAY)

  // Tentativa C: filter como object/array
  results.push(await callReports(apiKey, "P2_filter_object", "T5c: filter array object", {
    queries: [{
      alias: "campaigns_only",
      metrics: revenueMetrics,
      dateRange,
      filter: [{ field: "messageType", operator: "equals", value: "campaign" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3 — Multi-query com filters separando campaign vs automation
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P3_multiquery_filter", "T6: 2 queries — filter campaign vs automation", {
    queries: [
      {
        alias: "campaigns",
        metrics: revenueMetrics,
        dateRange,
        filter: "messageType=campaign",
      },
      {
        alias: "automations",
        metrics: revenueMetrics,
        dateRange,
        filter: "messageType=automation",
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

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    summary: {
      totalTests: results.length,
      byStatus,
      hits: results.filter((r) => r.status === 200).length,
    },
    results,
  })
}
