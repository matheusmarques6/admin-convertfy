import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// POST - Portal user changes their own password
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { new_password } = body

    if (!new_password) {
      return NextResponse.json(
        { error: "new_password is required" },
        { status: 400 }
      )
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .select("*")
      .eq("auth_user_id", user.id)
      .single()

    if (portalError || !portalUser) {
      return NextResponse.json(
        { error: "Portal user not found" },
        { status: 404 }
      )
    }

    // Update the auth user's password
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password: new_password }
    )

    if (updateAuthError) {
      console.error("Error updating password:", updateAuthError)
      return NextResponse.json(
        { error: "Failed to change password" },
        { status: 500 }
      )
    }

    // Mark must_change_password as false
    const { error: updatePortalError } = await adminClient
      .from("client_portal_users")
      .update({ must_change_password: false })
      .eq("id", portalUser.id)

    if (updatePortalError) {
      console.error("Error updating portal user:", updatePortalError)
    }

    // Log the activity
    await adminClient.from("activities").insert({
      client_id: portalUser.client_id,
      user_id: user.id,
      type: "portal_user_updated",
      description: `Usuário do portal "${portalUser.name}" alterou a senha`,
      metadata: {
        portal_user_id: portalUser.id,
        action: "password_changed",
      },
    })

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    })
  } catch (error) {
    console.error("Error in POST /api/portal-users/change-password:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
