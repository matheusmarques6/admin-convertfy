/**
 * Vercel Cron — re-sincroniza templates Meta de todos os canais ativos.
 *
 * Schedule: a cada 15 minutos ("*&#47;15 * * * *" no vercel.json)
 *
 * Aprovações/rejeições chegam em tempo real pelo webhook
 * message_template_status_update; este cron é a rede de segurança pra
 * webhooks perdidos. Também loga templates presos em PENDING >60min
 * (RPC stale_pending_crm_templates).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { syncTemplatesForChannel } from "@/lib/whatsapp/template-service"

const log = logger.child("CronWhatsAppResyncTemplates")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    // Templates Meta são exclusivos do Cloud API — canal Evolution (QR)
    // não tem access_token/phone_number_id e falharia toda execução.
    const { data: channels, error } = await admin
      .from("crm_channels")
      .select("id")
      .eq("type", "whatsapp")
      .eq("is_active", true)
      .neq("provider", "evolution")
    if (error) throw error

    let synced = 0
    let failed = 0
    for (const channel of channels ?? []) {
      try {
        const result = await syncTemplatesForChannel(admin, channel.id)
        synced += result.synced
      } catch (err) {
        failed++
        log.warn("sync de canal falhou", {
          channelId: channel.id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Alerta de templates presos em PENDING (webhook perdido ou rejeição
    // silenciosa da Meta)
    const { data: stale } = await admin.rpc("stale_pending_crm_templates", {
      p_threshold_minutes: 60,
    })
    const staleCount = (stale as unknown[] | null)?.length ?? 0
    if (staleCount > 0) {
      log.warn("templates presos em PENDING >60min", { count: staleCount })
    }

    return NextResponse.json({
      success: true,
      channels: channels?.length ?? 0,
      synced,
      failed,
      stale_pending: staleCount,
    })
  } catch (error) {
    log.error("resync-templates cron falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
