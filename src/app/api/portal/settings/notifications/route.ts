import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalSettingsNotifications")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// PUT - Update notification preferences
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
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
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
      log.error("[Portal Notifications] Update error:", error)
      return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Portal Notifications] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
