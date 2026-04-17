import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
} from "@/lib/services/unified-metrics.service"
import { logger } from "@/lib/logger"

const log = logger.child("HealthMonitor")

export const dynamic = "force-dynamic"

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

function calculateHealthScore(s: {
  deliveryRate: number; bounceRate: number; openRate: number;
  unsubRate: number; spamRate: number; engagementRate: number
}): { score: number; issues: string[] } {
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

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = request.nextUrl.searchParams.get("period") || "30d"

    const { data: stores } = await supabase
      .from("client_stores")
      .select("id, store_name, email_platform, client_id, clients(name)")
      .eq("org_id", orgId)
      .eq("is_active", true)

    if (!stores || stores.length === 0) {
      return successResponse(request, { stores: [], summary: null, period })
    }

    const storeIds = stores.map((s) => s.id)

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

    const storeHealths: StoreHealth[] = stores.map((store) => {
      const rev = revMap.get(store.id)
      const camps = campByStore.get(store.id) || []

      const totalRecipients = camps.reduce((s, c) => s + c.recipients, 0)
      const totalDelivered = camps.reduce((s, c) => s + c.delivered, 0)
      const totalOpened = camps.reduce((s, c) => s + c.opened, 0)
      const totalClicked = camps.reduce((s, c) => s + c.clicked, 0)
      const totalBounced = camps.reduce((s, c) => s + c.bounced, 0)
      const totalUnsubs = camps.reduce((s, c) => s + c.unsubscribed, 0)
      const totalSpam = camps.reduce((s, c) => s + c.spam_complaints, 0)

      const deliveryRate = totalRecipients > 0 ? (totalDelivered / totalRecipients) * 100 : 0
      const bounceRate = totalRecipients > 0 ? (totalBounced / totalRecipients) * 100 : 0
      const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0
      const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0
      const unsubRate = totalDelivered > 0 ? (totalUnsubs / totalDelivered) * 100 : 0
      const spamRate = totalDelivered > 0 ? (totalSpam / totalDelivered) * 100 : 0
      const engagementRate = rev?.engagement_rate ?? 0

      const { score, issues } = calculateHealthScore({
        deliveryRate, bounceRate, openRate, unsubRate, spamRate, engagementRate,
      })

      const client = Array.isArray(store.clients) ? store.clients[0] : store.clients

      return {
        id: store.id,
        storeName: store.store_name,
        clientName: client?.name || "—",
        platform: (store.email_platform as string) || "none",
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

    const avgScore = storeHealths.length > 0
      ? Math.round(storeHealths.reduce((s, h) => s + h.score, 0) / storeHealths.length)
      : 0
    const criticalCount = storeHealths.filter((h) => h.score < 50).length
    const warningCount = storeHealths.filter((h) => h.score >= 50 && h.score < 70).length
    const healthyCount = storeHealths.filter((h) => h.score >= 70).length
    const totalIssues = storeHealths.reduce((s, h) => s + h.issues.length, 0)

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
