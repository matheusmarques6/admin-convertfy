/**
 * TEMPORARY — Omnisend Discovery R10 (FINAL — schema do suporte oficial)
 *
 * Suporte do Omnisend confirmou o schema correto que ninguem havia
 * descoberto. Os 9 rounds anteriores estavam errando em 5 campos:
 *
 *   ANTES (errado)              DEPOIS (correto, do suporte)
 *   ───────────────────────────────────────────────────────────────
 *   dimension: "activity"       dimension: "marketingActivityID"
 *   filter name: "activity"     filter name: "marketingActivityType"
 *   operator: "equals"          operator: "in"
 *   value: "campaign"           values: ["Campaign"]
 *                               (PLURAL + capitalizado)
 *
 * Suporte tambem disse que isso e da `/api/analytics/statistics`,
 * NAO `/reports`. Vamos testar AMBOS pra confirmar — o R5 ja
 * confirmou que /reports retorna attributedRevenue agregado, mas
 * com schema errado pode estar acontecendo de a API rejeitar.
 *
 * R10 faz UM request com 3 queries:
 *   1. campaigns         — attributedRevenue por campaignID
 *   2. automations       — attributedRevenue por automationID
 *   3. total             — totalRevenue da loja
 *
 * Se funcionar com /statistics: refatoramos pra usar Statistics em vez
 * de /reports pra atribuicao por linha (mantem /reports pra agregado).
 *
 * Se funcionar com /reports: ainda melhor — 1 endpoint so.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"

export const maxDuration = 300
export const dynamic = "force-dynamic"

interface FetchResult {
  endpoint: string
  body: Record<string, unknown>
  status: number
  responseFull: string
  responseKeys: string[]
  latencyMs: number
}

async function call(
  endpoint: "statistics" | "reports",
  apiKey: string,
  body: Record<string, unknown>,
): Promise<FetchResult> {
  const url = `https://api.omnisend.com/api/analytics/${endpoint}`
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Omnisend-API-Key ${apiKey}`,
        "Omnisend-Version": "2026-preview",
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
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
      endpoint, body, status: res.status, responseFull, responseKeys,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      endpoint, body, status: 0,
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

  // Body EXATO do suporte da Omnisend.
  // 3 queries em 1 request:
  //   - campaigns: attributedRevenue por marketingActivityID, filtrado por type=Campaign
  //   - automations: idem mas type=Automation
  //   - total: totalRevenue da loja, sem filtro
  //
  // Periodo: 30 dias (similar ao painel Sales).
  // Adicionei dateRange.interval=last30Days e timestamp dimension
  // (caso seja exigido como em /reports — sera adaptado se erro).
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date().toISOString()

  const supportBody = {
    queries: [
      {
        alias: "campaigns",
        metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
        dateRange: { from, to },
        dimensions: [{ name: "marketingActivityID" }],
        filters: [
          { name: "marketingActivityType", operator: "in", values: ["Campaign"] },
        ],
      },
      {
        alias: "automations",
        metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
        dateRange: { from, to },
        dimensions: [{ name: "marketingActivityID" }],
        filters: [
          { name: "marketingActivityType", operator: "in", values: ["Automation"] },
        ],
      },
      {
        alias: "total",
        metrics: [{ name: "totalRevenue" }, { name: "totalOrders" }],
        dateRange: { from, to },
      },
    ],
  }

  const results: FetchResult[] = []

  // ═══════════════════════════════════════════════════════════════════
  // T1 — Schema do suporte em /api/analytics/statistics (o que ele citou)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await call("statistics", apiKey, supportBody))

  await sleep(60_000)  // 60s defensivo

  // ═══════════════════════════════════════════════════════════════════
  // T2 — Mesmo schema em /api/analytics/reports (caso suporte tenha
  // confundido o endpoint, ou caso reports tambem aceite)
  // ═══════════════════════════════════════════════════════════════════
  // Reports exige interval ao inves de from/to puros — adapta.
  const reportsBody = {
    queries: supportBody.queries.map((q) => ({
      ...q,
      dateRange: { interval: "custom", from, to },
    })),
  }
  results.push(await call("reports", apiKey, reportsBody))

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
