import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

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
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
      )
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
      return NextResponse.json(
        { error: "Você não tem permissão para aprovar campanhas" },
        { status: 403, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Get current campaign
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, status, name, submitted_by")
      .eq("id", id)
      .single()

    if (fetchError || !campaign) {
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404, headers: corsHeaders(request.headers.get("origin")) }
      )
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
      return NextResponse.json(
        { error: "Você não pode aprovar sua própria campanha" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
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
      console.error("[Campaigns] Approve error:", updateError)
      return NextResponse.json(
        { error: "Erro ao aprovar campanha" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const statusMessage = targetStatus === "scheduled"
      ? "Campanha aprovada e agendada com sucesso"
      : "Campanha aprovada com sucesso"

    return NextResponse.json({
      campaign: updated,
      message: statusMessage,
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    console.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders(request.headers.get("origin")) }
    )
  }
}
