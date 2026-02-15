import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { generateTempPassword } from "@/lib/utils/generate-password"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
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
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders(request.headers.get("origin")) })
    }

    const { id } = await params

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("auth_user_id, email, name")
      .eq("id", id)
      .single()

    if (!portalUser?.auth_user_id) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Generate new temporary password
    const tempPassword = generateTempPassword()

    // Use admin client for auth operations (requires service role key)
    const adminClient = createAdminClient()

    // Update password in Supabase Auth
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      portalUser.auth_user_id,
      { password: tempPassword }
    )

    if (updateError) {
      console.error("[Portal Users] Password reset error:", updateError)
      return NextResponse.json(
        { error: "Erro ao redefinir senha" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Set must_change_password flag so user is required to change password on login
    await adminClient
      .from("client_portal_users")
      .update({ must_change_password: true })
      .eq("id", id)

    return NextResponse.json(
      {
        message: "Senha redefinida com sucesso",
        tempPassword,
        userEmail: portalUser.email,
        userName: portalUser.name,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    console.error("[Portal Users] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

