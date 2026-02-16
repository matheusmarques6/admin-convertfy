import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoAlerts")

/**
 * GET /api/klaviyo/alerts
 *
 * Lista alertas de campanhas (performance drops, high bounce rate, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const severity = searchParams.get("severity")
    const unreadOnly = searchParams.get("unread_only") !== "false"
    const limit = parseInt(searchParams.get("limit") || "50")

    // Build query
    let query = supabase
      .from("campaign_alerts")
      .select(`
        *,
        klaviyo_campaigns (
          id,
          name,
          channel,
          send_time
        ),
        client_stores (
          id,
          store_name,
          clients (
            id,
            name
          )
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (storeId) {
      query = query.eq("store_id", storeId)
    }
    if (severity) {
      query = query.eq("severity", severity)
    }
    if (unreadOnly) {
      query = query.eq("is_read", false).eq("is_dismissed", false)
    }

    const { data: alerts, error } = await query

    if (error) {
      log.error("Error fetching alerts:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data
    const transformedAlerts = alerts?.map((alert) => {
      const campaignRaw = alert.klaviyo_campaigns
      const campaign = Array.isArray(campaignRaw) ? campaignRaw[0] : campaignRaw
      const storeRaw = alert.client_stores
      const store = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw
      const clientRaw = store?.clients
      const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw

      return {
        id: alert.id,
        alert_type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        metric_name: alert.metric_name,
        previous_value: alert.previous_value,
        current_value: alert.current_value,
        change_percentage: alert.change_percentage,
        threshold_value: alert.threshold_value,
        is_read: alert.is_read,
        is_dismissed: alert.is_dismissed,
        created_at: alert.created_at,
        campaign: {
          id: campaign?.id,
          name: campaign?.name,
          channel: campaign?.channel,
          send_time: campaign?.send_time,
        },
        store: {
          id: store?.id,
          name: store?.store_name,
        },
        client: {
          id: client?.id,
          name: client?.name,
        },
      }
    })

    // Get counts by severity
    const { data: counts } = await supabase
      .from("campaign_alerts")
      .select("severity")
      .eq("is_read", false)
      .eq("is_dismissed", false)

    const countBySeverity = {
      critical: 0,
      warning: 0,
      info: 0,
    }

    for (const c of counts || []) {
      if (c.severity in countBySeverity) {
        countBySeverity[c.severity as keyof typeof countBySeverity]++
      }
    }

    return NextResponse.json({
      alerts: transformedAlerts,
      unread_counts: countBySeverity,
      total_unread: counts?.length || 0,
    })
  } catch (error) {
    return errorResponse(request, error, "KlaviyoAlerts")
  }
}

/**
 * PATCH /api/klaviyo/alerts
 *
 * Atualiza status de alertas (marcar como lido, dispensar)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const { alert_ids, action } = body

    if (!alert_ids || !Array.isArray(alert_ids) || alert_ids.length === 0) {
      throw new AppError("alert_ids é obrigatório", 400)
    }

    if (!["read", "dismiss", "unread"].includes(action)) {
      throw new AppError("action deve ser 'read', 'dismiss' ou 'unread'", 400)
    }

    let updateData: Record<string, unknown> = {}

    if (action === "read") {
      updateData = {
        is_read: true,
        read_at: new Date().toISOString(),
      }
    } else if (action === "dismiss") {
      updateData = {
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
        dismissed_by: user.id,
      }
    } else if (action === "unread") {
      updateData = {
        is_read: false,
        read_at: null,
      }
    }

    const { error } = await supabase
      .from("campaign_alerts")
      .update(updateData)
      .in("id", alert_ids)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `${alert_ids.length} alerta(s) atualizado(s)`,
    })
  } catch (error) {
    return errorResponse(request, error, "KlaviyoAlerts")
  }
}
