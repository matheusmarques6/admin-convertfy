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
}).strict()

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

    // Build upsert object dynamically - only include fields explicitly provided
    const upsertData: Record<string, unknown> = {
      portal_user_id: portalUser.id,
      updated_at: new Date().toISOString(),
    }
    const notifFields = [
      "email_report_weekly",
      "email_report_monthly",
      "email_invoice_reminder",
      "email_invoice_paid",
      "email_campaign_sent",
      "email_performance_alerts",
    ] as const
    for (const field of notifFields) {
      if (parsed.data[field] !== undefined) {
        upsertData[field] = parsed.data[field]
      }
    }

    // Upsert notification preferences
    const { error } = await supabase
      .from("client_notification_preferences")
      .upsert(upsertData, {
        onConflict: "portal_user_id",
      })

    if (error) {
      log.error("[Portal Notifications] Update error:", error)
      throw new AppError("Erro ao atualizar", 500)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PortalSettingsNotifications")
  }
}
