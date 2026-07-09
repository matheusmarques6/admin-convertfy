/**
 * Worker QStash — processa eventos de webhook WhatsApp da fila durável.
 *
 * O webhook publica { eventId } no QStash; aqui verificamos a assinatura
 * do QStash (fail-closed em prod), fazemos claim atômico via RPC (lease
 * de 30s, attempts++) e processamos. Retorna 200 mesmo em falha de
 * processamento — o retry é responsabilidade do cron de reprocess, não
 * do re-drive do QStash (evita processamento duplo).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { verifyQStashRequest } from "@/lib/whatsapp/queue"
import { processClaimedEvent, type WebhookEventRow } from "@/lib/whatsapp/webhook-processor"

const log = logger.child("WhatsAppWorker")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("upstash-signature")

  const valid = await verifyQStashRequest(rawBody, signature, request.url)
  if (!valid) {
    log.error("assinatura QStash inválida")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let eventId: string | undefined
  try {
    const body = JSON.parse(rawBody) as { eventId?: string }
    eventId = body.eventId
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: claimed, error: claimError } = await admin.rpc("claim_crm_webhook_event", {
    p_id: eventId,
  })
  if (claimError) {
    log.error("claim falhou", { eventId, message: claimError.message })
    // 200: o cron re-tenta; re-drive do QStash não ajuda aqui.
    return NextResponse.json({ ok: false, reason: "claim_failed" })
  }

  const event = (claimed as WebhookEventRow[] | null)?.[0]
  if (!event) {
    // Já processado, em processamento por outro worker, ou dead.
    return NextResponse.json({ ok: true, reason: "not_claimable" })
  }

  const outcome = await processClaimedEvent(admin, event)
  return NextResponse.json({ ok: outcome.ok, ...(outcome.result ?? {}) })
}
