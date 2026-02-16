import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalSettings")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get user settings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, name, email, phone, client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
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
    return errorResponse(request, error, "PortalSettings")
  }
}

// PUT - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    // Check permission
    const permissions = portalUser.permissions as { edit_profile?: boolean }
    if (!permissions?.edit_profile) {
      throw new AppError("Sem permissão", 403)
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
      log.error("[Portal Settings] Update error:", error)
      throw new AppError("Erro ao atualizar", 500)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PortalSettings")
  }
}
