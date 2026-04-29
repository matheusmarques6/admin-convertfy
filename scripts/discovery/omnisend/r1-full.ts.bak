/**
 * TEMPORARY — Omnisend Discovery Agressivo
 *
 * Testa ~100 variacoes em paralelo para descobrir:
 *   - Breakdown Campaigns vs Automations na Statistics API (dimension/filter)
 *   - Revenue por campanha individual (endpoint novo)
 *   - Revenue por automation individual (endpoint novo)
 *   - Stats de automation (nao achamos antes)
 *   - Endpoints Reports/Analytics nao descobertos
 *
 * Uso:
 *   GET /api/dev/omnisend-discovery-full?store_id=<uuid>
 *   Requer auth admin (requireAuth da sessao)
 *
 * Output: JSON estruturado com summary + hits (200s) + errors.
 * Apagar depois.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"

export const maxDuration = 300
export const dynamic = "force-dynamic"

interface FetchResult {
  status: number
  responseText: string
  responseKeys: string[]
  latencyMs: number
  error?: string
}

interface TestCase {
  category: string
  label: string
  method: "GET" | "POST"
  path: string
  body?: Record<string, unknown>
  version?: string
  authStyle?: "bearer" | "xapikey" | "both"
}

async function runTest(apiKey: string, test: TestCase): Promise<FetchResult & { test: TestCase }> {
  const start = Date.now()
  const url = test.path.startsWith("http") ? test.path : `https://api.omnisend.com${test.path}`
  const version = test.version || "2026-preview"
  const authStyle = test.authStyle || "bearer"

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Omnisend-Version": version,
  }
  if (authStyle === "bearer" || authStyle === "both") {
    headers["Authorization"] = `Omnisend-API-Key ${apiKey}`
  }
  if (authStyle === "xapikey" || authStyle === "both") {
    headers["X-API-KEY"] = apiKey
  }

  try {
    const res = await fetch(url, {
      method: test.method,
      headers,
      ...(test.body && { body: JSON.stringify(test.body) }),
      signal: AbortSignal.timeout(10_000),
    })
    const responseText = await res.text()
    let responseKeys: string[] = []
    try {
      const parsed = JSON.parse(responseText)
      if (parsed && typeof parsed === "object") {
        responseKeys = Array.isArray(parsed) ? [`array(${parsed.length})`] : Object.keys(parsed)
      }
    } catch { /* not json */ }
    return {
      test,
      status: res.status,
      responseText: responseText.slice(0, 1200),
      responseKeys,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      test,
      status: 0,
      responseText: "",
      responseKeys: [],
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function runBatch(apiKey: string, tests: TestCase[], concurrency = 5): Promise<Array<FetchResult & { test: TestCase }>> {
  const results: Array<FetchResult & { test: TestCase }> = []
  for (let i = 0; i < tests.length; i += concurrency) {
    const batch = tests.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map((t) => runTest(apiKey, t)))
    results.push(...batchResults)
    // Throttle: 400 req/min = ~150ms por request em paralelo. Com concurrency=5, ~750ms por batch.
    await new Promise((r) => setTimeout(r, 400))
  }
  return results
}

