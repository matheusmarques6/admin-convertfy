import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
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
      throw new AppError("Não autorizado", 401)
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
      throw new AppError("Campanha não encontrada", 404)
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
      throw new AppError("Erro ao enviar para revisão", 500)
    }

    return successResponse(request, {
      campaign: updated,
      message: "Campanha enviada para revisão com sucesso",
    })
  } catch (error) {
    return errorResponse(request, error, "CampaignsSubmit")
  }
}
