import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { klaviyoRequest, withConcurrencyLimit } from "@/lib/integrations/klaviyo"
import { handleCorsPreFlight } from "@/lib/cors"

// Handle OPTIONS preflight requests
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

interface KlaviyoMetricResponse {
  data: Array<{
    id: string
    attributes: {
      name: string
      created: string
      updated: string
      integration: {
        name: string
      } | null
    }
  }>
}

interface KlaviyoListResponse {
  data: Array<{
    id: string
    attributes: {
      name: string
      created: string
      updated: string
      profile_count?: number
    }
  }>
}

interface KlaviyoListDetailResponse {
  data: {
    id: string
    attributes: {
      name: string
      profile_count?: number
    }
  }
}

interface KlaviyoFlowResponse {
  data: Array<{
    id: string
    attributes: {
      name: string
      status: string
      created: string
      updated: string
    }
  }>
}

interface KlaviyoCampaignResponse {
  data: Array<{
    id: string
    attributes: {
      name: string
      status: string
      send_time?: string
      created_at: string
      audiences: {
        included: Array<{ type: string; id: string }>
      }
    }
  }>
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Validate user has access to this store (multi-tenant isolation)
    await requireStoreAccess(storeId, user.id)

    const storeData = await getStoreCredentials(storeId)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key
    if (!apiKey) {
      throw new AppError("API Key do Klaviyo não configurada", 400)
    }

    // Fetch data in parallel
    // AK-5: removed additional-fields[list]=profile_count from /lists/ collection.
    // additional-fields on collections degrades rate limit tier from S to XS.
    // profile_count is fetched via individual /lists/{id}/ endpoints below.
    const emptyList: KlaviyoListResponse = { data: [] }
    const emptyFlow: KlaviyoFlowResponse = { data: [] }
    const emptyCampaign: KlaviyoCampaignResponse = { data: [] }
    const emptyMetric: KlaviyoMetricResponse = { data: [] }
    const [lists, flows, emailCampaigns, smsCampaigns, metrics] = await Promise.all([
      klaviyoRequest<KlaviyoListResponse>(apiKey, "/lists/", { logTag: "Klaviyo Metrics" }).then(r => r ?? emptyList),
      klaviyoRequest<KlaviyoFlowResponse>(apiKey, "/flows/", { logTag: "Klaviyo Metrics" }).then(r => r ?? emptyFlow),
      klaviyoRequest<KlaviyoCampaignResponse>(apiKey, "/campaigns/?filter=equals(messages.channel,'email')", { logTag: "Klaviyo Metrics" }).then(r => r ?? emptyCampaign),
      klaviyoRequest<KlaviyoCampaignResponse>(apiKey, "/campaigns/?filter=equals(messages.channel,'sms')", { logTag: "Klaviyo Metrics" }).then(r => r ?? emptyCampaign),
      klaviyoRequest<KlaviyoMetricResponse>(apiKey, "/metrics/", { logTag: "Klaviyo Metrics" }).then(r => r ?? emptyMetric),
    ])

    // AK-5: Fetch profile_count via individual endpoints if collection didn't include it.
    // additional-fields works on individual endpoints (/lists/{id}/) without tier penalty.
    const needsProfileCount = lists.data.length > 0 && lists.data.every(l => l.attributes.profile_count == null)
    if (needsProfileCount) {
      await withConcurrencyLimit(lists.data, 3, async (list) => {
        const detail = await klaviyoRequest<KlaviyoListDetailResponse>(
          apiKey,
          `/lists/${list.id}/?additional-fields[list]=profile_count`,
          { logTag: "Klaviyo Metrics" }
        )
        if (detail?.data?.attributes?.profile_count != null) {
          list.attributes.profile_count = detail.data.attributes.profile_count
        }
      })
    }

    // Combine email + SMS campaigns
    const campaigns = { data: [...emailCampaigns.data, ...smsCampaigns.data] }

    // Calculate totals
    const totalProfiles = lists.data.reduce((sum, list) => sum + (list.attributes.profile_count ?? 0), 0)
    const activeFlows = flows.data.filter(f => f.attributes.status === "live").length
    const sentCampaigns = campaigns.data.filter(c => c.attributes.status === "sent").length
    const scheduledCampaigns = campaigns.data.filter(c => c.attributes.status === "scheduled").length

    // Get specific list details if klaviyo_list_id is set
    let mainList = null
    if (storeData.klaviyo_list_id) {
      const listData = lists.data.find(l => l.id === storeData.klaviyo_list_id)
      if (listData) {
        mainList = {
          id: listData.id,
          name: listData.attributes.name,
          profileCount: listData.attributes.profile_count,
          created: listData.attributes.created,
        }
      }
    }

    return NextResponse.json({
      success: true,
      connected: true,
      storeName: storeData.store_name,
      summary: {
        totalProfiles,
        totalLists: lists.data.length,
        activeFlows,
        totalFlows: flows.data.length,
        sentCampaigns,
        scheduledCampaigns,
        totalCampaigns: campaigns.data.length,
        totalMetrics: metrics.data.length,
      },
      mainList,
      lists: lists.data.map(l => ({
        id: l.id,
        name: l.attributes.name,
        profileCount: l.attributes.profile_count,
        created: l.attributes.created,
      })),
      flows: flows.data.map(f => ({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        created: f.attributes.created,
      })),
      campaigns: campaigns.data.slice(0, 10).map(c => ({
        id: c.id,
        name: c.attributes.name,
        status: c.attributes.status,
        sendTime: c.attributes.send_time,
        createdAt: c.attributes.created_at,
      })),
      metrics: metrics.data.slice(0, 20).map(m => ({
        id: m.id,
        name: m.attributes.name,
        integration: m.attributes.integration?.name,
        created: m.attributes.created,
      })),
    })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoMetrics")
  }
}
