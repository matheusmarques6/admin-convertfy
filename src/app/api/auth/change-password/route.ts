import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

// POST - User changes their own password (for first login password change)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { new_password } = body

    if (!new_password) {
      return NextResponse.json(
        { error: "Nova senha é obrigatória" },
        { status: 400 }
      )
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Update the auth user's password and clear the must_change_password flag
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      user.id,
      {
        password: new_password,
        user_metadata: {
          ...user.user_metadata,
          must_change_password: false,
        },
      }
    )

    if (updateAuthError) {
      console.error("Error updating password:", updateAuthError)
      return NextResponse.json(
        { error: "Falha ao alterar a senha" },
        { status: 500 }
      )
    }

    // Log the activity
    await supabase.from("activities").insert({
      user_id: user.id,
      type: "user_updated",
      description: `Usuário "${user.email}" alterou a senha`,
      metadata: {
        action: "password_changed",
        first_login: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Senha alterada com sucesso",
    })
  } catch (error) {
    console.error("Error in POST /api/auth/change-password:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
