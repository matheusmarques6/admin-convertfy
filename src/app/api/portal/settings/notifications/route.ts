import { NextRequest } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalSettingsNotifications")

const notificationUpdateSchema = z.object({
  email_report_weekly: z.boolean().optional(),
  email_report_monthly: z.boolean().optional(),
  email_invoice_reminder: z.boolean().optional(),
  email_invoice_paid: z.boolean().optional(),
  email_campaign_sent: z.boolean().optional(),
  email_performance_alerts: z.boolean().optional(),
})

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// PUT - Update notification preferences
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const parsed = notificationUpdateSchema.safeParse(body)

    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Dados inválidos",
        400
      )
    }

    // Upsert notification preferences
    const { error } = await supabase
      .from("client_notification_preferences")
      .upsert(
        {
          portal_user_id: portalUser.id,
          email_report_weekly: parsed.data.email_report_weekly ?? true,
          email_report_monthly: parsed.data.email_report_monthly ?? true,
          email_invoice_reminder: parsed.data.email_invoice_reminder ?? true,
          email_invoice_paid: parsed.data.email_invoice_paid ?? true,
          email_campaign_sent: parsed.data.email_campaign_sent ?? false,
          email_performance_alerts: parsed.data.email_performance_alerts ?? false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "portal_user_id",
        }
      )

    if (error) {
      log.error("[Portal Notifications] Update error:", error)
      throw new AppError("Erro ao atualizar", 500)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PortalSettingsNotifications")
  }
}
