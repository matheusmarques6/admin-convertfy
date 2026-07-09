/**
 * Vercel Cron — reprocessa eventos de webhook WhatsApp presos.
 *
 * Schedule: * * * * * (a cada minuto)
 *
 * Rede de segurança da fila durável: pega eventos pending/failed com
 * mais de 60s (enqueue no QStash falhou, worker morreu no meio, ou
 * modo inline caiu) e processa inline com claim atômico. Também loga
 * a contagem de eventos dead (observabilidade mínima).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import {
  processClaimedEvent,
  type WebhookEventRow,
} from "@/lib/whatsapp/webhook-processor"

const log = logger.child("CronWhatsAppReprocess")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    const { data: pending, error } = await admin.rpc("pending_crm_webhook_events_for_reprocess", {
      p_older_than_seconds: 60,
      p_limit: 100,
    })
    if (error) throw error

    let processed = 0
    let failed = 0

    for (const event of (pending as WebhookEventRow[] | null) ?? []) {
      // Claim atômico: se o worker QStash pegou nesse meio-tempo, pula.
      const { data: claimed } = await admin.rpc("claim_crm_webhook_event", { p_id: event.id })
      const claimedEvent = (claimed as WebhookEventRow[] | null)?.[0]
      if (!claimedEvent) continue

      const outcome = await processClaimedEvent(admin, claimedEvent)
      if (outcome.ok) processed++
      else failed++
    }

    // Observabilidade mínima: eventos mortos (tentativas esgotadas)
    const { count: deadCount } = await admin
      .from("crm_webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead")

    if ((deadCount ?? 0) > 0) {
      log.warn("eventos dead na fila (investigar manualmente)", { dead: deadCount })
    }
    if (processed > 0 || failed > 0) {
      log.info("reprocess concluído", { processed, failed, dead: deadCount ?? 0 })
    }

    return NextResponse.json({ success: true, processed, failed, dead: deadCount ?? 0 })
  } catch (error) {
    log.error("reprocess cron falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
