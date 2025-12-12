import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"

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
      profile_count: number
    }
  }>
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

async function klaviyoRequest<T>(apiKey: string, endpoint: string): Promise<T> {
  const response = await fetch(`${KLAVIYO_API_URL}${endpoint}`, {
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Accept": "application/json",
      "revision": "2024-02-15",
    },
  })

  if (!response.ok) {
    throw new Error(`Klaviyo API error: ${response.status}`)
  }

  return response.json()
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400 })
    }

    // Get store with Klaviyo API key
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("klaviyo_api_key, klaviyo_list_id, name")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 })
    }

    if (!store.klaviyo_api_key) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "API Key não configurada",
      })
    }

    const apiKey = store.klaviyo_api_key

    // Fetch data in parallel
    const [lists, flows, campaigns, metrics] = await Promise.all([
      klaviyoRequest<KlaviyoListResponse>(apiKey, "/lists/").catch(() => ({ data: [] })),
      klaviyoRequest<KlaviyoFlowResponse>(apiKey, "/flows/").catch(() => ({ data: [] })),
      klaviyoRequest<KlaviyoCampaignResponse>(apiKey, "/campaigns/").catch(() => ({ data: [] })),
      klaviyoRequest<KlaviyoMetricResponse>(apiKey, "/metrics/").catch(() => ({ data: [] })),
    ])

    // Calculate totals
    const totalProfiles = lists.data.reduce((sum, list) => sum + (list.attributes.profile_count || 0), 0)
    const activeFlows = flows.data.filter(f => f.attributes.status === "live").length
    const sentCampaigns = campaigns.data.filter(c => c.attributes.status === "sent").length
    const scheduledCampaigns = campaigns.data.filter(c => c.attributes.status === "scheduled").length

    // Get specific list details if klaviyo_list_id is set
    let mainList = null
    if (store.klaviyo_list_id) {
      const listData = lists.data.find(l => l.id === store.klaviyo_list_id)
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
      storeName: store.name,
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
    console.error("Error fetching Klaviyo metrics:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar métricas do Klaviyo" },
      { status: 500 }
    )
  }
}
