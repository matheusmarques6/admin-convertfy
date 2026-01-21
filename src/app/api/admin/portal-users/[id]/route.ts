import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get single portal user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id } = await params

    const { data: portalUser, error } = await supabase
      .from("client_portal_users")
      .select(`
        *,
        client:clients(id, name, company, email),
        notification_preferences:client_notification_preferences(*)
      `)
      .eq("id", id)
      .single()

    if (error) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404, headers: corsHeaders() })
    }

    return NextResponse.json({ portalUser }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Portal Users] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// PUT - Update portal user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (!profile || !["admin", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders() })
    }

    const { id } = await params
    const body = await request.json()

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.is_primary !== undefined) updateData.is_primary = body.is_primary
    if (body.permissions !== undefined) updateData.permissions = body.permissions

    const { data: portalUser, error } = await supabase
      .from("client_portal_users")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        client:clients(id, name, company)
      `)
      .single()

    if (error) {
      console.error("[Portal Users] Update error:", error)
      return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ portalUser }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Portal Users] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// DELETE - Delete portal user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    if (!profile || !["admin", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders() })
    }

    const { id } = await params

    // Get portal user to find auth_user_id
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("auth_user_id")
      .eq("id", id)
      .single()

    // Delete portal user record
    const { error: deleteError } = await supabase
      .from("client_portal_users")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[Portal Users] Delete error:", deleteError)
      return NextResponse.json({ error: "Erro ao excluir" }, { status: 500, headers: corsHeaders() })
    }

    // Delete auth user if exists
    if (portalUser?.auth_user_id) {
      try {
        await supabase.auth.admin.deleteUser(portalUser.auth_user_id)
      } catch (e) {
        console.error("[Portal Users] Error deleting auth user:", e)
      }
    }

    return NextResponse.json({ message: "Usuário excluído com sucesso" }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Portal Users] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
