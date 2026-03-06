import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  AppError,
} from "@/lib/api/errors"
import { campaignCreateSchema } from "@/lib/schemas/common"
import { logger } from "@/lib/logger"

const log = logger.child("Campaigns")

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado", 403)
  }
  return orgMember.org_id
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List campaigns with filters (unified: campaigns + campaign_batches)
// C5 FIX: RLS on supabase client already scopes to user's org
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const clientId = searchParams.get("client_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const status = searchParams.get("status")
    const channel = searchParams.get("channel")
    const includeUnified = searchParams.get("unified") !== "false"

    // 1. Fetch from campaigns table (RLS scoped to user's accessible stores)
    let campaignsQuery = supabase
      .from("campaigns")
      .select(`
        *,
        store:client_stores(id, store_name, platform, currency),
        client:clients(id, name, company)
      `)
      .order("scheduled_date", { ascending: true })

    if (storeId) campaignsQuery = campaignsQuery.eq("store_id", storeId)
    if (clientId) campaignsQuery = campaignsQuery.eq("client_id", clientId)
    if (startDate) campaignsQuery = campaignsQuery.gte("scheduled_date", startDate)
    if (endDate) campaignsQuery = campaignsQuery.lte("scheduled_date", endDate)
    if (status) campaignsQuery = campaignsQuery.eq("status", status)
    if (channel) campaignsQuery = campaignsQuery.eq("channel", channel)

    const { data: campaigns, error: campaignsError } = await campaignsQuery

    if (campaignsError) {
      log.error("Error fetching campaigns", { error: campaignsError.message })
      throw new AppError("Erro ao buscar campanhas", 500)
    }

    // Track klaviyo IDs for deduplication
    const klaviyoCampaignIds = new Set<string>()

    const campaignsWithSource = (campaigns || []).map(c => {
      if (c.klaviyo_campaign_id) {
        klaviyoCampaignIds.add(c.klaviyo_campaign_id)
      }
      return {
        ...c,
        currency: (c.store as Record<string, unknown>)?.currency as string || "BRL",
        source: c.klaviyo_campaign_id ? "klaviyo" : "manual",
      }
    })

    // 2. Fetch from campaign_batches table if unified mode
    // C6 FIX: Use RLS-scoped supabase client (not adminClient)
    let batchesAsCampaigns: Array<Record<string, unknown>> = []

    if (includeUnified) {
      let batchesQuery = supabase
        .from("campaign_batches")
        .select("*")
        .order("scheduled_at", { ascending: true })

      if (startDate) batchesQuery = batchesQuery.gte("scheduled_at", startDate)
      if (endDate) batchesQuery = batchesQuery.lte("scheduled_at", endDate + "T23:59:59.999Z")
      if (status) {
        const batchStatusMap: Record<string, string> = {
          sent: "completed",
          scheduled: "scheduled",
          cancelled: "cancelled",
          draft: "scheduled",
        }
        const batchStatus = batchStatusMap[status] || status
        batchesQuery = batchesQuery.eq("status", batchStatus)
      }
      if (channel) batchesQuery = batchesQuery.eq("campaign_type", channel)

      const { data: batches, error: batchesError } = await batchesQuery

      if (batchesError) {
        log.error("Error fetching campaign_batches", { error: batchesError.message })
        // Continue with campaigns only — don't fail entire request
      }

      if (batches && batches.length > 0) {
        // Filter by storeId if specified, using contains
        const filteredBatches = storeId
          ? batches.filter(b => (b.store_ids || []).includes(storeId))
          : batches

        // Get store names for batches
        const allStoreIds = [...new Set(
          filteredBatches.flatMap(b => (b.store_ids || []).filter(Boolean))
        )]

        let storeNameMap: Record<string, string> = {}
        let storeCurrencyMap: Record<string, string> = {}
        if (allStoreIds.length > 0) {
          const { data: storesData } = await supabase
            .from("client_stores")
            .select("id, store_name, currency")
            .in("id", allStoreIds)

          if (storesData) {
            storeNameMap = Object.fromEntries(storesData.map(s => [s.id, s.store_name]))
            storeCurrencyMap = Object.fromEntries(storesData.map(s => [s.id, (s as Record<string, unknown>).currency as string || "BRL"]))
          }
        }

        batchesAsCampaigns = filteredBatches.map(batch => {
          const scheduledAt = new Date(batch.scheduled_at)
          const scheduledDate = scheduledAt.toISOString().split("T")[0]
          const scheduledTime = scheduledAt.toISOString().split("T")[1]?.substring(0, 5)

          const statusMap: Record<string, string> = {
            scheduled: "scheduled",
            processing: "scheduled",
            completed: "sent",
            failed: "cancelled",
            cancelled: "cancelled",
          }

          const batchStoreIds: string[] = (batch.store_ids || []).filter(Boolean)
          const storeNames = batchStoreIds.map((id: string) => storeNameMap[id] || "Loja")

          return {
            id: `batch_${batch.id}`,
            batch_id: batch.id,
            store_id: batchStoreIds[0] || null,
            currency: batchStoreIds[0] ? (storeCurrencyMap[batchStoreIds[0]] || "BRL") : "BRL",
            client_id: null,
            name: batch.name,
            description: null,
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            send_datetime: batch.scheduled_at,
            channel: batch.campaign_type || "email",
            campaign_type: "promotional",
            status: statusMap[batch.status] || "scheduled",
            subject_line: null,
            preview_text: null,
            segment_name: null,
            estimated_recipients: null,
            recipients: null,
            delivered: null,
            opened: null,
            clicked: null,
            converted: null,
            revenue: null,
            klaviyo_campaign_id: null,
            tags: [],
            color: batch.campaign_type === "sms" ? "#10b981" : batch.campaign_type === "whatsapp" ? "#25d366" : "#8b5cf6",
            notes: null,
            created_by: batch.created_by,
            created_at: batch.created_at,
            updated_at: batch.updated_at,
            source: "batch",
            store_names: storeNames,
            store: batchStoreIds[0] ? {
              id: batchStoreIds[0],
              store_name: storeNames[0] || "Loja",
            } : null,
            client: null,
          }
        })
      }
    }

    // 3. Merge, sort by send_datetime for better precision
    const allResults = [...campaignsWithSource, ...batchesAsCampaigns]
      .sort((a, b) => {
        const dateA = (a.send_datetime as string) || (a.scheduled_date as string) || ""
        const dateB = (b.send_datetime as string) || (b.scheduled_date as string) || ""
        return dateA.localeCompare(dateB)
      })

    return successResponse(request, { campaigns: allResults })
  } catch (error) {
    return errorResponse(request, error, "Campaigns GET")
  }
}

