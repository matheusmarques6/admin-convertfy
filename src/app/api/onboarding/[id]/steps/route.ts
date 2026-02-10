import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get all steps for an onboarding
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { data: steps, error } = await supabase
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

    if (error) {
      console.error("[Onboarding Steps] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar etapas" }, { status: 500, headers: corsHeaders() })
    }

    // Group by category
    const grouped = (steps || []).reduce((acc, step) => {
      if (!acc[step.category]) {
        acc[step.category] = []
      }
      acc[step.category].push(step)
      return acc
    }, {} as Record<string, typeof steps>)

    return NextResponse.json({ steps: steps || [], grouped }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Onboarding Steps] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// PUT - Update a step (complete, assign, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: onboardingId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const body = await request.json()

    if (!body.step_id) {
      return NextResponse.json(
        { error: "step_id é obrigatório" },
        { status: 400, headers: corsHeaders() }
      )
    }

    const adminClient = createAdminClient()

    const updateData: Record<string, unknown> = {}

    if (body.status !== undefined) {
      updateData.status = body.status

      // Set timestamps based on status
      if (body.status === "in_progress" && !body.started_at) {
        updateData.started_at = new Date().toISOString()
      }

      if (body.status === "completed") {
        updateData.completed_at = new Date().toISOString()
        updateData.completed_by = user.id
      }
    }

    if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.blocked_reason !== undefined) updateData.blocked_reason = body.blocked_reason

    const { data: step, error: updateError } = await adminClient
      .from("client_onboarding_steps")
      .update(updateData)
      .eq("id", body.step_id)
      .eq("onboarding_id", onboardingId)
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .single()

    if (updateError) {
      console.error("[Onboarding Steps] Update error:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar etapa" }, { status: 500, headers: corsHeaders() })
    }

    // Get updated onboarding progress
    const { data: onboarding } = await supabase
      .from("client_onboardings")
      .select("id, progress_percent, status")
      .eq("id", onboardingId)
      .single()

    return NextResponse.json({
      step,
      onboarding_progress: onboarding?.progress_percent || 0,
      onboarding_status: onboarding?.status,
      message: "Etapa atualizada",
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Onboarding Steps] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
