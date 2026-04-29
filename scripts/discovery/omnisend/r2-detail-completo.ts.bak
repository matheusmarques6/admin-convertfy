/**
 * TEMPORARY — Omnisend Discovery Round 2 (focused)
 *
 * Round 1 mostrou:
 *   - /api/campaigns e /api/automations (preview) funcionam — usar pra IDs
 *   - 28 paths em /api/reports/* e /api/analytics/* sao 404 (nao existem)
 *   - Statistics API rate-limita pesado: 67 requests queimaram o budget
 *
 * Round 2 foca em:
 *   1) Detalhes individuais: /api/campaigns/{id} e /api/automations/{id}
 *      capturando RESPONSE COMPLETO (sem truncar)
 *   2) Sub-recursos por id (statistics, stats, analytics, revenue, etc)
 *   3) Lista com expand/include/fields
 *   4) Statistics API com APENAS 3 testes especificos + delay 10s
 *
 * Total ~30 requests, com cuidado pra nao queimar rate limit.
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
  body?: unknown
  status: number
  responseFull: string  // sem truncar
  responseKeys: string[]
  latencyMs: number
  error?: string
}

async function call(
  apiKey: string,
  category: string,
  label: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  version = "2026-preview",
): Promise<FetchResult> {
  const url = `https://api.omnisend.com${path}`
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Omnisend-API-Key ${apiKey}`,
        "Omnisend-Version": version,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
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
      body,
      status: 0,
      responseFull: "",
      responseKeys: [],
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
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

  const results: FetchResult[] = []

  // ── PHASE 1: Pegar IDs via /api/campaigns e /api/automations ──
  const listCampaigns = await call(apiKey, "Z_setup", "list-campaigns", "GET", "/api/campaigns?limit=5")
  results.push(listCampaigns)

  const listAutomations = await call(apiKey, "Z_setup", "list-automations", "GET", "/api/automations?limit=5")
  results.push(listAutomations)

  let campaignIds: string[] = []
  let automationIds: string[] = []
  try {
    const cj = JSON.parse(listCampaigns.responseFull) as { campaigns?: Array<{ id?: string }> }
    campaignIds = (cj.campaigns || []).map((c) => c.id).filter(Boolean) as string[]
  } catch { /* ignore */ }
  try {
    const aj = JSON.parse(listAutomations.responseFull) as { automations?: Array<{ id?: string }> }
    automationIds = (aj.automations || []).map((a) => a.id).filter(Boolean) as string[]
  } catch { /* ignore */ }

  await sleep(500)

  // ── PHASE 2: Detalhes individuais — RESPONSE COMPLETO ──
  // (1 campaign + 1 automation, suficiente pra ver shape inteiro)
  if (campaignIds[0]) {
    results.push(await call(apiKey, "A_detail", "GET /api/campaigns/{id}", "GET", `/api/campaigns/${campaignIds[0]}`))
    await sleep(300)
  }
  if (automationIds[0]) {
    results.push(await call(apiKey, "A_detail", "GET /api/automations/{id}", "GET", `/api/automations/${automationIds[0]}`))
    await sleep(300)
  }

  // ── PHASE 3: Sub-recursos por id (testes onde stats/revenue podem morar) ──
  const subResources = [
    "statistics", "stats", "analytics", "revenue",
    "metrics", "performance", "report", "summary",
  ]
  if (campaignIds[0]) {
    for (const sub of subResources) {
      results.push(await call(
        apiKey,
        "B_campaign_subresource",
        `GET /api/campaigns/{id}/${sub}`,
        "GET",
        `/api/campaigns/${campaignIds[0]}/${sub}`,
      ))
      await sleep(250)
    }
  }
  if (automationIds[0]) {
    for (const sub of subResources) {
      results.push(await call(
        apiKey,
        "C_automation_subresource",
        `GET /api/automations/{id}/${sub}`,
        "GET",
        `/api/automations/${automationIds[0]}/${sub}`,
      ))
      await sleep(250)
    }
  }

  // ── PHASE 4: Lista com expand/include/fields ──
  const listExpansions = [
    "/api/campaigns?limit=2&expand=statistics",
    "/api/campaigns?limit=2&include=statistics",
    "/api/campaigns?limit=2&fields=id,name,status,statistics,revenue",
    "/api/campaigns?limit=2&expand=stats,revenue",
    "/api/automations?limit=2&expand=statistics",
    "/api/automations?limit=2&include=statistics",
    "/api/automations?limit=2&fields=id,name,statistics,revenue",
  ]
  for (const p of listExpansions) {
    results.push(await call(apiKey, "D_list_expand", `GET ${p.split("?")[1]}`, "GET", p))
    await sleep(250)
  }

  // ── PHASE 5: Statistics API — APENAS 3 testes com delay 10s ──
  // Se rate limit ainda estiver fechado, vai retornar 429 — no caso reportamos
  // o retryAfter pra o usuario saber quando rerodar.
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date().toISOString()
  const baseMetrics = [
    { name: "totalRevenue" }, { name: "totalOrders" },
    { name: "attributedRevenue" }, { name: "attributedOrders" },
  ]

  // Test 1: dimension messageType (mais provavel de existir)
  await sleep(2000)
  results.push(await call(
    apiKey, "E_statistics_focused", "dim:messageType", "POST", "/api/analytics/statistics",
    {
      queries: [{
        alias: "r",
        metrics: baseMetrics,
        dateRange: { from, to },
        dimensions: [{ name: "messageType" }],
      }],
    },
  ))

  // Test 2: messageType + timestamp combo
  await sleep(10_000)
  results.push(await call(
    apiKey, "E_statistics_focused", "dim:timestamp+messageType", "POST", "/api/analytics/statistics",
    {
      queries: [{
        alias: "r",
        metrics: baseMetrics,
        dateRange: { from, to },
        dimensions: [
          { name: "timestamp", granularity: "day" },
          { name: "messageType" },
        ],
      }],
    },
  ))

  // Test 3: 2 queries (campaign vs automation) com filter
  await sleep(10_000)
  results.push(await call(
    apiKey, "E_statistics_focused", "two-queries-by-messageType", "POST", "/api/analytics/statistics",
    {
      queries: [
        {
          alias: "campaigns",
          metrics: baseMetrics,
          dateRange: { from, to },
          filter: "equals(messageType,'campaign')",
        },
        {
          alias: "automations",
          metrics: baseMetrics,
          dateRange: { from, to },
          filter: "equals(messageType,'automation')",
        },
      ],
    },
  ))

  // ── Aggregation ──
  const byStatus: Record<string, number> = {}
  for (const r of results) {
    const k = r.status === 0 ? "error" : String(r.status)
    byStatus[k] = (byStatus[k] || 0) + 1
  }

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    campaignIds,
    automationIds,
    summary: {
      totalTests: results.length,
      byStatus,
    },
    results,
  })
}
