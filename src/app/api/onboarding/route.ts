import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - List client onboardings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")
    const storeId = searchParams.get("store_id")
    const status = searchParams.get("status")
    const assignedToMe = searchParams.get("assigned_to_me") === "true"

    let query = supabase
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company, email),
        store:client_stores(id, store_name, platform),
        assignee:org_members(
          id,
          role,
          profile:profiles(id, name, email, avatar_url)
        )
      `)
      .order("created_at", { ascending: false })

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (assignedToMe) {
      const { data: orgMember } = await supabase
        .from("org_members")
        .select("id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .single()

      if (orgMember) {
        query = query.eq("assigned_to", orgMember.id)
      }
    }

    const { data: onboardings, error } = await query

    if (error) {
      console.error("[Onboarding] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar onboardings" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ onboardings: onboardings || [] }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Onboarding] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// POST - Start new onboarding for a client
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const body = await request.json()

    if (!body.client_id) {
      return NextResponse.json(
        { error: "client_id é obrigatório" },
        { status: 400, headers: corsHeaders() }
      )
    }

    const adminClient = createAdminClient()

    // Check if client already has an active onboarding
    const { data: existing } = await supabase
      .from("client_onboardings")
      .select("id")
      .eq("client_id", body.client_id)
      .in("status", ["not_started", "in_progress", "paused"])
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: "Cliente já possui um onboarding ativo" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Get default template
    const { data: template } = await supabase
      .from("onboarding_templates")
      .select(`
        *,
        steps:onboarding_template_steps(*)
      `)
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (!template) {
      return NextResponse.json(
        { error: "Nenhum template de onboarding encontrado" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Calculate target completion date
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + (template.estimated_days || 14))

    // Create onboarding
    const { data: onboarding, error: insertError } = await adminClient
      .from("client_onboardings")
      .insert({
        client_id: body.client_id,
        store_id: body.store_id || null,
        template_id: template.id,
        status: "in_progress",
        assigned_to: body.assigned_to || null,
        started_at: new Date().toISOString(),
        target_completion_date: targetDate.toISOString(),
        notes: body.notes || null,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[Onboarding] Insert error:", insertError)
      return NextResponse.json(
        { error: "Erro ao criar onboarding" },
        { status: 500, headers: corsHeaders() }
      )
    }

    // Create steps from template
    interface TemplateStep {
      id: string
      name: string
      description?: string
      category: string
      position: number
      estimated_hours: number
      metadata: Record<string, unknown>
    }

    const steps = (template.steps || [])
      .sort((a: TemplateStep, b: TemplateStep) => a.position - b.position)
      .map((step: TemplateStep) => ({
        onboarding_id: onboarding.id,
        template_step_id: step.id,
        name: step.name,
        description: step.description,
        category: step.category,
        position: step.position,
        status: "pending",
        metadata: step.metadata || {},
      }))

    if (steps.length > 0) {
      await adminClient.from("client_onboarding_steps").insert(steps)
    }

    // Update client status to onboarding
    await adminClient
      .from("clients")
      .update({ status: "onboarding" })
      .eq("id", body.client_id)

    // Fetch complete onboarding with steps
    const { data: completeOnboarding } = await supabase
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company),
        store:client_stores(id, store_name),
        steps:client_onboarding_steps(*)
      `)
      .eq("id", onboarding.id)
      .single()

    return NextResponse.json(
      { onboarding: completeOnboarding, message: "Onboarding iniciado com sucesso" },
      { status: 201, headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Onboarding] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
