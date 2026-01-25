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

// GET - List organizations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get("type")
    const activeOnly = searchParams.get("active_only") !== "false"

    let query = supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true })

    if (type) {
      query = query.eq("type", type)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: organizations, error } = await query

    if (error) {
      console.error("[Organizations] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar organizações" }, { status: 500, headers: corsHeaders() })
    }

    // Get member count for each organization
    const orgsWithCounts = await Promise.all(
      (organizations || []).map(async (org) => {
        const { count } = await supabase
          .from("org_members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", org.id)
          .eq("is_active", true)

        return {
          ...org,
          member_count: count || 0,
        }
      })
    )

    return NextResponse.json({ organizations: orgsWithCounts }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Organizations] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// POST - Create new organization
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders() })
    }

    const body = await request.json()

    if (!body.name || !body.slug) {
      return NextResponse.json(
        { error: "Campos obrigatórios: name, slug" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Check if slug already exists
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", body.slug.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: "Este slug já está em uso" },
        { status: 400, headers: corsHeaders() }
      )
    }

    const adminClient = createAdminClient()

    const { data: organization, error: insertError } = await adminClient
      .from("organizations")
      .insert({
        name: body.name,
        slug: body.slug.toLowerCase(),
        type: body.type || "internal",
        settings: body.settings || {},
      })
      .select()
      .single()

    if (insertError) {
      console.error("[Organizations] Insert error:", insertError)
      return NextResponse.json({ error: "Erro ao criar organização" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json(
      { organization, message: "Organização criada com sucesso" },
      { status: 201, headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Organizations] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
