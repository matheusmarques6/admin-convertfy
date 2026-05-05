/**
 * TEMPORARY — Omnisend Discovery R8 (FOCO: filter syntax)
 *
 * R7 revelou pista decisiva:
 *   Test D usava `filters: [{ field, operator, value }]` e API retornou
 *   "queries[0].filters[0].name is required"
 *
 * Significados:
 *   1. `filters` e estrutura ACEITA (nao Unknown parameter)
 *   2. Schema usa `name` em vez de `field`
 *   3. Provavelmente operator/value tambem requeridos
 *
 * R8 testa 5 filter names com schema correto pra descobrir quais
 * campos a API aceita filtrar:
 *
 *   T1 — name: "activity"            → entrega "campaign" / "automation"?
 *   T2 — name: "messageType"         → mesma intencao
 *   T3 — name: "channel"             → email / sms / push
 *   T4 — name: "campaignID"          → filtra por campanha individual
 *   T5 — sem operator/value          → ve mensagem listando aceitos
 *
 * Se ALGUM retornar 200 com revenue split, refatoracao em 1 commit.
 * Se todos rejeitarem com "unsupported filter 'X'", a mensagem vai
 * listar os names aceitos.
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

  const baseDate = { interval: "last30Days" }
  const baseMetrics = [
    { name: "attributedRevenue" },
    { name: "attributedOrders" },
  ]

  const results: FetchResult[] = []
  const DELAY = 60_000

  // ═══════════════════════════════════════════════════════════════════
  // T1 — Filter sem operator/value (descobre aceitos via mensagem de erro)
  // Esperado: "unsupported filter name 'X', allowed: [...]"
  // OU "operator is required" (validando schema mas aceitando o name)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "T1", "filter name only (no op/value)", {
    queries: [{
      alias: "probe",
      metrics: baseMetrics,
      dateRange: baseDate,
      filters: [{ name: "activity" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // T2 — name: "activity" + operator + value (formato completo)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "T2", "filter name=activity, value=campaign", {
    queries: [{
      alias: "campaigns",
      metrics: baseMetrics,
      dateRange: baseDate,
      filters: [{ name: "activity", operator: "equals", value: "campaign" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // T3 — name: "messageType" + operator + value
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "T3", "filter name=messageType, value=campaign", {
    queries: [{
      alias: "by_msgtype",
      metrics: baseMetrics,
      dateRange: baseDate,
      filters: [{ name: "messageType", operator: "equals", value: "campaign" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // T4 — name: "channel" + operator + value
  // (channel rejeitado como dimension; talvez aceite como filter)
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "T4", "filter name=channel, value=email", {
    queries: [{
      alias: "by_channel",
      metrics: baseMetrics,
      dateRange: baseDate,
      filters: [{ name: "channel", operator: "equals", value: "email" }],
    }],
  }))
  await sleep(DELAY)

  // ═══════════════════════════════════════════════════════════════════
  // T5 — Filter sem qualquer name (probe pra ver mensagem de schema)
  // Esperado: "name is required" + outros campos requeridos
  // Talvez liste TODOS os filters obrigatorios numa unica mensagem
  // ═══════════════════════════════════════════════════════════════════
  results.push(await callReports(apiKey, "T5", "filter completely empty {}", {
    queries: [{
      alias: "probe",
      metrics: baseMetrics,
      dateRange: baseDate,
      filters: [{}],
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

  const promising = results.filter((r) => r.status === 200)
  const errorsWithHints = results.filter((r) => r.status >= 400 && r.status < 500)

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    summary: {
      totalTests: results.length,
      byStatus,
      hits: promising.length,
    },
    promising,
    errorsWithHints,
    results,
  })
}
