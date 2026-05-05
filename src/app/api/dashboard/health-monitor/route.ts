import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
} from "@/lib/services/unified-metrics.service"
import { fetchOmnisendHealth } from "@/lib/services/omnisend-health.service"
import { logger } from "@/lib/logger"

const log = logger.child("HealthMonitor")

export const dynamic = "force-dynamic"
export const maxDuration = 60

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

/** Score legacy para Klaviyo (campanhas em DB). Score Omnisend usa formula
 *  recomendada pelo suporte (calculateOmnisendHealthScore), aplicada em
 *  cima dos totais agregados de /api/analytics/reports. */
function calculateKlaviyoHealthScore(s: {
  deliveryRate: number; bounceRate: number; openRate: number;
  unsubRate: number; spamRate: number; engagementRate: number; sent: number;
}): { score: number; issues: string[] } {
  if (s.sent === 0) return { score: 0, issues: ["Sem envios no periodo"] }

  let score = 100
  const issues: string[] = []

  if (s.bounceRate > 3) { score -= 25; issues.push(`Bounce rate critico: ${s.bounceRate.toFixed(1)}%`) }
  else if (s.bounceRate > 2) { score -= 10; issues.push(`Bounce rate alto: ${s.bounceRate.toFixed(1)}%`) }

  if (s.spamRate > 0.3) { score -= 25; issues.push(`Spam rate critico: ${s.spamRate.toFixed(2)}%`) }
  else if (s.spamRate > 0.1) { score -= 10; issues.push(`Spam rate elevado: ${s.spamRate.toFixed(2)}%`) }

  if (s.unsubRate > 0.5) { score -= 15; issues.push(`Unsub rate alto: ${s.unsubRate.toFixed(2)}%`) }
  else if (s.unsubRate > 0.3) { score -= 5; issues.push(`Unsub rate acima da media: ${s.unsubRate.toFixed(2)}%`) }

  if (s.openRate < 15 && s.openRate > 0) { score -= 15; issues.push(`Open rate baixo: ${s.openRate.toFixed(1)}%`) }
  else if (s.openRate < 20 && s.openRate > 0) { score -= 5; issues.push(`Open rate abaixo da media: ${s.openRate.toFixed(1)}%`) }

  if (s.deliveryRate < 95 && s.deliveryRate > 0) { score -= 20; issues.push(`Deliverability baixa: ${s.deliveryRate.toFixed(1)}%`) }
  else if (s.deliveryRate < 98 && s.deliveryRate > 0) { score -= 5; issues.push(`Deliverability abaixo do ideal: ${s.deliveryRate.toFixed(1)}%`) }

  if (s.engagementRate < 20 && s.engagementRate > 0) { score -= 10; issues.push(`Engajamento baixo: ${s.engagementRate.toFixed(0)}%`) }

  return { score: Math.max(0, score), issues }
}

/** Calcula range YYYY-MM-DD pra "last N days" inclusivo de hoje, igual o
 *  resto do app (commits 1f7fd53 / 0280eff). 30d em hoje 05/05 → 06/04→05/05. */
