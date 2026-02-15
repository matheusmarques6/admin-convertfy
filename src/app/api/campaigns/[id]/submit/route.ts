import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignsSubmit")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Submit campaign for review
export async function POST(
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
    const body = await request.json().catch(() => ({}))

    // Get current campaign
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, status, name, notes")
      .eq("id", id)
      .single()

    if (fetchError || !campaign) {
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Validate current status - can only submit from draft or rejected
    if (!["draft", "rejected"].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Não é possível enviar para revisão uma campanha com status "${campaign.status}"` },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const adminClient = createAdminClient()

    // Update campaign status
    const { data: updated, error: updateError } = await adminClient
      .from("campaigns")
      .update({
        status: "pending_review",
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
        rejection_reason: null, // Clear any previous rejection
        notes: body.notes || campaign.notes,
      })
      .eq("id", id)
      .select(`
        *,
        store:client_stores(id, store_name, platform),
        client:clients(id, name, company)
      `)
      .single()

    if (updateError) {
      log.error("[Campaigns] Submit error:", updateError)
      return NextResponse.json(
        { error: "Erro ao enviar para revisão" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json({
      campaign: updated,
      message: "Campanha enviada para revisão com sucesso",
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}
