/**
 * "Lojas em atenção" — derivação compartilhada entre o engine (contexto
 * pras sugestões type=performance) e o GET /insights da tela.
 *
 * Fontes (todas locais): store_alerts ativos, health_score baixo e
 * delta de receita negativo (store_revenue_summary, colunas omnisend).
 */

import { createAdminClient } from "@/lib/supabase/server"
import type { AttentionStore } from "@/types/campaign-central"
import { normalizeCountry } from "./cycle-context.service"

const HEALTH_CRITICAL = 40
const HEALTH_WARN = 55
const REVENUE_DROP_PCT = -20

const ALERT_LABEL: Record<string, string> = {
  low_revenue: "Receita em queda",
  klaviyo_account_error: "Erro de conta",
  campaign_failure: "Falha de campanha",
  low_recovery_rate: "Recuperação baixa",
  health_critical: "Health crítico",
  renewal_due: "Renovação próxima",
  feedback_received: "Feedback recebido",
  churn_recovery: "Risco de churn",
}

interface StoreRow {
  id: string
  store_name: string
  country: string | null
  niche: string | null
  health_score: number | null
}

export async function loadAttentionStores(orgId: string): Promise<AttentionStore[]> {
  const admin = createAdminClient()

  const { data: storesRaw, error: storesErr } = await admin
    .from("client_stores")
    .select("id, store_name, country, niche, health_score")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("omnisend_api_key", "is", null)

  if (storesErr) throw storesErr
  const stores = (storesRaw ?? []) as StoreRow[]
  if (stores.length === 0) return []

  const storeIds = stores.map((s) => s.id)

  const [alertsRes, revenueRes] = await Promise.all([
    admin
      .from("store_alerts")
      .select("store_id, type, severity, title, created_at")
      .in("store_id", storeIds)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    admin
      .from("store_revenue_summary")
      .select("store_id, period_label, omnisend_total_revenue")
      .in("store_id", storeIds)
      .in("period_label", ["7d", "30d"]),
  ])

  if (alertsRes.error) throw alertsRes.error
  if (revenueRes.error) throw revenueRes.error

  const alertsByStore = new Map<string, Array<{ type: string; severity: string; title: string }>>()
  for (const a of alertsRes.data ?? []) {
    const arr = alertsByStore.get(a.store_id as string) ?? []
    arr.push({
      type: a.type as string,
      severity: a.severity as string,
      title: a.title as string,
    })
    alertsByStore.set(a.store_id as string, arr)
  }

  const revenueByStore = new Map<string, { d7: number; d30: number }>()
  for (const r of revenueRes.data ?? []) {
    const sid = r.store_id as string
    const entry = revenueByStore.get(sid) ?? { d7: 0, d30: 0 }
    const v = Number(r.omnisend_total_revenue ?? 0)
    if (r.period_label === "7d") entry.d7 = v
    else if (r.period_label === "30d") entry.d30 = v
    revenueByStore.set(sid, entry)
  }

  const result: AttentionStore[] = []

  for (const store of stores) {
    const alerts = alertsByStore.get(store.id) ?? []
    const rev = revenueByStore.get(store.id) ?? { d7: 0, d30: 0 }
    const weeklyAvg30 = rev.d30 / (30 / 7)
    const deltaPct =
      weeklyAvg30 > 0 ? Math.round(((rev.d7 - weeklyAvg30) / weeklyAvg30) * 100) : null

    const critical = alerts.find((a) => a.severity === "critical")
    const anyAlert = alerts[0]
    const health = store.health_score

    let metric: string | null = null
    let sub = ""
    let tone: AttentionStore["tone"] = "warn"

    if (critical) {
      metric = ALERT_LABEL[critical.type] ?? critical.type
      sub = critical.title
      tone = "neg"
    } else if (health != null && health < HEALTH_CRITICAL) {
      metric = `Health ${health}`
      sub = "score crítico — risco de churn"
      tone = "neg"
    } else if (deltaPct != null && deltaPct <= REVENUE_DROP_PCT) {
      metric = `Receita ${deltaPct}%`
      sub = "última semana vs média 30d"
      tone = "warn"
    } else if (anyAlert) {
      metric = ALERT_LABEL[anyAlert.type] ?? anyAlert.type
      sub = anyAlert.title
      tone = "warn"
    } else if (health != null && health < HEALTH_WARN) {
      metric = `Health ${health}`
      sub = "abaixo do saudável"
      tone = "warn"
    }

    if (!metric) continue

    result.push({
      store_id: store.id,
      store_name: store.store_name,
      country: normalizeCountry(store.country),
      vertical: store.niche,
      metric,
      sub,
      tone,
      ideas: 0, // preenchido pelo caller com o count de sugestões da loja
    })
  }

  // Mais graves primeiro
  const toneOrder: Record<AttentionStore["tone"], number> = { neg: 0, warn: 1, purple: 2 }
  result.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone])
  return result
}
