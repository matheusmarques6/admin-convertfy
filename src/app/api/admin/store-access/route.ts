import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { AgentStoreAccessFormData } from "@/types"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - List store access records
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const orgMemberId = searchParams.get("org_member_id")
    const storeId = searchParams.get("store_id")
    const clientId = searchParams.get("client_id")

    let query = supabase
      .from("agent_store_access")
      .select(`
        *,
        org_member:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        store:client_stores(
          id,
          store_name,
          store_url,
          platform,
          client:clients(id, name, company)
        )
      `)
      .order("assigned_at", { ascending: false })

    if (orgMemberId) {
      query = query.eq("org_member_id", orgMemberId)
    }

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    // If client_id is provided, we need to filter by stores that belong to this client
    if (clientId) {
      const { data: clientStores } = await supabase
        .from("client_stores")
        .select("id")
        .eq("client_id", clientId)

      if (clientStores && clientStores.length > 0) {
        const storeIds = clientStores.map((s) => s.id)
        query = query.in("store_id", storeIds)
      } else {
        return NextResponse.json({ access: [] }, { headers: corsHeaders() })
      }
    }

    const { data: access, error } = await query

    if (error) {
      console.error("[Store Access] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar acessos" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ access: access || [] }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Store Access] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// POST - Grant store access to a member
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

    const body: AgentStoreAccessFormData = await request.json()

    if (!body.org_member_id || !body.store_id) {
      return NextResponse.json(
        { error: "Campos obrigatórios: org_member_id, store_id" },
        { status: 400, headers: corsHeaders() }
      )
    }

    const adminClient = createAdminClient()

    // Check if access already exists
    const { data: existing } = await supabase
      .from("agent_store_access")
      .select("id")
      .eq("org_member_id", body.org_member_id)
      .eq("store_id", body.store_id)
      .single()

    if (existing) {
      // Update existing access
      const { data: access, error: updateError } = await adminClient
        .from("agent_store_access")
        .update({
          can_view: body.can_view ?? true,
          can_edit: body.can_edit ?? false,
          can_manage_onboarding: body.can_manage_onboarding ?? false,
          can_manage_campaigns: body.can_manage_campaigns ?? false,
          can_manage_reports: body.can_manage_reports ?? false,
          notes: body.notes || null,
        })
        .eq("id", existing.id)
        .select(`
          *,
          store:client_stores(id, store_name, store_url, platform)
        `)
        .single()

      if (updateError) {
        console.error("[Store Access] Update error:", updateError)
        return NextResponse.json({ error: "Erro ao atualizar acesso" }, { status: 500, headers: corsHeaders() })
      }

      return NextResponse.json({ access, message: "Acesso atualizado com sucesso" }, { headers: corsHeaders() })
    }

    // Create new access
    const { data: access, error: insertError } = await adminClient
      .from("agent_store_access")
      .insert({
        org_member_id: body.org_member_id,
        store_id: body.store_id,
        can_view: body.can_view ?? true,
        can_edit: body.can_edit ?? false,
        can_manage_onboarding: body.can_manage_onboarding ?? false,
        can_manage_campaigns: body.can_manage_campaigns ?? false,
        can_manage_reports: body.can_manage_reports ?? false,
        assigned_by: user.id,
        notes: body.notes || null,
      })
      .select(`
        *,
        store:client_stores(id, store_name, store_url, platform)
      `)
      .single()

    if (insertError) {
      console.error("[Store Access] Insert error:", insertError)
      return NextResponse.json({ error: "Erro ao criar acesso" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json(
      { access, message: "Acesso concedido com sucesso" },
      { status: 201, headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Store Access] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// DELETE - Remove store access (bulk or single)
export async function DELETE(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams
    const accessId = searchParams.get("id")
    const orgMemberId = searchParams.get("org_member_id")
    const storeId = searchParams.get("store_id")

    const adminClient = createAdminClient()

    if (accessId) {
      // Delete by ID
      const { error } = await adminClient
        .from("agent_store_access")
        .delete()
        .eq("id", accessId)

      if (error) {
        console.error("[Store Access] Delete error:", error)
        return NextResponse.json({ error: "Erro ao remover acesso" }, { status: 500, headers: corsHeaders() })
      }
    } else if (orgMemberId && storeId) {
      // Delete by member + store combination
      const { error } = await adminClient
        .from("agent_store_access")
        .delete()
        .eq("org_member_id", orgMemberId)
        .eq("store_id", storeId)

      if (error) {
        console.error("[Store Access] Delete error:", error)
        return NextResponse.json({ error: "Erro ao remover acesso" }, { status: 500, headers: corsHeaders() })
      }
    } else {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios: id ou (org_member_id + store_id)" },
        { status: 400, headers: corsHeaders() }
      )
    }

    return NextResponse.json({ success: true, message: "Acesso removido com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Store Access] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
