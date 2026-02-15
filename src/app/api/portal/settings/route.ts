import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get user settings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, name, email, phone, client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Get notification preferences
    const { data: notifications } = await supabase
      .from("client_notification_preferences")
      .select("*")
      .eq("portal_user_id", portalUser.id)
      .single()

    // Default notifications if not exists
    const defaultNotifications = {
      email_report_weekly: true,
      email_report_monthly: true,
      email_invoice_reminder: true,
      email_invoice_paid: true,
      email_campaign_sent: false,
      email_performance_alerts: false,
    }

    return NextResponse.json(
      {
        profile: {
          id: portalUser.id,
          name: portalUser.name,
          email: portalUser.email,
          phone: portalUser.phone,
        },
        notifications: notifications || defaultNotifications,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    console.error("[Portal Settings] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// PUT - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Check permission
    const permissions = portalUser.permissions as { edit_profile?: boolean }
    if (!permissions?.edit_profile) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body = await request.json()
    const { name, phone } = body

    // Update profile
    const { error } = await supabase
      .from("client_portal_users")
      .update({
        name,
        phone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", portalUser.id)

    if (error) {
      console.error("[Portal Settings] Update error:", error)
      return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    console.error("[Portal Settings] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
