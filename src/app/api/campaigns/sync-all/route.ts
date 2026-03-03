import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireRole, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { getStoreCredentials, KLAVIYO_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { KLAVIYO_API_URL, KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"

const log = logger.child("CampaignsSyncAll")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Lightweight Klaviyo sync for a single store (shared logic, no HTTP roundtrip)
async function syncStoreFromKlaviyo(
  storeId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ synced: number; errors: number; status: string }> {
  try {
    const storeData = await getStoreCredentials(storeId)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key

    if (!apiKey || apiKey.trim() === "") {
      return { synced: 0, errors: 0, status: "no_key" }
    }

    // Fetch campaigns from Klaviyo (limited to recent — last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const allCampaigns: Array<{ id: string; attributes: { name: string; status: string; send_time: string | null; created_at: string; channel: string } }> = []
    const maxPages = 50

    for (const channel of ["email", "sms"]) {
      let nextPage: string | null = `/campaigns?filter=equals(messages.channel,'${channel}')`
      let pageCount = 0

      while (nextPage && pageCount < maxPages && allCampaigns.length < 5000) {
        try {
          const response: Response = await fetch(`${KLAVIYO_API_URL}${nextPage}`, {
            method: "GET",
            headers: {
              "Authorization": `Klaviyo-API-Key ${apiKey}`,
              "Accept": "application/json",
              "Content-Type": "application/json",
              "revision": KLAVIYO_REVISION,
            },
            signal: AbortSignal.timeout(30000),
          })

          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get("retry-after") || "10", 10)
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
            continue
          }

          if (!response.ok) break

          const data: { data?: Array<{ id: string; attributes: { name: string; status: string; send_time: string | null; created_at: string; channel: string } }>; links?: { next?: string } } = await response.json()
          if (!data?.data) break

          allCampaigns.push(...data.data)
          pageCount++

          // Safe URL extraction
          const nextUrl: string | undefined = data.links?.next
          if (nextUrl) {
            try {
              const url: URL = new URL(nextUrl)
              if (url.hostname.endsWith("klaviyo.com")) {
                nextPage = url.pathname + url.search
              } else {
                nextPage = null
              }
            } catch {
              nextPage = null
            }
          } else {
            nextPage = null
          }

          if (nextPage) await new Promise(resolve => setTimeout(resolve, 300))
        } catch {
          break
        }
      }
    }

    if (allCampaigns.length === 0) {
      return { synced: 0, errors: 0, status: "empty" }
    }

    // Pre-fetch existing campaigns for this store
    const { data: existingCampaigns } = await supabase
      .from("campaigns")
      .select("id, klaviyo_campaign_id")
      .eq("store_id", storeId)
      .not("klaviyo_campaign_id", "is", null)

    const existingMap = new Map<string, string>()
    if (existingCampaigns) {
      for (const c of existingCampaigns) {
        if (c.klaviyo_campaign_id) existingMap.set(c.klaviyo_campaign_id, c.id)
      }
    }

    let synced = 0
    let errors = 0

    for (const campaign of allCampaigns) {
      try {
        const sendTime = campaign.attributes.send_time
        let scheduledDate: string | null = null
        let scheduledTime: string | null = null

        if (sendTime) {
          const date = new Date(sendTime)
          if (isNaN(date.getTime())) continue
          scheduledDate = date.toISOString().split("T")[0]
          scheduledTime = date.toISOString().split("T")[1].substring(0, 5)
        } else {
          const date = new Date(campaign.attributes.created_at)
          if (isNaN(date.getTime())) continue
          scheduledDate = date.toISOString().split("T")[0]
        }

        let status: "draft" | "scheduled" | "sent" | "cancelled" = "draft"
        switch (campaign.attributes.status) {
          case "sent": status = "sent"; break
          case "scheduled": status = "scheduled"; break
          case "cancelled": status = "cancelled"; break
        }

        const ch = campaign.attributes.channel === "sms" ? "sms" : "email"
        const existingId = existingMap.get(campaign.id)

        if (existingId) {
          await supabase
            .from("campaigns")
            .update({ name: campaign.attributes.name, scheduled_date: scheduledDate, scheduled_time: scheduledTime, send_datetime: sendTime, status })
            .eq("id", existingId)
            .eq("store_id", storeId)
        } else {
          await supabase.from("campaigns").insert({
            store_id: storeId,
            client_id: storeData.client_id,
            name: campaign.attributes.name,
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            send_datetime: sendTime,
            channel: ch,
            campaign_type: "promotional" as const,
            status,
            klaviyo_campaign_id: campaign.id,
            color: ch === "sms" ? "#10b981" : "#3b82f6",
            created_by: userId,
          })
        }
        synced++
      } catch {
        errors++
      }
    }

    return { synced, errors, status: "success" }
  } catch (err) {
    log.error(`[SyncAll] Error syncing store ${storeId}:`, err)
    return { synced: 0, errors: 0, status: "error" }
  }
}

// POST - Trigger sync for all stores that have Klaviyo API keys
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // C3 FIX: Require admin role
    const user = await requireRole(supabase, ["admin", "super_admin"])

    const adminClient = createAdminClient()

    // Get all active stores with Klaviyo credentials (filter empty strings too)
    const { data: stores, error: storesError } = await adminClient
      .from("client_stores")
      .select("id, store_name")
      .eq("is_active", true)
      .or(KLAVIYO_CREDENTIALS_FILTER)

    if (storesError) {
      log.error("[SyncAll] Error fetching stores:", storesError)
      throw new AppError("Erro ao buscar lojas", 500)
    }

    if (!stores || stores.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "Nenhuma loja com Klaviyo configurado",
          results: [],
        },
        { headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    log.debug(`[SyncAll] Found ${stores.length} stores with Klaviyo keys`)

    // C4 FIX: Call sync logic directly instead of internal HTTP
    const results: Array<{ store_name: string; synced: number; errors: number; status: string }> = []

    for (const store of stores) {
      const result = await syncStoreFromKlaviyo(store.id, user.id, supabase)
      results.push({
        store_name: store.store_name,
        synced: result.synced,
        errors: result.errors,
        status: result.status,
      })

      // Rate limiting between stores
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
    const totalFailed = results.filter(r => r.status === "error").length

    return NextResponse.json(
      {
        success: true,
        message: `Sincronizado ${totalSynced} campanhas de ${stores.length} lojas`,
        totalSynced,
        totalStores: stores.length,
        failedStores: totalFailed,
        results,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "CampaignsSyncAll")
  }
}