function dateRangeForPeriod(period: string): { startISO: string; endISO: string } {
  const now = new Date()
  const days = period === "7d" ? 7 : period === "15d" ? 15 : period === "90d" ? 90 : 30
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  start.setUTCHours(0, 0, 0, 0)
  return { startISO: start.toISOString(), endISO: now.toISOString() }
}

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = request.nextUrl.searchParams.get("period") || "30d"

    // Resiliente a migration pendente: tenta com email_platform, fallback sem
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
    const { startISO, endISO } = dateRangeForPeriod(period)

    // Klaviyo metrics: continua agregando das tabelas de DB (ja tem cache
    // via cron). Omnisend metrics: chama fetchOmnisendHealth direto, que
    // tem cache L1+L2 de 1h (POST /api/analytics/reports e cacheado pelo
    // proprio omnisend-sync.service.ts).
    const [revenueRows, campaignRows] = await Promise.all([
      getUnifiedRevenue(supabase, orgId, [period], storeIds),
      getUnifiedCampaigns(supabase, orgId, period, storeIds),
    ])

    const revMap = new Map(revenueRows.map((r) => [r.store_id, r]))
    const campByStore = new Map<string, typeof campaignRows>()
    for (const c of campaignRows) {
      if (!campByStore.has(c.store_id)) campByStore.set(c.store_id, [])
      campByStore.get(c.store_id)!.push(c)
    }

    // Para cada loja, decide a fonte de health metrics:
    //   - Omnisend (tem omnisend_api_key OU email_platform=omnisend):
    //     fetchOmnisendHealth direto da API com cache 1h
    //   - Klaviyo: agrega das tabelas klaviyo_campaign_metrics
    //   - Sem ambos: skip
    const storeHealths = await Promise.all(stores.map(async (store): Promise<StoreHealth | null> => {
      const s = store as Record<string, unknown>
      const platform = (s.email_platform as string)
        ?? (s.omnisend_api_key ? "omnisend" : (s.klaviyo_private_key || s.klaviyo_api_key) ? "klaviyo" : "none")
      const client = Array.isArray(store.clients) ? store.clients[0] : store.clients
      const rev = revMap.get(store.id)

      if (platform === "omnisend") {
        try {
          const credentials = await getStoreCredentials(store.id, store.org_id)
          const apiKey = credentials.omnisend_api_key
          if (!apiKey) return null

          const h = await fetchOmnisendHealth(apiKey, startISO, endISO)

          // Rates da Omnisend vem em decimal (0-1). UI espera 0-100, entao
          // multiplicamos.
          const deliveryRate = h.sent > 0 ? Math.round(((h.sent - h.bounced) / h.sent) * 1000) / 10 : 0
          return {
            id: store.id,
            storeName: store.store_name,
            clientName: client?.name || "—",
            platform: "omnisend",
            deliveryRate,
            bounceRate: Math.round(h.bounceRate * 10000) / 100,
            openRate: Math.round(h.openRate * 1000) / 10,
            clickRate: Math.round(h.clickRate * 1000) / 10,
            unsubRate: Math.round(h.unsubscribeRate * 10000) / 100,
            spamRate: Math.round(h.markedAsSpamRate * 100000) / 1000,
            engagementRate: rev?.engagement_rate ?? 0,
            totalLeads: rev?.total_leads ?? 0,
            engagedLeads: rev?.engaged_leads ?? 0,
            score: h.score,
            issues: h.issues,
          }
        } catch (err) {
          log.warn(`[HealthMonitor] Omnisend fetch failed for store ${store.id}`, { error: err instanceof Error ? err.message : String(err) })
          return null
        }
      }

      // Klaviyo (caminho legacy via DB)
      const camps = campByStore.get(store.id) || []
      if (camps.length === 0 && platform !== "klaviyo") return null

      const totalRecipients = camps.reduce((sum, c) => sum + c.recipients, 0)
      const totalDelivered = camps.reduce((sum, c) => sum + c.delivered, 0)
      const totalOpened = camps.reduce((sum, c) => sum + c.opened, 0)
      const totalClicked = camps.reduce((sum, c) => sum + c.clicked, 0)
      const totalBounced = camps.reduce((sum, c) => sum + c.bounced, 0)
      const totalUnsubs = camps.reduce((sum, c) => sum + c.unsubscribed, 0)
      const totalSpam = camps.reduce((sum, c) => sum + c.spam_complaints, 0)

      const deliveryRate = totalRecipients > 0 ? (totalDelivered / totalRecipients) * 100 : 0
      const bounceRate = totalRecipients > 0 ? (totalBounced / totalRecipients) * 100 : 0
      const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0
      const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0
      const unsubRate = totalDelivered > 0 ? (totalUnsubs / totalDelivered) * 100 : 0
      const spamRate = totalDelivered > 0 ? (totalSpam / totalDelivered) * 100 : 0
      const engagementRate = rev?.engagement_rate ?? 0

      const { score, issues } = calculateKlaviyoHealthScore({
        deliveryRate, bounceRate, openRate, unsubRate, spamRate, engagementRate,
        sent: totalRecipients,
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
    }))

    const filtered = storeHealths.filter((h): h is StoreHealth => h !== null)
    filtered.sort((a, b) => a.score - b.score)

    const avgScore = filtered.length > 0
      ? Math.round(filtered.reduce((s, h) => s + h.score, 0) / filtered.length)
      : 0
    const criticalCount = filtered.filter((h) => h.score < 50).length
    const warningCount = filtered.filter((h) => h.score >= 50 && h.score < 70).length
    const healthyCount = filtered.filter((h) => h.score >= 70).length
    const totalIssues = filtered.reduce((s, h) => s + h.issues.length, 0)

    return successResponse(request, {
      stores: filtered,
      summary: { avgScore, criticalCount, warningCount, healthyCount, totalIssues, totalStores: filtered.length },
      period,
    })
  } catch (error) {
    log.error("HealthMonitor error:", error)
    return errorResponse(request, error, "health-monitor")
  }
}