// POST - Create new campaign
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(supabase, user.id)

    const body = await parseAndValidate(request, campaignCreateSchema)

    let send_datetime = null
    if (body.scheduled_date && body.scheduled_time) {
      send_datetime = `${body.scheduled_date}T${body.scheduled_time}:00`
    }

    const campaignData = {
      org_id: orgId,
      store_id: body.store_id || null,
      client_id: body.client_id || null,
      name: body.name,
      description: body.description || null,
      scheduled_date: body.scheduled_date,
      scheduled_time: body.scheduled_time || null,
      send_datetime,
      channel: body.channel,
      campaign_type: body.campaign_type,
      status: body.status,
      subject_line: body.subject_line || null,
      preview_text: body.preview_text || null,
      segment_name: body.segment_name || null,
      estimated_recipients: body.estimated_recipients || null,
      tags: body.tags || [],
      color: body.color,
      notes: body.notes || null,
      created_by: user.id,
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert(campaignData)
      .select(`
        *,
        store:client_stores(id, store_name, platform, currency),
        client:clients(id, name, company)
      `)
      .single()

    if (error) {
      log.error("Campaign insert failed", { error: error.message, code: error.code })
      throw new AppError("Erro ao criar campanha", 500)
    }

    return successResponse(request, { campaign: { ...campaign, currency: (campaign.store as Record<string, unknown>)?.currency as string || "BRL", source: "manual" } }, { status: 201, message: "Campanha criada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Campaigns POST")
  }
}
