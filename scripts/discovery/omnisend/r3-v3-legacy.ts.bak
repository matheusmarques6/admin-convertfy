/**
 * TEMPORARY — Omnisend Discovery Round 3 (legacy v3 + Supermetrics hipotese)
 *
 * Hipotese: o Supermetrics extrai per-campaign stats (sent, opened, clicked,
 * bounces, revenue, orders, etc). Logo, alguma rota expoe isso.
 *
 * R1/R2 cobriram a Statistics API beta + /api/* preview. Mas:
 *   - R1 G/H paths pularam (campaignId vazio na pre-busca)
 *   - R2 testou /api/campaigns/{id} (preview, Bearer) — sem stats
 *   - Ninguem testou /v3/campaigns/{id} ISOLADO com:
 *       * APENAS X-API-KEY (auth legacy puro)
 *       * APENAS Authorization (sem X-API-KEY)
 *       * com query params alternativos
 *   - Sub-recursos /v3/{campaigns,automations}/{id}/{...} nao foram cobertos
 *   - Statistics API com `productID` (dimension documentada e nao testada)
 *
 * Total ~25 testes. Sequenciais com delay 600ms (respeita 1 RPS do /v3).
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
  method: string
  path: string
  authMode: string
  body?: unknown
  status: number
  responseFull: string
  responseKeys: string[]
  latencyMs: number
}

type AuthMode =
  | "xapikey-only"
  | "bearer-only"
  | "xapikey+version"
  | "bearer+version"
  | "all-three"

function buildHeaders(apiKey: string, mode: AuthMode, version = "2026-preview"): Record<string, string> {
  const h: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
  }
  switch (mode) {
    case "xapikey-only":
      h["X-API-KEY"] = apiKey
      break
    case "bearer-only":
      h["Authorization"] = `Omnisend-API-Key ${apiKey}`
      break
    case "xapikey+version":
      h["X-API-KEY"] = apiKey
      h["Omnisend-Version"] = version
      break
    case "bearer+version":
      h["Authorization"] = `Omnisend-API-Key ${apiKey}`
      h["Omnisend-Version"] = version
      break
    case "all-three":
      h["X-API-KEY"] = apiKey
      h["Authorization"] = `Omnisend-API-Key ${apiKey}`
      h["Omnisend-Version"] = version
      break
  }
  return h
}

async function call(
  apiKey: string,
  category: string,
  label: string,
  method: "GET" | "POST",
  path: string,
  authMode: AuthMode,
  body?: Record<string, unknown>,
  version?: string,
): Promise<FetchResult> {
  const url = `https://api.omnisend.com${path}`
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method,
      headers: buildHeaders(apiKey, authMode, version),
      ...(body && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
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
      method,
      path,
      authMode,
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
      method,
      path,
      authMode,
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

  // Pegar IDs validos via /api/campaigns (sabido que funciona com Bearer)
  const setupRes = await fetch("https://api.omnisend.com/api/campaigns?limit=3", {
    headers: buildHeaders(apiKey, "bearer+version"),
  })
  const setupJson = setupRes.ok ? await setupRes.json() as { campaigns?: Array<{ id?: string }> } : { campaigns: [] }
  const campaignId = setupJson.campaigns?.[0]?.id || ""

  const setupAutoRes = await fetch("https://api.omnisend.com/api/automations?limit=3", {
    headers: buildHeaders(apiKey, "bearer+version"),
  })
  const setupAutoJson = setupAutoRes.ok ? await setupAutoRes.json() as { automations?: Array<{ id?: string }> } : { automations: [] }
  const automationId = setupAutoJson.automations?.[0]?.id || ""

  await sleep(600)

  const results: FetchResult[] = []
  const DELAY = 600 // 1 RPS para /v3 (limite empirico documentado no client.ts)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1 — /v3/campaigns/{id} — todas as combinacoes de auth
  // (a hipotese-chave: legacy v3 com X-API-KEY puro pode ter MAIS campos)
  // ═══════════════════════════════════════════════════════════════════
  if (campaignId) {
    results.push(await call(apiKey, "P1_v3_campaign_auth", "T1A: X-API-KEY only",
      "GET", `/v3/campaigns/${campaignId}`, "xapikey-only"))
    await sleep(DELAY)

    results.push(await call(apiKey, "P1_v3_campaign_auth", "T1B: Authorization only",
      "GET", `/v3/campaigns/${campaignId}`, "bearer-only"))
    await sleep(DELAY)

    results.push(await call(apiKey, "P1_v3_campaign_auth", "T1C: X-API-KEY + Version",
      "GET", `/v3/campaigns/${campaignId}`, "xapikey+version"))
    await sleep(DELAY)

    results.push(await call(apiKey, "P1_v3_campaign_auth", "T1D: All three headers",
      "GET", `/v3/campaigns/${campaignId}`, "all-three"))
    await sleep(DELAY)
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2 — /v3/campaigns/{id} sub-recursos (clicks, opens, recipients)
  // ═══════════════════════════════════════════════════════════════════
  if (campaignId) {
    const v3Subs = ["details", "stats", "statistics", "report", "summary",
                    "links", "clicks", "opens", "recipients", "metrics", "revenue"]
    for (const sub of v3Subs) {
      results.push(await call(apiKey, "P2_v3_campaign_subres", `GET /v3/campaigns/{id}/${sub}`,
        "GET", `/v3/campaigns/${campaignId}/${sub}`, "xapikey-only"))
      await sleep(DELAY)
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3 — /v3/campaigns lista (pode ter stats inline)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await call(apiKey, "P3_v3_campaign_list", "GET /v3/campaigns?limit=2",
    "GET", "/v3/campaigns?limit=2", "xapikey-only"))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4 — /v3/automations/{id} (legacy)
  // ═══════════════════════════════════════════════════════════════════
  if (automationId) {
    results.push(await call(apiKey, "P4_v3_automation", "GET /v3/automations/{id}",
      "GET", `/v3/automations/${automationId}`, "xapikey-only"))
    await sleep(DELAY)

    results.push(await call(apiKey, "P4_v3_automation", "GET /v3/automations?limit=2",
      "GET", "/v3/automations?limit=2", "xapikey-only"))
    await sleep(DELAY)
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5 — Statistics API com productID (dimension documentada,
  // nunca testada nos rounds anteriores)
  // ═══════════════════════════════════════════════════════════════════
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date().toISOString()

  results.push(await call(apiKey, "P5_stats_productID", "T5A: dim:timestamp+productID",
    "POST", "/api/analytics/statistics", "bearer+version", {
    queries: [{
      alias: "products",
      metrics: [
        { name: "attributedOrderedProductUnits" },
        { name: "totalOrderedProductUnits" },
      ],
      dateRange: { from, to },
      dimensions: [
        { name: "timestamp", granularity: "day" },
        { name: "productID" },
      ],
    }],
  }))
  await sleep(2000)

  results.push(await call(apiKey, "P5_stats_productID", "T5B: dim:timestamp+productID — attributed message",
    "POST", "/api/analytics/statistics", "bearer+version", {
    queries: [{
      alias: "products",
      metrics: [
        { name: "attributedRevenue" },
        { name: "attributedOrders" },
      ],
      dateRange: { from, to },
      dimensions: [
        { name: "timestamp", granularity: "day" },
        { name: "productID" },
      ],
    }],
  }))
  await sleep(2000)

  // Tentar metrics novos que NUNCA tentamos: campaignSent, campaignOpened
  const metricCandidates = [
    "campaignSent", "campaignOpened", "campaignClicked",
    "automationSent", "automationOpened",
    "messagesSent", "uniqueOpens", "uniqueClicks",
  ]
  for (const m of metricCandidates) {
    results.push(await call(apiKey, "P6_stats_alt_metrics", `metric:${m}`,
      "POST", "/api/analytics/statistics", "bearer+version", {
      queries: [{
        alias: "r",
        metrics: [{ name: m }],
        dateRange: { from, to },
        dimensions: [{ name: "timestamp", granularity: "day" }],
      }],
    }))
    await sleep(2500) // delay maior pra Statistics API
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 7 — /v3/contacts paging (descobrir total)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await call(apiKey, "P7_v3_contacts", "GET /v3/contacts?limit=1",
    "GET", "/v3/contacts?limit=1", "xapikey-only"))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // Aggregation
  // ═══════════════════════════════════════════════════════════════════
  const byStatus: Record<string, number> = {}
  for (const r of results) {
    const k = r.status === 0 ? "error" : String(r.status)
    byStatus[k] = (byStatus[k] || 0) + 1
  }

  // Highlight: hits com response que contem palavras-chave de revenue/stats
  const interestingHits = results
    .filter((r) => r.status === 200)
    .filter((r) => {
      const lower = r.responseFull.toLowerCase()
      return lower.includes("revenue")
        || lower.includes("\"sent\":")
        || lower.includes("\"opened\":")
        || lower.includes("\"orders\":")
        || lower.includes("orderscount")
        || lower.includes("\"clicked\":")
        || lower.includes("statistics")
        || lower.includes("\"stats\":")
    })

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    campaignId,
    automationId,
    summary: {
      totalTests: results.length,
      byStatus,
      interestingHits: interestingHits.length,
    },
    interestingHits,
    results,
  })
}
