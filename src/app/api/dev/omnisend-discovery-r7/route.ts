/**
 * TEMPORARY — Omnisend Discovery R7 (FINAL — activity dimension)
 *
 * Descoberta-chave do Ryan apos pesquisa profunda:
 *   /api/analytics/reports menciona "activity" como dimension oficial.
 *   Nunca testamos activity ISOLADO com schema 100% correto.
 *
 * R5 testou activity mas:
 *   - Junto com metrics de revenue (que nao aceita activity)
 *   - Com interval=custom (talvez aceite so last30Days/named?)
 *
 * R6 testou activity+sent mas tudo deu 429 (rate limit).
 *
 * R7 testa 5 cenarios cobrindo TODOS os gaps:
 *   A — activity SOZINHO + revenue metrics (controle, ja sabemos que da 400)
 *   B — activity SOZINHO + APENAS engagement metrics (gap do R6)
 *   C — timestamp+activity COMBO + revenue (caso seja exigido timestamp)
 *   D — filters[] com 2 queries paralelas (gap do R6)
 *   E — channel+activity + engagement (sugestao Ryan)
 *
 * Delays agressivos: 60s entre cada chamada pra nao queimar rate limit.
 * Total: 5 testes × ~30s + 4 × 60s = ~270s. Cabe em maxDuration=300.
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

  // Schema validado em R5:
  //   - dateRange.interval: 'last30Days' (camelCase, nao 'last_30_days')
  //   - revenue metrics: attributedRevenue, attributedOrders
  //   - engagement metrics: sent, opened, clicked, openedUnique, clickedUnique
  const revenueMetrics = [
    { name: "attributedRevenue" },
    { name: "attributedOrders" },
  ]
  const engagementMetrics = [
    { name: "sent" },
    { name: "opened" },
    { name: "clicked" },
    { name: "openedUnique" },
    { name: "clickedUnique" },
  ]

  const results: FetchResult[] = []
  const DELAY = 60_000  // 60s entre cada call (rate limit defensivo)

  // ═══════════════════════════════════════════════════════════════════
  // TEST A — Hipotese principal do Ryan: activity + revenue + engagement
  // (Test A do bash original)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "A", "activity + revenue + engagement (last30Days)", {
    queries: [{
      alias: "by_activity",
      metrics: [...revenueMetrics, ...engagementMetrics],
      dateRange: { interval: "last30Days" },
      dimensions: [{ name: "activity" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // TEST B — Activity + APENAS engagement (cobre gap do R6)
  // R5 mostrou que revenue+activity = 400. Talvez engagement+activity = 200?
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "B", "activity + engagement only", {
    queries: [{
      alias: "by_activity_eng",
      metrics: engagementMetrics,
      dateRange: { interval: "last30Days" },
      dimensions: [{ name: "activity" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // TEST C — timestamp + activity combo (caso timestamp seja obrigatorio)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "C", "timestamp + activity combo + revenue", {
    queries: [{
      alias: "by_ts_activity",
      metrics: [...revenueMetrics, ...engagementMetrics],
      dateRange: { interval: "last30Days" },
      dimensions: [
        { name: "timestamp", granularity: "day" },
        { name: "activity" },
      ],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // TEST D — filters[] com 2 queries paralelas (Test B do bash original)
  // R6 nao conseguiu testar isso (todos 429)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "D", "filters[] 2 queries — campaign + automation", {
    queries: [
      {
        alias: "campaigns_only",
        metrics: [...revenueMetrics, { name: "sent" }],
        dateRange: { interval: "last30Days" },
        filters: [
          { field: "activity", operator: "equals", value: "campaign" },
        ],
      },
      {
        alias: "automation_only",
        metrics: [...revenueMetrics, { name: "sent" }],
        dateRange: { interval: "last30Days" },
        filters: [
          { field: "activity", operator: "equals", value: "automation" },
        ],
      },
    ],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // TEST E — channel + activity (Test C do bash original)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "E", "channel + activity + engagement", {
    queries: [{
      alias: "by_chan_activity",
      metrics: engagementMetrics,
      dateRange: { interval: "last30Days" },
      dimensions: [
        { name: "channel" },
        { name: "activity" },
      ],
    }],
  }))

  // ═══════════════════════════════════════════════════════════════════
  // Aggregation
  // ═══════════════════════════════════════════════════════════════════
  const byStatus: Record<string, number> = {}
  for (const r of results) {
    const k = r.status === 0 ? "error" : String(r.status)
    byStatus[k] = (byStatus[k] || 0) + 1
  }

  // Highlight: 200s + 400s informativos
  const promising = results.filter((r) => r.status === 200)
  const errorsWithHints = results.filter((r) => {
    if (r.status !== 400) return false
    const lower = r.responseFull.toLowerCase()
    return lower.includes("dimension") || lower.includes("filter")
      || lower.includes("metric") || lower.includes("activity")
      || lower.includes("allowed") || lower.includes("supported")
  })

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    summary: {
      totalTests: results.length,
      byStatus,
      hits: promising.length,
      informativeErrors: errorsWithHints.length,
    },
    promising,
    errorsWithHints,
    results,
  })
}
