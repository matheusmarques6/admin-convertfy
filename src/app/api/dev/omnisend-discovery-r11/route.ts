/**
 * TEMPORARY — Omnisend Discovery R11 (FINAL FINAL — timestamp dim required)
 *
 * R10 confirmou MAJOR:
 *   - "marketingActivityID" foi ACEITO como dimension (sem erro)
 *   - "marketingActivityType" foi ACEITO como filter name (sem erro)
 *   - operator "in" + values ["Campaign"] foram ACEITOS
 *   - Erro unico: "timestamp dimension is required"
 *
 * Significa: o schema do suporte estava 99% certo. So falta adicionar
 * `timestamp` como primary dimension (obrigatorio em Statistics API
 * conforme ja sabiamos do R5).
 *
 * R11 testa O MESMO schema do R10 + timestamp como primeira dimension,
 * com granularity=month pra reduzir numero de rows (1 row por
 * mes×activityID em vez de 30 rows×activityID).
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

  // 30 dias para bater com o painel Sales da Omnisend
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date().toISOString()

  // Schema do suporte + correcao: timestamp como dimension obrigatoria
  // + messageChannel para diferenciar Email/SMS/Push (lojas multi-canal)
  // Granularity = month reduz rows (1 mes inteiro = 1-2 rows × activityID × channel)
  const body = {
    queries: [
      {
        alias: "campaigns",
        metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
        dateRange: { from, to },
        dimensions: [
          { name: "timestamp", granularity: "month" },
          { name: "marketingActivityID" },
          { name: "messageChannel" },
        ],
        filters: [
          { name: "marketingActivityType", operator: "in", values: ["Campaign"] },
        ],
      },
      {
        alias: "automations",
        metrics: [{ name: "attributedRevenue" }, { name: "attributedOrders" }],
        dateRange: { from, to },
        dimensions: [
          { name: "timestamp", granularity: "month" },
          { name: "marketingActivityID" },
          { name: "messageChannel" },
        ],
        filters: [
          { name: "marketingActivityType", operator: "in", values: ["Automation"] },
        ],
      },
      {
        alias: "total",
        metrics: [{ name: "totalRevenue" }, { name: "totalOrders" }],
        dateRange: { from, to },
        dimensions: [
          { name: "timestamp", granularity: "month" },
        ],
      },
    ],
  }

  // 1 unica chamada — sem delay porque e 1 request so
  const result = await call("statistics", apiKey, body)

  return NextResponse.json({
    store: { id: store.id, name: store.store_name },
    status: result.status,
    body,
    response: result.responseFull,
    responseKeys: result.responseKeys,
    latencyMs: result.latencyMs,
  })
}
