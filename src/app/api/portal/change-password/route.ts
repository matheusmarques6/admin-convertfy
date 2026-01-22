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

// POST - Change password for portal user (first login requirement)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401, headers: corsHeaders() }
      )
    }

    const body = await request.json()
    const { newPassword, confirmPassword } = body

    // Validate passwords
    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Nova senha e confirmação são obrigatórias" },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "As senhas não coincidem" },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 8 caracteres" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await supabase
      .from("client_portal_users")
      .select("id, client_id, login_count")
      .eq("auth_user_id", user.id)
      .single()

    if (portalError || !portalUser) {
      return NextResponse.json(
        { error: "Usuário não é do portal" },
        { status: 403, headers: corsHeaders() }
      )
    }

    // Use admin client to update password
    const adminClient = createAdminClient()

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error("[Portal Change Password] Error:", updateError)
      return NextResponse.json(
        { error: "Erro ao alterar senha" },
        { status: 500, headers: corsHeaders() }
      )
    }

    // Update portal user to mark password as changed and update login info
    await adminClient
      .from("client_portal_users")
      .update({
        must_change_password: false,
        last_login_at: new Date().toISOString(),
        login_count: (portalUser.login_count || 0) + 1,
      })
      .eq("id", portalUser.id)

    // Log activity
    await supabase.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "password_changed",
      metadata: {
        first_login: true,
        user_agent: request.headers.get("user-agent"),
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: "Senha alterada com sucesso",
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Change Password] Error:", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
