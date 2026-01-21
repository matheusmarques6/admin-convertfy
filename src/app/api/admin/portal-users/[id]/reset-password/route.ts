import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

// POST - Reset password for portal user
export async function POST(
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

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("auth_user_id, email, name")
      .eq("id", id)
      .single()

    if (!portalUser?.auth_user_id) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404, headers: corsHeaders() })
    }

    // Generate new temporary password
    const tempPassword = generateTempPassword()

    // Update password in Supabase Auth
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      portalUser.auth_user_id,
      { password: tempPassword }
    )

    if (updateError) {
      console.error("[Portal Users] Password reset error:", updateError)
      return NextResponse.json(
        { error: "Erro ao redefinir senha" },
        { status: 500, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        message: "Senha redefinida com sucesso",
        tempPassword,
        userEmail: portalUser.email,
        userName: portalUser.name,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Users] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

function generateTempPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let password = ""
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}
