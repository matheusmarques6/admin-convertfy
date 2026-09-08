/**
 * Vercel Cron — rede de segurança da fila de webhooks (WhatsApp/Instagram).
 *
 * Schedule: a cada 5 minutos.
 *
 * Era a cada MINUTO e custava 372 min de CPU do banco em 52 dias — não
 * pelo trabalho, mas por um `count exact` de eventos `dead` que o
 * PostgREST manda parametrizado (`status = $1`), o que derruba o plano
 * genérico para seq scan sobre a tabela de payloads crus. A contagem
 * virou `crm_webhook_queue_stats()` (literais dentro da função) e só é
 * lida para log/alerta.
 *
 * O claim agora é UM statement em lote (`FOR UPDATE SKIP LOCKED`), com
 * lease maior que o maxDuration e backoff exponencial por tentativa —
 * antes era um SELECT seguido de um claim por item (N+1), com lease de
 * 30s menor que o trabalho e sem backoff.
 *
 * Com QStash ligado este cron quase não tem o que fazer: ele existe para
 * o que o push perdeu (enqueue falhou, worker morreu, deploy no meio).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { processClaimedEvent, type WebhookEventRow } from "@/lib/whatsapp/webhook-processor"

const log = logger.child("CronWhatsAppReprocess")

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Lease > budget desta execução: worker vivo não perde o evento. */
const LEASE_SECONDS = 330
const BATCH = 50
/** Devolve antes do maxDuration para não morrer no meio de um evento. */
const BUDGET_MS = 240_000

interface QueueStats {
  pending: number
  failed: number
  processing: number
  dead: number
  oldest_pending_age_seconds: number | null
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const startedAt = Date.now()

  try {
    const admin = createAdminClient()

    const { data: claimed, error } = await admin.rpc("claim_crm_webhook_events", {
      p_limit: BATCH,
      p_lease_seconds: LEASE_SECONDS,
    })
    if (error) throw error

    let processed = 0
    let failed = 0

    for (const event of (claimed as WebhookEventRow[] | null) ?? []) {
      if (Date.now() - startedAt > BUDGET_MS) {
        // O lease vence sozinho e o próximo tick retoma daqui.
        log.info("budget esgotado — restante volta pela expiração do lease")
        break
      }
      const outcome = await processClaimedEvent(admin, event)
      if (outcome.ok) processed++
      else failed++
    }

    // Saúde da fila: literais dentro da função, os índices parciais valem.
    const { data: statsRows } = await admin.rpc("crm_webhook_queue_stats")
    const stats = (statsRows as QueueStats[] | null)?.[0] ?? null

    if (stats && (stats.dead > 0 || stats.pending > 200 || (stats.oldest_pending_age_seconds ?? 0) > 600)) {
      log.warn("fila de webhooks precisa de atenção", { ...stats })
    }
    if (processed > 0 || failed > 0) {
      log.info("reprocess concluído", { processed, failed, ...(stats ?? {}) })
    }

    return NextResponse.json({ success: true, processed, failed, queue: stats })
  } catch (error) {
    log.error("reprocess cron falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
