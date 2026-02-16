import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignsReject")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Reject campaign
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
    const body = await request.json()

    // Reason is required for rejection
    if (!body.reason || body.reason.trim().length === 0) {
      throw new AppError("Motivo da rejeição é obrigatório", 400)
    }

    // Check if user has permission to reject (owner, manager, or coordinator)
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("id, role")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    const canReject = orgMember && ["owner", "manager", "coordinator"].includes(orgMember.role)

    // Also check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isAdmin = profile?.role === "admin"

    if (!canReject && !isAdmin) {
      throw new AppError("Você não tem permissão para rejeitar campanhas", 403)
    }

    // Get current campaign
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, status, name")
      .eq("id", id)
      .single()

    if (fetchError || !campaign) {
      throw new AppError("Campanha não encontrada", 404)
    }

    // Validate current status - can only reject from pending_review
    if (campaign.status !== "pending_review") {
      return NextResponse.json(
        { error: `Não é possível rejeitar uma campanha com status "${campaign.status}"` },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const adminClient = createAdminClient()

    // Update campaign status
    const { data: updated, error: updateError } = await adminClient
      .from("campaigns")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: body.reason.trim(),
      })
      .eq("id", id)
      .select(`
        *,
        store:client_stores(id, store_name, platform),
        client:clients(id, name, company)
      `)
      .single()

    if (updateError) {
      log.error("[Campaigns] Reject error:", updateError)
      throw new AppError("Erro ao rejeitar campanha", 500)
    }

    return successResponse(request, {
      campaign: updated,
      message: "Campanha rejeitada",
    })
  } catch (error) {
    return errorResponse(request, error, "CampaignsReject")
  }
}
