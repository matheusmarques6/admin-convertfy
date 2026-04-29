/**
 * TEMPORARY — Omnisend Discovery Round 5 (FINAL — schema correto)
 *
 * R4 invalidou os metrics ANTES da API conseguir validar as dimensions.
 * As mensagens de erro revelaram o schema verdadeiro:
 *
 *   Metrics aceitos:
 *     sent, sentCost,
 *     opened, openedUnique, openRate,
 *     clicked, clickedUnique, clickRate,
 *     failed, failRate,
 *     markedAsSpamUnique, markedAsSpamRate,
 *     unsubscribedUnique, unsubscribeRate,
 *     attributedOrders, attributedOrdersUnique, attributedOrderRate,
 *     attributedRevenue, attributedRevenuePerOrder, attributedRevenuePerSent
 *
 *   dateRange precisa de:
 *     { "interval": "custom", "from": "...", "to": "..." }
 *     (ou "interval": "last_30_days" etc — sem from/to)
 *
 * R5 testa dimensions com metrics VALIDOS + interval correto.
 * Se ainda assim "unsupported dimension", aceitamos a derrota com
 * confianca total. Se passar, encontramos o breakdown.
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
    .from("client_stores")
    .select("id, store_name, org_id")
    .eq("id", storeId)
    .single()
  if (!store) return NextResponse.json({ error: "store not found" }, { status: 404 })

  const creds = await getStoreCredentials(storeId, store.org_id)
  const apiKey = creds.omnisend_api_key
  if (!apiKey) return NextResponse.json({ error: "key missing" }, { status: 404 })

  // ── DateRange CORRETO ──
  const customDateRange = {
    interval: "custom",
    from: "2026-03-30T00:00:00Z",
    to: "2026-04-29T23:59:59Z",
  }

  // ── Metrics OFICIAIS (extraidos da mensagem de erro do R4) ──
  const validRevenueMetrics = [
    { name: "attributedRevenue" },
    { name: "attributedOrders" },
    { name: "attributedOrdersUnique" },
    { name: "attributedRevenuePerOrder" },
    { name: "attributedRevenuePerSent" },
  ]
  const validEngagementMetrics = [
    { name: "sent" },
    { name: "opened" },
    { name: "openedUnique" },
    { name: "openRate" },
    { name: "clicked" },
    { name: "clickedUnique" },
    { name: "clickRate" },
    { name: "failed" },
  ]

  const results: FetchResult[] = []
  const DELAY = 5000

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1 — Confirmar schema correto: metrics validos + dateRange
  //          com interval custom, SEM dimension
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P1_baseline", "T1: schema validado, sem dim", {
    queries: [{
      alias: "baseline",
      metrics: [...validRevenueMetrics, ...validEngagementMetrics],
      dateRange: customDateRange,
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2 — Tentar interval "last_30_days" (sem from/to)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "P2_interval_named", "T2: interval=last_30_days", {
    queries: [{
      alias: "named_interval",
      metrics: validRevenueMetrics,
      dateRange: { interval: "last_30_days" },
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3 — Dimensions com schema CORRETO
  // (agora as mensagens de erro vao ser HONESTAS)
  // ═══════════════════════════════════════════════════════════════════
  const dimensionCandidates = [
    "timestamp",       // garantido
    "channel",         // documentado
    "activity",        // documentado
    "campaign",        // hipotese principal
    "workflow",        // hipotese principal
    "automation",      // alternativa
    "messageType",     // alternativa
    "message",         // alternativa
  ]

  for (const dim of dimensionCandidates) {
    const dimensions = dim === "timestamp"
      ? [{ name: "timestamp", granularity: "day" }]
      : [{ name: dim }]

    results.push(await callReports(apiKey, "P3_dimensions_clean", `dim:${dim}`, {
      queries: [{
        alias: "r",
        metrics: validRevenueMetrics,
        dateRange: customDateRange,
        dimensions,
      }],
    }))
    await sleep(DELAY)
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4 — Combos timestamp + outra dimension
  // (talvez precise SEMPRE de timestamp como primeira)
  // ═══════════════════════════════════════════════════════════════════
  for (const dim of ["campaign", "workflow", "channel", "activity"]) {
    results.push(await callReports(apiKey, "P4_timestamp_combo", `timestamp+${dim}`, {
      queries: [{
        alias: "r",
        metrics: validRevenueMetrics,
        dateRange: customDateRange,
        dimensions: [
          { name: "timestamp", granularity: "day" },
          { name: dim },
        ],
      }],
    }))
    await sleep(DELAY)
  }

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
