import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
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
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders() }
      )
    }

    const { id } = await params
    const body = await request.json()

    // Reason is required for rejection
    if (!body.reason || body.reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Motivo da rejeição é obrigatório" },
        { status: 400, headers: corsHeaders() }
      )
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
      return NextResponse.json(
        { error: "Você não tem permissão para rejeitar campanhas" },
        { status: 403, headers: corsHeaders() }
      )
    }

    // Get current campaign
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, status, name")
      .eq("id", id)
      .single()

    if (fetchError || !campaign) {
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404, headers: corsHeaders() }
      )
    }

    // Validate current status - can only reject from pending_review
    if (campaign.status !== "pending_review") {
      return NextResponse.json(
        { error: `Não é possível rejeitar uma campanha com status "${campaign.status}"` },
        { status: 400, headers: corsHeaders() }
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
      console.error("[Campaigns] Reject error:", updateError)
      return NextResponse.json(
        { error: "Erro ao rejeitar campanha" },
        { status: 500, headers: corsHeaders() }
      )
    }

    return NextResponse.json({
      campaign: updated,
      message: "Campanha rejeitada",
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
