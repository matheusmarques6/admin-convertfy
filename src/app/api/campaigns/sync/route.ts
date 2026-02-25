import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireRole, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { KLAVIYO_API_URL, KLAVIYO_REVISION } from "@/lib/integrations/klaviyo/client"

const log = logger.child("CampaignsSync")

// Max campaigns to fetch per sync to prevent memory exhaustion
const MAX_CAMPAIGNS = 10000
const MAX_PAGES = 200

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Klaviyo API request helper with retry on 429
async function klaviyoRequest<T>(
  apiKey: string,
  endpoint: string,
  retries = 3
): Promise<{ data: T | null; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
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

      if (response.status === 429 && attempt < retries) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "5", 10)
        log.warn(`[Klaviyo Sync] Rate limited, retrying in ${retryAfter}s (attempt ${attempt + 1}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        continue
      }

      if (!response.ok) {
        const errorMsg = `API error: ${response.status}`
        log.error(`[Klaviyo Sync] ${errorMsg}`)
        return { data: null, error: errorMsg }
      }

      return { data: await response.json() as T }
    } catch (error) {
      log.error("[Klaviyo Sync] Request error:", error)
      return { data: null, error: "Network error" }
    }
  }
  return { data: null, error: "Max retries exceeded" }
}

// Klaviyo POST request helper with retry on 429
async function klaviyoPost<T>(
  apiKey: string,
  endpoint: string,
  body: unknown,
  retries = 2
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${KLAVIYO_API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
          "revision": KLAVIYO_REVISION,
        },
        body: JSON.stringify(body),
      })

      if (response.status === 429 && attempt < retries) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "5", 10)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        continue
      }

      if (!response.ok) {
        log.error(`[Klaviyo Sync] POST API error: ${response.status}`)
        return null
      }

      return await response.json() as T
    } catch (error) {
      log.error("[Klaviyo Sync] POST request error:", error)
      return null
    }
  }
  return null
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

// Type for Klaviyo campaign values report
interface KlaviyoReportResult {
  attributes: {
    results: Array<{
      group_by: { "campaign_id": string }
      statistics: {
        "email_recipients_count"?: number
        "email_delivered_count"?: number
        "email_open_unique_count"?: number
        "email_click_unique_count"?: number
        "email_conversion_unique_count"?: number
        "email_conversion_value"?: number
        "sms_recipients_count"?: number
        "sms_delivered_count"?: number
        "sms_click_unique_count"?: number
        "sms_conversion_unique_count"?: number
        "sms_conversion_value"?: number
      }
    }>
  }
}

// UUID validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Safely extract relative path from Klaviyo next URL
function extractNextPagePath(nextUrl: string): string | null {
  try {
    const url = new URL(nextUrl)
    if (!url.hostname.endsWith("klaviyo.com")) {
      log.warn(`[Klaviyo Sync] Unexpected hostname in next URL: ${url.hostname}`)
      return null
    }
    return url.pathname + url.search
  } catch {
    log.warn(`[Klaviyo Sync] Invalid next URL: ${nextUrl}`)
    return null
  }
}

// Fetch campaign metrics from Klaviyo reporting API
async function fetchCampaignMetrics(
  apiKey: string,
  campaignIds: string[],
  channel: "email" | "sms"
): Promise<Map<string, { recipients: number; delivered: number; opened: number; clicked: number; converted: number; revenue: number }>> {
  const metricsMap = new Map<string, { recipients: number; delivered: number; opened: number; clicked: number; converted: number; revenue: number }>()

  if (campaignIds.length === 0) return metricsMap

  // Process in batches of 100 (Klaviyo limit)
  const batchSize = 100
  for (let i = 0; i < campaignIds.length; i += batchSize) {
    const batch = campaignIds.slice(i, i + batchSize)

    // Validate IDs are alphanumeric before interpolation
    const validIds = batch.filter(id => /^[a-zA-Z0-9_-]+$/.test(id))
    if (validIds.length === 0) continue

    const statistics = channel === "email"
      ? [
          "email_recipients_count",
          "email_delivered_count",
          "email_open_unique_count",
          "email_click_unique_count",
          "email_conversion_unique_count",
          "email_conversion_value",
        ]
      : [
          "sms_recipients_count",
          "sms_delivered_count",
          "sms_click_unique_count",
          "sms_conversion_unique_count",
          "sms_conversion_value",
        ]

    const reportBody = {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics,
          filter: `in(campaign_id,[${validIds.map(id => `"${id}"`).join(",")}])`,
          group_by: ["campaign_id"],
        },
      },
    }

    const report = await klaviyoPost<KlaviyoReportResult>(
      apiKey,
      "/campaign-values-reports",
      reportBody
    )

    if (report?.attributes?.results) {
      for (const result of report.attributes.results) {
        const campaignId = result.group_by["campaign_id"]
        const stats = result.statistics

        if (channel === "email") {
          metricsMap.set(campaignId, {
            recipients: stats["email_recipients_count"] || 0,
            delivered: stats["email_delivered_count"] || 0,
            opened: stats["email_open_unique_count"] || 0,
            clicked: stats["email_click_unique_count"] || 0,
            converted: stats["email_conversion_unique_count"] || 0,
            revenue: stats["email_conversion_value"] || 0,
          })
        } else {
          metricsMap.set(campaignId, {
            recipients: stats["sms_recipients_count"] || 0,
            delivered: stats["sms_delivered_count"] || 0,
            opened: 0,
            clicked: stats["sms_click_unique_count"] || 0,
            converted: stats["sms_conversion_unique_count"] || 0,
            revenue: stats["sms_conversion_value"] || 0,
          })
        }
      }
    }

    // Rate limiting between batches
    if (i + batchSize < campaignIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return metricsMap
}

// POST - Sync campaigns from Klaviyo for a specific store
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // C1 FIX: Require admin role
    const user = await requireRole(supabase, ["admin", "super_admin"])

    const body = await request.json()
    const { store_id } = body

    if (!store_id || !UUID_REGEX.test(store_id)) {
      throw new AppError("store_id inválido", 400)
    }

    // C1 FIX: Verify user has access to this store via RLS
    const { data: storeCheck } = await supabase
      .from("client_stores")
      .select("id")
      .eq("id", store_id)
      .single()

    if (!storeCheck) {
      throw new AppError("Loja não encontrada ou sem permissão", 403)
    }

    // Get store with Klaviyo credentials (decrypted)
    const storeData = await getStoreCredentials(store_id)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key
    if (!apiKey) {
      throw new AppError("Klaviyo API Key não configurada para esta loja", 400)
    }

    log.debug(`[Klaviyo Sync] Fetching campaigns for store: ${storeData.store_name}`)

    const allCampaigns: KlaviyoCampaign[] = []
    let apiErrors = 0

    for (const channel of ["email", "sms"]) {
      let nextPage: string | null = `/campaigns?filter=equals(messages.channel,'${channel}')`
      let pageCount = 0

      while (nextPage && pageCount < MAX_PAGES && allCampaigns.length < MAX_CAMPAIGNS) {
        const result: { data: KlaviyoCampaignsResponse | null; error?: string } = await klaviyoRequest<KlaviyoCampaignsResponse>(apiKey, nextPage)

        if (result.error) {
          apiErrors++
          break
        }
        if (!result.data?.data) break

        allCampaigns.push(...result.data.data)
        pageCount++

        // H2 FIX: Safe URL extraction
        const nextUrl: string | undefined = result.data.links?.next
        nextPage = nextUrl ? extractNextPagePath(nextUrl) : null

        // Rate limiting
        if (nextPage) await new Promise(resolve => setTimeout(resolve, 300))
      }

      if (pageCount >= MAX_PAGES || allCampaigns.length >= MAX_CAMPAIGNS) {
        log.warn(`[Klaviyo Sync] Hit pagination limit: ${pageCount} pages, ${allCampaigns.length} campaigns`)
      }
    }

    log.debug(`[Klaviyo Sync] Found ${allCampaigns.length} campaigns (${apiErrors} API errors)`)

    // Fetch metrics for sent campaigns
    const sentEmailIds = allCampaigns
      .filter(c => c.attributes.status === "sent" && c.attributes.channel !== "sms")
      .map(c => c.id)
    const sentSmsIds = allCampaigns
      .filter(c => c.attributes.status === "sent" && c.attributes.channel === "sms")
      .map(c => c.id)

    const [emailMetrics, smsMetrics] = await Promise.all([
      fetchCampaignMetrics(apiKey, sentEmailIds, "email"),
      fetchCampaignMetrics(apiKey, sentSmsIds, "sms"),
    ])

    // H4 FIX: Pre-fetch existing campaign IDs to avoid N+1 queries
    const { data: existingCampaigns } = await supabase
      .from("campaigns")
      .select("id, klaviyo_campaign_id")
      .eq("store_id", store_id)
      .not("klaviyo_campaign_id", "is", null)

    const existingMap = new Map<string, string>()
    if (existingCampaigns) {
      for (const c of existingCampaigns) {
        if (c.klaviyo_campaign_id) {
          existingMap.set(c.klaviyo_campaign_id, c.id)
        }
      }
    }

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
          if (isNaN(date.getTime())) {
            log.warn(`[Klaviyo Sync] Invalid send_time for campaign ${klaviyoCampaign.id}: ${sendTime}`)
            continue
          }
          scheduledDate = date.toISOString().split("T")[0]
          scheduledTime = date.toISOString().split("T")[1].substring(0, 5)
        } else {
          const date = new Date(klaviyoCampaign.attributes.created_at)
          if (isNaN(date.getTime())) continue
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

        const channel = klaviyoCampaign.attributes.channel === "sms" ? "sms" : "email"
        const metrics = emailMetrics.get(klaviyoCampaign.id) || smsMetrics.get(klaviyoCampaign.id)

        const metricsData: Record<string, unknown> = {}
        if (metrics) {
          metricsData.recipients = metrics.recipients
          metricsData.delivered = metrics.delivered
          metricsData.opened = metrics.opened
          metricsData.clicked = metrics.clicked
          metricsData.converted = metrics.converted
          metricsData.revenue = metrics.revenue
        }

        // C2 FIX: Use pre-fetched map with store_id scoping
        const existingId = existingMap.get(klaviyoCampaign.id)

        if (existingId) {
          await supabase
            .from("campaigns")
            .update({
              name: klaviyoCampaign.attributes.name,
              scheduled_date: scheduledDate,
              scheduled_time: scheduledTime,
              send_datetime: sendTime,
              status,
              ...metricsData,
            })
            .eq("id", existingId)
            .eq("store_id", store_id) // C2 FIX: scope to store
        } else {
          await supabase.from("campaigns").insert({
            store_id,
            client_id: storeData.client_id,
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
            ...metricsData,
          })
        }

        synced++
      } catch (err) {
        log.error(`[Klaviyo Sync] Error processing campaign ${klaviyoCampaign.id}:`, err)
        errors++
      }
    }

    log.debug(`[Klaviyo Sync] Synced ${synced} campaigns, ${errors} errors`)

    return NextResponse.json(
      {
        success: true,
        message: `Sincronizado ${synced} campanhas`,
        synced,
        errors,
        total: allCampaigns.length,
        apiErrors,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "CampaignsSync")
  }
}
