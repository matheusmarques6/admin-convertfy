import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// POST - Reset password for a portal user (admin action)
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

    // Check if user has permission
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "cs"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { portal_user_id, new_password } = body

    if (!portal_user_id) {
      return NextResponse.json(
        { error: "portal_user_id is required" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Get portal user
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .select("*")
      .eq("id", portal_user_id)
      .single()

    if (portalError || !portalUser) {
      return NextResponse.json(
        { error: "Portal user not found" },
        { status: 404 }
      )
    }

    if (!portalUser.auth_user_id) {
      return NextResponse.json(
        { error: "Portal user has no auth account" },
        { status: 400 }
      )
    }

    // Default password if not provided
    const passwordToSet = new_password || "Convertfy@2024"

    // Update the auth user's password
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      portalUser.auth_user_id,
      { password: passwordToSet }
    )

    if (updateAuthError) {
      console.error("Error updating auth user password:", updateAuthError)
      return NextResponse.json(
        { error: "Failed to reset password" },
        { status: 500 }
      )
    }

    // Set must_change_password back to true
    await adminClient
      .from("client_portal_users")
      .update({ must_change_password: true })
      .eq("id", portal_user_id)

    return NextResponse.json({
      success: true,
      message: `Password reset successfully. New password: ${passwordToSet}`,
      new_password: passwordToSet,
    })
  } catch (error) {
    console.error("Error in POST /api/portal-users/reset-password:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
