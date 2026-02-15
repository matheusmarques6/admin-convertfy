import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("Onboarding")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get single onboarding with all steps
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const { data: onboarding, error } = await supabase
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company, email, phone),
        store:client_stores(id, store_name, store_url, platform),
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        template:onboarding_templates(id, name, estimated_days)
      `)
      .eq("id", id)
      .single()

    if (error || !onboarding) {
      return NextResponse.json({ error: "Onboarding não encontrado" }, { status: 404, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Fetch steps with assignees
    const { data: steps } = await supabase
      .from("client_onboarding_steps")
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .eq("onboarding_id", id)
      .order("position", { ascending: true })

    return NextResponse.json({
      onboarding: {
        ...onboarding,
        steps: steps || [],
      },
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Onboarding] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// PUT - Update onboarding
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body = await request.json()
    const adminClient = createAdminClient()

    const updateData: Record<string, unknown> = {}

    if (body.status !== undefined) updateData.status = body.status
    if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to
    if (body.target_completion_date !== undefined) updateData.target_completion_date = body.target_completion_date
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.store_analysis !== undefined) updateData.store_analysis = body.store_analysis
    if (body.generated_copies !== undefined) updateData.generated_copies = body.generated_copies

    // Handle completion
    if (body.status === "completed") {
      updateData.completed_at = new Date().toISOString()
    }

    const { data: onboarding, error: updateError } = await adminClient
      .from("client_onboardings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      log.error("[Onboarding] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar onboarding" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // If completed, update client status
    if (body.status === "completed") {
      await adminClient
        .from("clients")
        .update({ status: "active" })
        .eq("id", onboarding.client_id)
    }

    return NextResponse.json({ onboarding, message: "Onboarding atualizado" }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Onboarding] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// DELETE - Cancel onboarding
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const adminClient = createAdminClient()

    // Soft delete - just change status to cancelled
    const { error: updateError } = await adminClient
      .from("client_onboardings")
      .update({ status: "cancelled" })
      .eq("id", id)

    if (updateError) {
      log.error("[Onboarding] Delete error:", updateError)
      return NextResponse.json({ error: "Erro ao cancelar onboarding" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ success: true, message: "Onboarding cancelado" }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Onboarding] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
