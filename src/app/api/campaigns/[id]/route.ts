import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { CampaignFormData } from "@/types"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("Campaigns")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// CORS headers




// GET - Get single campaign by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const { id } = await params

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select(`
        *,
        store:client_stores(id, store_name, platform, client_id),
        client:clients(id, name, company, email),
        submitter:profiles!campaigns_submitted_by_fkey(id, name, email, avatar_url),
        reviewer:profiles!campaigns_reviewed_by_fkey(id, name, email, avatar_url)
      `)
      .eq("id", id)
      .single()

    if (error) {
      log.error("[Campaigns] Error fetching campaign:", error)
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Transform relations from arrays to single objects
    const transformedCampaign = {
      ...campaign,
      store: Array.isArray(campaign.store) ? campaign.store[0] : campaign.store,
      client: Array.isArray(campaign.client) ? campaign.client[0] : campaign.client,
      submitter: Array.isArray(campaign.submitter) ? campaign.submitter[0] : campaign.submitter,
      reviewer: Array.isArray(campaign.reviewer) ? campaign.reviewer[0] : campaign.reviewer,
    }

    return NextResponse.json({ campaign: transformedCampaign }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}

// PUT - Update campaign
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const { id } = await params
    const body: Partial<CampaignFormData> = await request.json()

    // Build send_datetime if date and time are provided
    let send_datetime = undefined
    if (body.scheduled_date && body.scheduled_time) {
      send_datetime = `${body.scheduled_date}T${body.scheduled_time}:00`
    } else if (body.scheduled_date) {
      send_datetime = null
    }

    const updateData: Record<string, unknown> = {}

    // Only include fields that are provided
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.scheduled_date !== undefined) updateData.scheduled_date = body.scheduled_date
    if (body.scheduled_time !== undefined) updateData.scheduled_time = body.scheduled_time
    if (send_datetime !== undefined) updateData.send_datetime = send_datetime
    if (body.channel !== undefined) updateData.channel = body.channel
    if (body.campaign_type !== undefined) updateData.campaign_type = body.campaign_type
    if (body.status !== undefined) updateData.status = body.status
    if (body.subject_line !== undefined) updateData.subject_line = body.subject_line
    if (body.preview_text !== undefined) updateData.preview_text = body.preview_text
    if (body.segment_name !== undefined) updateData.segment_name = body.segment_name
    if (body.estimated_recipients !== undefined) updateData.estimated_recipients = body.estimated_recipients
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.color !== undefined) updateData.color = body.color
    if (body.notes !== undefined) updateData.notes = body.notes

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        store:client_stores(id, store_name, platform),
        client:clients(id, name, company)
      `)
      .single()

    if (error) {
      log.error("[Campaigns] Error updating campaign:", error)
      return NextResponse.json(
        { error: "Erro ao atualizar campanha" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json({ campaign }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}

// DELETE - Delete campaign
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const { id } = await params

    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", id)

    if (error) {
      log.error("[Campaigns] Error deleting campaign:", error)
      return NextResponse.json(
        { error: "Erro ao excluir campanha" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json(
      { message: "Campanha excluída com sucesso" },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    log.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}
