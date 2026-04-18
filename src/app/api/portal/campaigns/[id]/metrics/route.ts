import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolvePortalClient } from "@/lib/api/portal-auth"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET - Fetch full cached metrics for a specific campaign
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params

    // Validate UUID format before hitting DB
    if (!UUID_RE.test(campaignId)) {
      throw new AppError("ID de campanha inválido", 400)
    }

    const supabase = await createClient()
    const adminClient = createAdminClient()

    const user = await requireAuth(supabase)
    const ctx = await resolvePortalClient(adminClient, user.id)

    // 1. Validate campaign belongs to one of the client's stores
    const { data: campaign } = await adminClient
      .from("campaigns")
      .select("id, store_id, klaviyo_campaign_id")
      .eq("id", campaignId)
      .in("store_id", ctx.storeIds)
      .single()

    if (!campaign) {
      return successResponse(request, { metrics: null })
    }

    // If campaign has no klaviyo_campaign_id (manual campaign), no metrics available
    if (!campaign.klaviyo_campaign_id) {
      return successResponse(request, { metrics: null })
    }

    // 2. Fetch full metrics from cache — tenta Klaviyo primeiro, depois Omnisend.
    //    O campo klaviyo_campaign_id e reutilizado para armazenar o ID externo
    //    independente da plataforma (em lojas Omnisend, ele contem o campaignID
    //    do Omnisend).
    const [klaviyoMetrics, omnisendMetrics] = await Promise.all([
      adminClient
        .from("klaviyo_campaign_metrics")
        .select("*")
        .eq("store_id", campaign.store_id)
        .eq("campaign_id", campaign.klaviyo_campaign_id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from("omnisend_campaign_metrics")
        .select("*")
        .eq("store_id", campaign.store_id)
        .eq("campaign_id", campaign.klaviyo_campaign_id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // Prefere qualquer um que tenha resultado (cada loja usa UMA plataforma).
    const metrics = klaviyoMetrics.data || omnisendMetrics.data

    if (!metrics) {
      return successResponse(request, { metrics: null })
    }

    // 3. Remove ALL internal fields before returning
    const {
      org_id: _orgId,
      period_start: _periodStart,
      period_end: _periodEnd,
      period_label: _periodLabel,
      ...safeMetrics
    } = metrics

    return successResponse(request, { metrics: safeMetrics })
  } catch (error) {
    return errorResponse(request, error, "PortalCampaignMetrics")
  }
}
