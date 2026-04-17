import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  getUnifiedRevenue,
  getUnifiedCampaigns,
} from "@/lib/services/unified-metrics.service"
import { logger } from "@/lib/logger"

const log = logger.child("ListHygiene")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const supabase = await createAdminClient()

    const period = request.nextUrl.searchParams.get("period") || "30d"

    const { data: storesMeta } = await supabase
      .from("client_stores")
      .select("id, store_name, email_platform, client_id, clients(name)")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .limit(500)

    if (!storesMeta || storesMeta.length === 0) {
      return successResponse(request, { stores: [], summary: null, period })
    }

    const storeIds = storesMeta.map((s) => s.id)

    const [revenueRows, campaignRows] = await Promise.all([
      getUnifiedRevenue(supabase, orgId, [period], storeIds),
      getUnifiedCampaigns(supabase, orgId, period, storeIds),
    ])

    const revMap = new Map(revenueRows.map((r) => [r.store_id, r]))
    const campByStore = new Map<string, { recipients: number; delivered: number; bounced: number; unsubs: number; spam: number }>()
    for (const c of campaignRows) {
      const existing = campByStore.get(c.store_id) || { recipients: 0, delivered: 0, bounced: 0, unsubs: 0, spam: 0 }
      existing.recipients += c.recipients
      existing.delivered += c.delivered
      existing.bounced += c.bounced
      existing.unsubs += c.unsubscribed
      existing.spam += c.spam_complaints
      campByStore.set(c.store_id, existing)
    }

    const stores = storesMeta.map((storeMeta) => {
      const rev = revMap.get(storeMeta.id)
      const camp = campByStore.get(storeMeta.id)
      const clientData = Array.isArray(storeMeta.clients) ? storeMeta.clients[0] : storeMeta.clients

      const totalLeads = rev?.total_leads ?? 0
      const engagedLeads = rev?.engaged_leads ?? 0
      const unengaged = Math.max(0, totalLeads - engagedLeads)
      const engagementRate = rev?.engagement_rate ?? 0

      const bounceRate = camp && camp.recipients > 0 ? (camp.bounced / camp.recipients) * 100 : 0
      const unsubRate = camp && camp.delivered > 0 ? (camp.unsubs / camp.delivered) * 100 : 0
      const spamRate = camp && camp.delivered > 0 ? (camp.spam / camp.delivered) * 100 : 0

      const suppressionRecommended = unengaged > 0 && (
        engagementRate < 30 || bounceRate > 2 || spamRate > 0.1
      )

      const estimatedSavings = suppressionRecommended ? Math.round(unengaged * 0.002 * 100) / 100 : 0

      return {
        id: storeMeta.id,
        storeName: storeMeta.store_name,
        clientName: clientData?.name || "—",
        platform: (storeMeta.email_platform as string) || "none",
        totalLeads,
        engagedLeads,
        unengaged,
        engagementRate: Math.round(engagementRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 100) / 100,
        unsubRate: Math.round(unsubRate * 100) / 100,
        spamRate: Math.round(spamRate * 1000) / 1000,
        suppressionRecommended,
        estimatedSavings,
      }
    })

    stores.sort((a, b) => b.unengaged - a.unengaged)

    const totalLeadsAll = stores.reduce((s, st) => s + st.totalLeads, 0)
    const totalUnengaged = stores.reduce((s, st) => s + st.unengaged, 0)
    const storesNeedingCleanup = stores.filter((s) => s.suppressionRecommended).length
    const totalEstimatedSavings = stores.reduce((s, st) => s + st.estimatedSavings, 0)

    return successResponse(request, {
      stores,
      summary: {
        totalLeads: totalLeadsAll,
        totalUnengaged,
        cleanupRate: totalLeadsAll > 0 ? Math.round((totalUnengaged / totalLeadsAll) * 100) : 0,
        storesNeedingCleanup,
        totalEstimatedSavings: Math.round(totalEstimatedSavings * 100) / 100,
      },
      period,
    })
  } catch (error) {
    log.error("ListHygiene error:", error)
    return errorResponse(request, error, "list-hygiene")
  }
}
