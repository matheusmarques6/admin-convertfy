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

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List campaigns with filters
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

    let query = supabase
      .from("campaigns")
      .select(`
        *,
        store:client_stores(id, store_name, platform),
        client:clients(id, name, company)
      `)
      .order("scheduled_date", { ascending: true })

    if (storeId) query = query.eq("store_id", storeId)
    if (clientId) query = query.eq("client_id", clientId)
    if (startDate) query = query.gte("scheduled_date", startDate)
    if (endDate) query = query.lte("scheduled_date", endDate)
    if (status) query = query.eq("status", status)
    if (channel) query = query.eq("channel", channel)

    const { data: campaigns, error } = await query

    if (error) {
      log.error("Error fetching campaigns", { error: error.message })
      throw new AppError("Erro ao buscar campanhas", 500)
    }

    return successResponse(request, { campaigns: campaigns || [] })
  } catch (error) {
    return errorResponse(request, error, "Campaigns GET")
  }
}

// POST - Create new campaign
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await parseAndValidate(request, campaignCreateSchema)

    // Build send_datetime if time is provided
    let send_datetime = null
    if (body.scheduled_date && body.scheduled_time) {
      send_datetime = `${body.scheduled_date}T${body.scheduled_time}:00`
    }

    const campaignData = {
      store_id: body.store_id,
      client_id: body.client_id,
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
        store:client_stores(id, store_name, platform),
        client:clients(id, name, company)
      `)
      .single()

    if (error) {
      log.error("Campaign insert failed", { error: error.message })
      throw new AppError("Erro ao criar campanha", 500)
    }

    return successResponse(request, { campaign }, { status: 201, message: "Campanha criada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Campaigns POST")
  }
}
