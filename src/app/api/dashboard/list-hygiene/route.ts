import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
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

    const [{ data: revRows }, { data: campRows }] = await Promise.all([
      supabase
        .from("store_revenue_summary")
        .select("store_id, total_leads, engaged_leads, engagement_rate, client_stores!inner(id, store_name, client_id, clients(name))")
        .eq("org_id", orgId)
        .eq("period_label", period),
      supabase
        .from("klaviyo_campaign_metrics")
        .select("store_id, recipients, delivered, bounced, unsubscribed, spam_complaints")
        .eq("org_id", orgId)
        .eq("period_label", period),
    ])

    const campByStore = new Map<string, { recipients: number; delivered: number; bounced: number; unsubs: number; spam: number }>()
    for (const c of campRows || []) {
      const existing = campByStore.get(c.store_id) || { recipients: 0, delivered: 0, bounced: 0, unsubs: 0, spam: 0 }
      existing.recipients += Number(c.recipients) || 0
      existing.delivered += Number(c.delivered) || 0
      existing.bounced += Number(c.bounced) || 0
      existing.unsubs += Number(c.unsubscribed) || 0
      existing.spam += Number(c.spam_complaints) || 0
      campByStore.set(c.store_id, existing)
    }

    const stores = (revRows || []).map((r) => {
      const storeData = r.client_stores as unknown as {
        id: string; store_name: string; client_id: string | null; clients: { name: string } | null
      }
      const camp = campByStore.get(r.store_id)

      const totalLeads = Number(r.total_leads) || 0
      const engagedLeads = Number(r.engaged_leads) || 0
      const unengaged = Math.max(0, totalLeads - engagedLeads)
      const engagementRate = Number(r.engagement_rate) || 0

      const bounceRate = camp && camp.recipients > 0 ? (camp.bounced / camp.recipients) * 100 : 0
      const unsubRate = camp && camp.delivered > 0 ? (camp.unsubs / camp.delivered) * 100 : 0
      const spamRate = camp && camp.delivered > 0 ? (camp.spam / camp.delivered) * 100 : 0

      const suppressionRecommended = unengaged > 0 && (engagementRate < 30 || bounceRate > 2 || spamRate > 0.1)

      const estimatedSavings = suppressionRecommended ? Math.round(unengaged * 0.002 * 100) / 100 : 0

      return {
        id: r.store_id,
        storeName: storeData.store_name,
        clientName: storeData.clients?.name || "—",
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
