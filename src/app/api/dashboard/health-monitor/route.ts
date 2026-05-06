import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
  getUnifiedFlows,
} from "@/lib/services/unified-metrics.service"
import { logger } from "@/lib/logger"

const log = logger.child("HealthMonitor")

export const dynamic = "force-dynamic"
export const maxDuration = 30

interface StoreHealth {
  id: string
  storeName: string
  clientName: string
  platform: string
  deliveryRate: number
  bounceRate: number
  openRate: number
  clickRate: number
  unsubRate: number
  spamRate: number
  engagementRate: number
  totalLeads: number
  engagedLeads: number
  score: number
  issues: string[]
}

/** Score 0-100 unificado (Klaviyo OU Omnisend), aplicado em cima dos
 *  totais agregados de campanhas + flows do periodo. Formula recomendada
 *  pelo suporte da Omnisend (2026-05-06): 40% conversao + 20% retencao
 *  + 40% entregabilidade. Funciona pra qualquer plataforma desde que os
 *  rates estejam normalizados (0-100, percentual). */
function computeHealthScore(s: {
  sent: number
  deliveryRate: number
  bounceRate: number
  openRate: number
  clickRate: number
  unsubRate: number
  spamRate: number
}): { score: number; issues: string[] } {
  if (s.sent === 0) return { score: 0, issues: ["Sem envios no periodo"] }

  // Rates em percentual (0-100). Score normalizado em decimal e
  // multiplicado por 100 no final pra cair em 0-100.
  const openR = s.openRate / 100
  const clickR = s.clickRate / 100
  const failR = (100 - s.deliveryRate) / 100  // proxy de failure
  const unsubR = s.unsubRate / 100
  const spamR = s.spamRate / 100

  const raw =
    openR * 0.20 +
    clickR * 0.20 +
    Math.min(0.05, openR * 0.05) * 4 + // proxy de orderRate (sem dado real, usa open)
    (1 - failR) * 0.15 +
    (1 - unsubR) * 0.10 +
    (1 - spamR) * 0.10 +
    (openR + clickR) * 0.05

  const score = Math.max(0, Math.min(100, Math.round(raw * 100)))

  const issues: string[] = []
  if (s.bounceRate > 3) issues.push(`Bounce rate critico: ${s.bounceRate.toFixed(2)}%`)
  else if (s.bounceRate > 2) issues.push(`Bounce rate alto: ${s.bounceRate.toFixed(2)}%`)
  if (s.spamRate > 0.3) issues.push(`Spam rate critico: ${s.spamRate.toFixed(2)}%`)
  else if (s.spamRate > 0.1) issues.push(`Spam rate elevado: ${s.spamRate.toFixed(3)}%`)
  if (s.unsubRate > 0.5) issues.push(`Unsub rate alto: ${s.unsubRate.toFixed(2)}%`)
  if (s.openRate < 15) issues.push(`Open rate baixo: ${s.openRate.toFixed(1)}%`)
  if (s.deliveryRate < 95) issues.push(`Deliverability baixa: ${s.deliveryRate.toFixed(1)}%`)

  return { score, issues }
}

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = request.nextUrl.searchParams.get("period") || "30d"

    // Resiliente a migration pendente
    async function fetchStores(selectCols: string) {
      return supabase
        .from("client_stores")
        .select(selectCols)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .limit(500)
    }
    let storesRes = await fetchStores("id, store_name, org_id, email_platform, omnisend_api_key, klaviyo_private_key, klaviyo_api_key, client_id, clients(name)")
    if (storesRes.error && /email_platform|omnisend_api_key/.test(storesRes.error.message || "")) {
      storesRes = await fetchStores("id, store_name, org_id, klaviyo_private_key, klaviyo_api_key, client_id, clients(name)")
    }
    const stores = (storesRes.data || []) as unknown as Array<Record<string, unknown> & {
      id: string; store_name: string; org_id: string; client_id?: string | null;
      clients?: { name: string } | { name: string }[] | null;
    }>

    if (!stores || stores.length === 0) {
      return successResponse(request, { stores: [], summary: null, period })
    }

    const storeIds = stores.map((s) => s.id)

    // CACHE-ONLY: agrega tudo do DB (campaigns + flows + summary) sem
    // chamar API. Antes fazia live-fetch fetchOmnisendHealth pra cada
    // loja em paralelo — com 50+ lojas, todas sofriam rate limit
    // (Statistics: 10/min) e voltavam vazias. O cron sync-omnisend
    // ja popula tudo no DB, basta agregar.
    const [revenueRows, campaignRows, flowRows] = await Promise.all([
      getUnifiedRevenue(supabase, orgId, [period], storeIds),
      getUnifiedCampaigns(supabase, orgId, period, storeIds),
      getUnifiedFlows(supabase, orgId, period, storeIds, false), // inclui inactive
    ])

    const revMap = new Map(revenueRows.map((r) => [r.store_id, r]))
    const campByStore = new Map<string, typeof campaignRows>()
    for (const c of campaignRows) {
      if (!campByStore.has(c.store_id)) campByStore.set(c.store_id, [])
      campByStore.get(c.store_id)!.push(c)
    }
    const flowByStore = new Map<string, typeof flowRows>()
    for (const f of flowRows) {
      if (!flowByStore.has(f.store_id)) flowByStore.set(f.store_id, [])
      flowByStore.get(f.store_id)!.push(f)
    }

    const storeHealths: StoreHealth[] = stores.map((store) => {
      const s = store as Record<string, unknown>
      const platform = (s.email_platform as string)
        ?? (s.omnisend_api_key ? "omnisend" : (s.klaviyo_private_key || s.klaviyo_api_key) ? "klaviyo" : "none")
      const client = Array.isArray(store.clients) ? store.clients[0] : store.clients
      const rev = revMap.get(store.id)
      const camps = campByStore.get(store.id) || []
      const flows = flowByStore.get(store.id) || []

      // Agrega TODAS rows (campaigns + flows) — antes so usava campaigns
      // pra Klaviyo, fazendo lojas que so tem flows (Omnisend tipico)
      // mostrarem 0 mesmo tendo dados.
      const allRows = [
        ...camps.map((c) => ({
          recipients: c.recipients, delivered: c.delivered, opened: c.opened,
          clicked: c.clicked, bounced: c.bounced, unsubscribed: c.unsubscribed,
          spam: c.spam_complaints || 0,
        })),
        ...flows.map((f) => ({
          recipients: f.recipients, delivered: f.delivered, opened: f.opened,
          clicked: f.clicked, bounced: f.bounced, unsubscribed: f.unsubscribed,
          spam: 0, // flow_metrics nao tem coluna spam_complaints
        })),
      ]

      const totalRecipients = allRows.reduce((sum, r) => sum + r.recipients, 0)
      const totalDelivered = allRows.reduce((sum, r) => sum + r.delivered, 0)
      const totalOpened = allRows.reduce((sum, r) => sum + r.opened, 0)
      const totalClicked = allRows.reduce((sum, r) => sum + r.clicked, 0)
      const totalBounced = allRows.reduce((sum, r) => sum + r.bounced, 0)
      const totalUnsubs = allRows.reduce((sum, r) => sum + r.unsubscribed, 0)
      const totalSpam = allRows.reduce((sum, r) => sum + r.spam, 0)

      const deliveryRate = totalRecipients > 0 ? (totalDelivered / totalRecipients) * 100 : 0
      const bounceRate = totalRecipients > 0 ? (totalBounced / totalRecipients) * 100 : 0
      const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0
      const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0
      const unsubRate = totalDelivered > 0 ? (totalUnsubs / totalDelivered) * 100 : 0
      const spamRate = totalDelivered > 0 ? (totalSpam / totalDelivered) * 100 : 0
      const engagementRate = rev?.engagement_rate ?? 0

      const { score, issues } = computeHealthScore({
        sent: totalRecipients, deliveryRate, bounceRate, openRate, clickRate, unsubRate, spamRate,
      })

      return {
        id: store.id,
        storeName: store.store_name,
        clientName: client?.name || "—",
        platform: platform || "none",
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 100) / 100,
        openRate: Math.round(openRate * 10) / 10,
        clickRate: Math.round(clickRate * 10) / 10,
        unsubRate: Math.round(unsubRate * 100) / 100,
        spamRate: Math.round(spamRate * 1000) / 1000,
        engagementRate: Math.round(engagementRate * 10) / 10,
        totalLeads: rev?.total_leads ?? 0,
        engagedLeads: rev?.engaged_leads ?? 0,
        score,
        issues,
      }
    })

    storeHealths.sort((a, b) => a.score - b.score)

    const withData = storeHealths.filter((h) => h.score > 0)
    const avgScore = withData.length > 0
      ? Math.round(withData.reduce((s, h) => s + h.score, 0) / withData.length)
      : 0
    const criticalCount = withData.filter((h) => h.score < 50).length
    const warningCount = withData.filter((h) => h.score >= 50 && h.score < 70).length
    const healthyCount = withData.filter((h) => h.score >= 70).length
    const totalIssues = storeHealths.reduce((s, h) => s + h.issues.length, 0)

    log.info("[HealthMonitor] aggregated", {
      period,
      totalStores: storeHealths.length,
      withData: withData.length,
      criticalCount,
      warningCount,
      healthyCount,
    })

    return successResponse(request, {
      stores: storeHealths,
      summary: { avgScore, criticalCount, warningCount, healthyCount, totalIssues, totalStores: storeHealths.length },
      period,
    })
  } catch (error) {
    log.error("HealthMonitor error:", error)
    return errorResponse(request, error, "health-monitor")
  }
}