function buildTests(campaignId: string, automationId: string): TestCase[] {
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date().toISOString()
  const STATS_URL = "/api/analytics/statistics"
  const baseMetrics = [
    { name: "totalRevenue" },
    { name: "totalOrders" },
    { name: "attributedRevenue" },
    { name: "attributedOrders" },
  ]
  const baseDateRange = { from, to }

  const tests: TestCase[] = []

  // ── A) Statistics — dimension variations ──
  const dimNames = [
    "campaign", "workflow", "automation", "message", "messageType",
    "messageSource", "source", "sourceType", "channel", "type",
    "campaignType", "flow", "trigger", "attribution", "attributedMessageType",
    "attributedMessage", "attributedChannel", "attributedSource", "platform",
  ]
  for (const dim of dimNames) {
    tests.push({
      category: "A_statistics_dimensions",
      label: `dim:${dim}`,
      method: "POST",
      path: STATS_URL,
      body: {
        queries: [{
          alias: "r",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          dimensions: [{ name: dim }],
        }],
      },
    })
    // combo com timestamp
    tests.push({
      category: "A_statistics_dimensions",
      label: `dim:timestamp+${dim}`,
      method: "POST",
      path: STATS_URL,
      body: {
        queries: [{
          alias: "r",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          dimensions: [
            { name: "timestamp", granularity: "day" },
            { name: dim },
          ],
        }],
      },
    })
  }

  // ── B) Statistics — filter variations (string e object) ──
  const filterCandidates = [
    { label: "eq-messageType-campaign", filter: "equals(messageType,'campaign')" },
    { label: "eq-messageType-automation", filter: "equals(messageType,'automation')" },
    { label: "eq-messageType-workflow", filter: "equals(messageType,'workflow')" },
    { label: "eq-type-campaign", filter: "equals(type,'campaign')" },
    { label: "eq-source-campaign", filter: "equals(source,'campaign')" },
    { label: "eq-channel-email", filter: "equals(channel,'email')" },
    { label: "eq-campaignType-email", filter: "equals(campaignType,'email')" },
  ]
  for (const f of filterCandidates) {
    tests.push({
      category: "B_statistics_filter_string",
      label: f.label,
      method: "POST",
      path: STATS_URL,
      body: {
        queries: [{
          alias: "r",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          dimensions: [{ name: "timestamp", granularity: "day" }],
          filter: f.filter,
        }],
      },
    })
  }
  // filter como array/object
  tests.push({
    category: "B_statistics_filter_object",
    label: "array-object",
    method: "POST",
    path: STATS_URL,
    body: {
      queries: [{
        alias: "r",
        metrics: baseMetrics,
        dateRange: baseDateRange,
        dimensions: [{ name: "timestamp", granularity: "day" }],
        filter: [{ field: "messageType", operator: "equals", value: "campaign" }],
      }],
    },
  })
  tests.push({
    category: "B_statistics_filter_object",
    label: "object-simple",
    method: "POST",
    path: STATS_URL,
    body: {
      queries: [{
        alias: "r",
        metrics: baseMetrics,
        dateRange: baseDateRange,
        dimensions: [{ name: "timestamp", granularity: "day" }],
        filter: { messageType: "campaign" },
      }],
    },
  })

  // ── C) Statistics — múltiplas queries (duas aliases com filtros diferentes) ──
  tests.push({
    category: "C_statistics_multi_query",
    label: "two-queries-messageType",
    method: "POST",
    path: STATS_URL,
    body: {
      queries: [
        {
          alias: "campaigns",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          filter: "equals(messageType,'campaign')",
        },
        {
          alias: "automations",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          filter: "equals(messageType,'automation')",
        },
      ],
    },
  })
  tests.push({
    category: "C_statistics_multi_query",
    label: "two-queries-by-type",
    method: "POST",
    path: STATS_URL,
    body: {
      queries: [
        {
          alias: "c",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          dimensions: [{ name: "type" }],
        },
      ],
    },
  })

  // ── D) Statistics — metrics alternativos ──
  const altMetrics = [
    "campaignRevenue", "automationRevenue", "workflowRevenue",
    "campaignOrders", "automationOrders",
    "totalCampaignRevenue", "totalAutomationRevenue",
    "messagesSent", "messagesDelivered", "messagesOpened", "messagesClicked",
    "revenuePerCampaign", "revenuePerAutomation",
    "uniqueOpeners", "uniqueClickers",
    "subscribers", "unsubscribes", "bounceRate",
  ]
  for (const m of altMetrics) {
    tests.push({
      category: "D_statistics_alt_metrics",
      label: `metric:${m}`,
      method: "POST",
      path: STATS_URL,
      body: {
        queries: [{
          alias: "r",
          metrics: [{ name: m }],
          dateRange: baseDateRange,
          dimensions: [{ name: "timestamp", granularity: "day" }],
        }],
      },
    })
  }

  // ── E) Reports endpoints (paths candidatos) ──
  const reportPaths = [
    "/api/reports/sales",
    "/api/reports/revenue",
    "/api/reports/campaigns",
    "/api/reports/automations",
    "/api/reports/overview",
    "/api/reports/channels",
    "/api/reports/marketing-activity",
    "/api/reports/channel-performance",
    "/api/reports/performance",
    "/api/reports/breakdown",
    "/api/reports/analytics",
    "/api/reports",
  ]
  for (const p of reportPaths) {
    tests.push({ category: "E_reports", label: `GET ${p}`, method: "GET", path: p })
    tests.push({
      category: "E_reports",
      label: `POST ${p}`,
      method: "POST",
      path: p,
      body: {
        dateRange: baseDateRange,
        metrics: ["totalRevenue", "attributedRevenue"],
      },
    })
  }

  // ── F) Analytics endpoints (paths alternativos) ──
  const analyticsPaths = [
    "/api/analytics/revenue",
    "/api/analytics/campaigns",
    "/api/analytics/automations",
    "/api/analytics/breakdown",
    "/api/analytics/sales",
    "/api/analytics/reports",
    "/api/analytics/summary",
    "/api/analytics/overview",
    "/api/analytics/segments",
    "/api/analytics/events",
    "/api/analytics/attribution",
  ]
  for (const p of analyticsPaths) {
    tests.push({ category: "F_analytics", label: `GET ${p}`, method: "GET", path: p })
    tests.push({
      category: "F_analytics",
      label: `POST ${p}`,
      method: "POST",
      path: p,
      body: {
        queries: [{
          alias: "r",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          dimensions: [{ name: "timestamp", granularity: "day" }],
        }],
      },
    })
  }

  // ── G) Campaign detail — endpoints que podem ter revenue ──
  if (campaignId) {
    const campaignDetailPaths = [
      `/api/campaigns/${campaignId}`,
      `/api/campaigns/${campaignId}/statistics`,
      `/api/campaigns/${campaignId}/analytics`,
      `/api/campaigns/${campaignId}/revenue`,
      `/api/campaigns/${campaignId}/metrics`,
      `/api/campaigns/${campaignId}/performance`,
      `/api/campaigns/${campaignId}/stats`,
      `/api/campaigns/${campaignId}/report`,
      `/v3/campaigns/${campaignId}/statistics`,
      `/v3/campaigns/${campaignId}/analytics`,
      `/v3/campaigns/${campaignId}/revenue`,
      `/v3/campaigns/${campaignId}/metrics`,
      `/v3/campaigns/${campaignId}/stats`,
      `/v5/campaigns/${campaignId}/statistics`,
      `/v5/campaigns/${campaignId}/analytics`,
      `/v5/campaigns/${campaignId}/revenue`,
      `/v5/campaigns/${campaignId}/metrics`,
      `/v5/campaigns/${campaignId}/stats`,
      // query params em /v3/campaigns/{id}
      `/v3/campaigns/${campaignId}?expand=revenue`,
      `/v3/campaigns/${campaignId}?expand=statistics`,
      `/v3/campaigns/${campaignId}?include=revenue`,
      `/v3/campaigns/${campaignId}?include=stats`,
      `/v3/campaigns/${campaignId}?fields=revenue,totalRevenue,statistics`,
    ]
    for (const p of campaignDetailPaths) {
      tests.push({ category: "G_campaign_detail", label: `GET ${p}`, method: "GET", path: p })
    }
    // Campaign detail com X-API-KEY (alguns endpoints legados exigem)
    tests.push({
      category: "G_campaign_detail",
      label: `GET /v3/campaigns/${campaignId} [xapikey]`,
      method: "GET",
      path: `/v3/campaigns/${campaignId}`,
      authStyle: "xapikey",
    })
  }

  // ── H) Automation detail — stats/revenue ──
  if (automationId) {
    const automationDetailPaths = [
      `/api/automations/${automationId}`,
      `/api/automations/${automationId}/statistics`,
      `/api/automations/${automationId}/analytics`,
      `/api/automations/${automationId}/revenue`,
      `/api/automations/${automationId}/metrics`,
      `/api/automations/${automationId}/performance`,
      `/api/automations/${automationId}/stats`,
      `/api/automations/${automationId}/report`,
      `/v5/automations/${automationId}`,
      `/v5/automations/${automationId}/statistics`,
      `/v5/automations/${automationId}/analytics`,
      `/v5/automations/${automationId}/revenue`,
      `/v5/automations/${automationId}/metrics`,
      `/v5/automations/${automationId}/stats`,
      `/v5/automations/${automationId}/report`,
      `/v3/automations/${automationId}`,
      `/v3/automations/${automationId}/statistics`,
      `/v3/workflows/${automationId}`,
      `/v3/workflows/${automationId}/statistics`,
    ]
    for (const p of automationDetailPaths) {
      tests.push({ category: "H_automation_detail", label: `GET ${p}`, method: "GET", path: p })
    }
  }

  // ── I) Events / Orders / Attribution ──
  const eventPaths = [
    "/api/events",
    "/api/events/query",
    "/api/events/aggregate",
    "/api/orders",
    "/api/orders/query",
    "/api/conversions",
    "/api/revenue",
    "/v3/events",
    "/v5/events",
  ]
  for (const p of eventPaths) {
    tests.push({ category: "I_events_orders", label: `GET ${p}`, method: "GET", path: p })
    tests.push({
      category: "I_events_orders",
      label: `POST ${p}`,
      method: "POST",
      path: p,
      body: { dateRange: baseDateRange, filter: "equals(eventName,'placed order')" },
    })
  }

  // ── J) Campaigns list com expand/include (revenue inline) ──
  tests.push({
    category: "J_list_expansions",
    label: "GET /v5/campaigns?expand=statistics",
    method: "GET",
    path: "/v5/campaigns?limit=2&expand=statistics",
  })
  tests.push({
    category: "J_list_expansions",
    label: "GET /v5/campaigns?include=stats",
    method: "GET",
    path: "/v5/campaigns?limit=2&include=stats",
  })
  tests.push({
    category: "J_list_expansions",
    label: "GET /v5/campaigns?fields=stats,revenue",
    method: "GET",
    path: "/v5/campaigns?limit=2&fields=stats,revenue",
  })
  tests.push({
    category: "J_list_expansions",
    label: "GET /api/campaigns",
    method: "GET",
    path: "/api/campaigns?limit=2",
  })
  tests.push({
    category: "J_list_expansions",
    label: "GET /v5/automations?expand=statistics",
    method: "GET",
    path: "/v5/automations?limit=2&expand=statistics",
  })
  tests.push({
    category: "J_list_expansions",
    label: "GET /api/automations",
    method: "GET",
    path: "/api/automations?limit=2",
  })

  // ── K) Version variations (tenta versoes alternativas em /api/analytics/statistics) ──
  for (const v of ["2026-03-15", "2025-07-15", "2026-01-01", "2026-10-15"]) {
    tests.push({
      category: "K_version_variations",
      label: `version:${v}`,
      method: "POST",
      path: STATS_URL,
      version: v,
      body: {
        queries: [{
          alias: "r",
          metrics: baseMetrics,
          dateRange: baseDateRange,
          dimensions: [{ name: "timestamp", granularity: "day" }],
        }],
      },
    })
  }

  return tests
}

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

  // Pega um campaignId + automationId de exemplo pra endpoints que precisam.
  let campaignId = ""
  let automationId = ""
  try {
    const campRes = await fetch("https://api.omnisend.com/v5/campaigns?limit=1", {
      headers: {
        "Authorization": `Omnisend-API-Key ${apiKey}`,
        "Omnisend-Version": "2026-03-15",
        "Accept": "application/json",
      },
    })
    if (campRes.ok) {
      const json = await campRes.json() as { campaigns?: Array<{ id?: string; campaignID?: string }> }
      campaignId = json.campaigns?.[0]?.id || json.campaigns?.[0]?.campaignID || ""
    }
    const autoRes = await fetch("https://api.omnisend.com/v5/automations?limit=1", {
      headers: {
        "Authorization": `Omnisend-API-Key ${apiKey}`,
        "Omnisend-Version": "2026-03-15",
        "Accept": "application/json",
      },
    })
    if (autoRes.ok) {
      const json = await autoRes.json() as { automations?: Array<{ id?: string; automationID?: string }> }
      automationId = json.automations?.[0]?.id || json.automations?.[0]?.automationID || ""
    }
  } catch { /* ignore */ }

  const tests = buildTests(campaignId, automationId)
  const startTime = Date.now()
  const results = await runBatch(apiKey, tests, 5)
  const totalDuration = Date.now() - startTime

  // Agregacao de metricas
  const byStatus: Record<string, number> = {}
  for (const r of results) {
    const key = r.status === 0 ? "error" : String(r.status)
    byStatus[key] = (byStatus[key] || 0) + 1
  }

  // hits = respostas 200 com dados
  const hits = results
    .filter((r) => r.status === 200)
    .map((r) => ({
      category: r.test.category,
      label: r.test.label,
      method: r.test.method,
      path: r.test.path,
      body: r.test.body,
      version: r.test.version || "2026-preview",
      authStyle: r.test.authStyle || "bearer",
      status: r.status,
      responseKeys: r.responseKeys,
      responsePreview: r.responseText.slice(0, 800),
      latencyMs: r.latencyMs,
    }))

  // erros com body detalhado (400/422 podem dar dica)
  const detailedErrors = results
    .filter((r) => r.status >= 400 && r.status < 500 && r.status !== 404)
    .slice(0, 40)
    .map((r) => ({
      category: r.test.category,
      label: r.test.label,
      method: r.test.method,
      path: r.test.path,
      status: r.status,
      body: r.responseText.slice(0, 500),
    }))

  // 404s (pra confirmar o que definitivamente nao existe)
  const notFounds = results
    .filter((r) => r.status === 404)
    .map((r) => `${r.test.method} ${r.test.path} [${r.test.label}]`)

  return NextResponse.json({
    store: {
      id: store.id,
      name: store.store_name,
    },
    campaignId,
    automationId,
    summary: {
      totalTests: tests.length,
      byStatus,
      totalDurationMs: totalDuration,
      hits: hits.length,
      detailedErrors: detailedErrors.length,
      notFounds: notFounds.length,
    },
    hits,
    detailedErrors,
    notFounds,
  })
}
