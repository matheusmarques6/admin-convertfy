import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { CampaignFormData } from "@/types"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// CORS headers




// GET - List campaigns with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

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

    // Apply filters
    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (startDate) {
      query = query.gte("scheduled_date", startDate)
    }

    if (endDate) {
      query = query.lte("scheduled_date", endDate)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (channel) {
      query = query.eq("channel", channel)
    }

    const { data: campaigns, error } = await query

    if (error) {
      console.error("[Campaigns] Error fetching campaigns:", error)
      return NextResponse.json(
        { error: "Erro ao buscar campanhas" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json(
      { campaigns: campaigns || [] },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    console.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}

// POST - Create new campaign
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const body: CampaignFormData = await request.json()

    // Validate required fields
    if (!body.store_id || !body.client_id || !body.name || !body.scheduled_date) {
      return NextResponse.json(
        { error: "Campos obrigatórios: store_id, client_id, name, scheduled_date" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

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
      channel: body.channel || "email",
      campaign_type: body.campaign_type || "promotional",
      status: body.status || "draft",
      subject_line: body.subject_line || null,
      preview_text: body.preview_text || null,
      segment_name: body.segment_name || null,
      estimated_recipients: body.estimated_recipients || null,
      tags: body.tags || [],
      color: body.color || "#3b82f6",
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
      console.error("[Campaigns] Error creating campaign:", error)
      return NextResponse.json(
        { error: "Erro ao criar campanha" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json(
      { campaign },
      { status: 201, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    console.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}
