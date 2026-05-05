/**
 * TEMPORARY — Omnisend Discovery R9 (FINAL — operator: in/notIn)
 *
 * R8 revelou DUAS pistas decisivas:
 *   T2 erro 1: "unsupported filter 'activity' for metric 'attributedRevenue'"
 *   T2 erro 2: "unsupported operator. Allowed: in, notIn"
 *
 * Significados:
 *   1. Operator correto e `in` ou `notIn` (NAO `equals`)
 *   2. Filter names sao restritos por metric (whitelist por metric)
 *   3. `value` provavelmente precisa ser ARRAY (porque operator e `in`)
 *   4. `activity` nao esta na whitelist — precisamos achar qual esta
 *
 * Hipotese forte: como o /v5/campaigns retorna `campaignID` e
 * /v5/automations retorna `id` (a doc usa `automationID`/`workflowID`),
 * filter aceita esses como name. Se funcionar, fazemos 1 query por
 * campanha = revenue por linha individual = bate com painel oficial.
 *
 * R9 testa APENAS 2 cenarios (cooldown queimou no R8):
 *   T1 — filter name=campaignID, operator=in, value=[<id>]
 *   T2 — filter name=automationID, operator=in, value=[<id>]
 *
 * Se T1/T2 retornarem 200, REVENUE POR LINHA INDIVIDUAL desbloqueado.
 *
 * IMPORTANTE: aguardar ~1h45 apos R8 antes de rodar (Retry-After 6291s).
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

  // Pega 1 campaign ID + 1 automation ID reais (sem queimar rate limit pesado)
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
      const json = await campRes.json() as { campaigns?: Array<{ id?: string }> }
      campaignId = json.campaigns?.[0]?.id || ""
    }
    const autoRes = await fetch("https://api.omnisend.com/v5/automations?limit=1", {
      headers: {
        "Authorization": `Omnisend-API-Key ${apiKey}`,
        "Omnisend-Version": "2026-03-15",
        "Accept": "application/json",
      },
    })
    if (autoRes.ok) {
      const json = await autoRes.json() as { automations?: Array<{ id?: string }> }
      automationId = json.automations?.[0]?.id || ""
    }
  } catch { /* ignore */ }

  if (!campaignId || !automationId) {
    return NextResponse.json({
      error: "Could not fetch sample IDs",
      campaignId,
      automationId,
    }, { status: 500 })
  }

  const baseDate = { interval: "last30Days" }
  const baseMetrics = [
    { name: "attributedRevenue" },
    { name: "attributedOrders" },
    { name: "sent" },
  ]

  const results: FetchResult[] = []

  // ═══════════════════════════════════════════════════════════════════
  // T1 — filter por campaignID com operator:in (formato correto do R8)
  // Hipotese: filter aceita campaignID, retorna revenue desse campaign
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "T1", `filter campaignID in [${campaignId.slice(-6)}...]`, {
    queries: [{
      alias: "single_campaign",
      metrics: baseMetrics,
      dateRange: baseDate,
      filters: [{
        name: "campaignID",
        operator: "in",
        value: [campaignId],
      }],
    }],
  }))

  await sleep(90_000)  // 90s defensivo

  // ═══════════════════════════════════════════════════════════════════
  // T2 — filter por automationID com operator:in
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "T2", `filter automationID in [${automationId.slice(-6)}...]`, {
    queries: [{
      alias: "single_automation",
      metrics: baseMetrics,
      dateRange: baseDate,
      filters: [{
        name: "automationID",
        operator: "in",
        value: [automationId],
      }],
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

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    campaignId,
    automationId,
    summary: {
      totalTests: results.length,
      byStatus,
      hits: results.filter((r) => r.status === 200).length,
    },
    results,
  })
}
