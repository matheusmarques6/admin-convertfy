import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignsApprove")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Approve campaign
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

    // Check if user has permission to approve (owner, manager, or coordinator)
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("id, role")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    const canApprove = orgMember && ["owner", "manager", "coordinator"].includes(orgMember.role)

    // Also check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isAdmin = profile?.role === "admin"

    if (!canApprove && !isAdmin) {
      throw new AppError("Você não tem permissão para aprovar campanhas", 403)
    }

    // Get current campaign
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, status, name, submitted_by")
      .eq("id", id)
      .single()

    if (fetchError || !campaign) {
      throw new AppError("Campanha não encontrada", 404)
    }

    // Validate current status - can only approve from pending_review
    if (campaign.status !== "pending_review") {
      return NextResponse.json(
        { error: `Não é possível aprovar uma campanha com status "${campaign.status}"` },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Prevent self-approval (unless admin)
    if (campaign.submitted_by === user.id && !isAdmin) {
      throw new AppError("Você não pode aprovar sua própria campanha", 400)
    }

    const adminClient = createAdminClient()

    // Determine target status (approved or scheduled if has date/time)
    let targetStatus: "approved" | "scheduled" = "approved"

    // If campaign has a schedule, move directly to scheduled
    const { data: fullCampaign } = await supabase
      .from("campaigns")
      .select("scheduled_date, scheduled_time, send_datetime")
      .eq("id", id)
      .single()

    if (fullCampaign?.send_datetime) {
      targetStatus = "scheduled"
    }

    // Update campaign status
    const { data: updated, error: updateError } = await adminClient
      .from("campaigns")
      .update({
        status: targetStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        approval_notes: body.notes || null,
      })
      .eq("id", id)
      .select(`
        *,
        store:client_stores(id, store_name, platform),
        client:clients(id, name, company)
      `)
      .single()

    if (updateError) {
      log.error("[Campaigns] Approve error:", updateError)
      throw new AppError("Erro ao aprovar campanha", 500)
    }

    const statusMessage = targetStatus === "scheduled"
      ? "Campanha aprovada e agendada com sucesso"
      : "Campanha aprovada com sucesso"

    return successResponse(request, {
      campaign: updated,
      message: statusMessage,
    })
  } catch (error) {
    return errorResponse(request, error, "CampaignsApprove")
  }
}
