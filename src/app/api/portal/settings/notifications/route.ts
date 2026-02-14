import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// PUT - Update notification preferences
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const body = await request.json()

    // Upsert notification preferences
    const { error } = await supabase
      .from("client_notification_preferences")
      .upsert(
        {
          portal_user_id: portalUser.id,
          email_report_weekly: body.email_report_weekly ?? true,
          email_report_monthly: body.email_report_monthly ?? true,
          email_invoice_reminder: body.email_invoice_reminder ?? true,
          email_invoice_paid: body.email_invoice_paid ?? true,
          email_campaign_sent: body.email_campaign_sent ?? false,
          email_performance_alerts: body.email_performance_alerts ?? false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "portal_user_id",
        }
      )

    if (error) {
      console.error("[Portal Notifications] Update error:", error)
      return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500, headers: corsHeaders() })
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Portal Notifications] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
