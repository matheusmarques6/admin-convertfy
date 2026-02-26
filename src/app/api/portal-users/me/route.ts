import { NextRequest, NextResponse } from "next/server"
import { errorResponse } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"

// GET - Get current portal user info (if logged in user is a portal user)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { is_portal_user: false },
        { status: 200 }
      )
    }

    // Check if this user is a portal user
    const { data: portalUser, error: portalError } = await supabase
      .from("client_portal_users")
      .select("id, name, email, phone, client_id, is_active, must_change_password, permissions, created_at")
      .eq("auth_user_id", user.id)
      .single()

    if (portalError || !portalUser) {
      // Not a portal user, just a regular admin user
      return NextResponse.json({
        is_portal_user: false,
        must_change_password: false,
      })
    }

    return NextResponse.json({
      is_portal_user: true,
      must_change_password: portalUser.must_change_password,
      portal_user: portalUser,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalUsersMe")
  }
}
