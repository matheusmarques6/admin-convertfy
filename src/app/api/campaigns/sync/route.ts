import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Klaviyo API configuration
const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15"

// CORS headers
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// Klaviyo API request helper
async function klaviyoRequest<T>(
  apiKey: string,
  endpoint: string
): Promise<T | null> {
  try {
    const response = await fetch(`${KLAVIYO_API_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "revision": KLAVIYO_REVISION,
      },
    })

    if (!response.ok) {
      console.error(`[Klaviyo Sync] API error: ${response.status}`)
      return null
    }

    return await response.json() as T
  } catch (error) {
    console.error("[Klaviyo Sync] Request error:", error)
    return null
  }
}

// Type for Klaviyo campaign response
interface KlaviyoCampaign {
  id: string
  attributes: {
    name: string
    status: string
    send_time: string | null
    created_at: string
    archived: boolean
    channel: string
    message: string
  }
}

interface KlaviyoCampaignsResponse {
  data: KlaviyoCampaign[]
  links?: { next?: string }
}

// POST - Sync campaigns from Klaviyo for a specific store
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders() }
      )
    }

    const body = await request.json()
    const { store_id } = body

    if (!store_id) {
      return NextResponse.json(
        { error: "store_id é obrigatório" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Get store with Klaviyo credentials
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("id, client_id, store_name, klaviyo_private_key, klaviyo_api_key")
      .eq("id", store_id)
      .single()

    if (storeError || !store) {
      return NextResponse.json(
        { error: "Loja não encontrada" },
        { status: 404, headers: corsHeaders() }
      )
    }

    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json(
        { error: "Klaviyo API Key não configurada para esta loja" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Fetch campaigns from Klaviyo
    console.log(`[Klaviyo Sync] Fetching campaigns for store: ${store.store_name}`)

    const allCampaigns: KlaviyoCampaign[] = []
    let nextPage: string | null = "/campaigns?page[size]=100"

    while (nextPage) {
      const response: KlaviyoCampaignsResponse | null = await klaviyoRequest<KlaviyoCampaignsResponse>(apiKey, nextPage)

      if (!response?.data) break

      allCampaigns.push(...response.data)

      const nextUrl: string | undefined = response.links?.next
      nextPage = nextUrl ? nextUrl.replace(KLAVIYO_API_URL, "") : null

      // Rate limiting
      if (nextPage) await new Promise(resolve => setTimeout(resolve, 300))
    }

    console.log(`[Klaviyo Sync] Found ${allCampaigns.length} campaigns`)

    // Process and upsert campaigns
    let synced = 0
    let errors = 0

    for (const klaviyoCampaign of allCampaigns) {
      try {
        const sendTime = klaviyoCampaign.attributes.send_time
        let scheduledDate: string | null = null
        let scheduledTime: string | null = null

        if (sendTime) {
          const date = new Date(sendTime)
          scheduledDate = date.toISOString().split("T")[0]
          scheduledTime = date.toISOString().split("T")[1].substring(0, 5)
        } else {
          // Use created_at if no send_time
          const date = new Date(klaviyoCampaign.attributes.created_at)
          scheduledDate = date.toISOString().split("T")[0]
        }

        // Map Klaviyo status to our status
        let status: "draft" | "scheduled" | "sent" | "cancelled" = "draft"
        switch (klaviyoCampaign.attributes.status) {
          case "sent":
            status = "sent"
            break
          case "scheduled":
            status = "scheduled"
            break
          case "cancelled":
            status = "cancelled"
            break
          default:
            status = "draft"
        }

        // Map channel
        const channel = klaviyoCampaign.attributes.channel === "sms" ? "sms" : "email"

        const campaignData = {
          store_id: store.id,
          client_id: store.client_id,
          name: klaviyoCampaign.attributes.name,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          send_datetime: sendTime,
          channel,
          campaign_type: "promotional" as const,
          status,
          klaviyo_campaign_id: klaviyoCampaign.id,
          color: channel === "sms" ? "#10b981" : "#3b82f6",
          created_by: user.id,
        }

        // Check if campaign already exists
        const { data: existing } = await supabase
          .from("campaigns")
          .select("id")
          .eq("klaviyo_campaign_id", klaviyoCampaign.id)
          .single()

        if (existing) {
          // Update existing
          await supabase
            .from("campaigns")
            .update({
              name: campaignData.name,
              scheduled_date: campaignData.scheduled_date,
              scheduled_time: campaignData.scheduled_time,
              send_datetime: campaignData.send_datetime,
              status: campaignData.status,
            })
            .eq("id", existing.id)
        } else {
          // Insert new
          await supabase.from("campaigns").insert(campaignData)
        }

        synced++
      } catch (err) {
        console.error(`[Klaviyo Sync] Error processing campaign ${klaviyoCampaign.id}:`, err)
        errors++
      }
    }

    console.log(`[Klaviyo Sync] Synced ${synced} campaigns, ${errors} errors`)

    return NextResponse.json(
      {
        success: true,
        message: `Sincronizado ${synced} campanhas`,
        synced,
        errors,
        total: allCampaigns.length,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Campaigns Sync] Error:", error)
    return NextResponse.json(
      { error: "Erro ao sincronizar campanhas" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
