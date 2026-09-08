/**
 * Evolution API webhook receiver (fila durável, mesma do Cloud API).
 *
 * A Evolution NÃO assina payloads — a autenticação é o secret no path
 * (secret do banco/env via getEvolutionRuntimeConfig, comparação
 * timing-safe; o secret anterior vale por 24h após rotação). Roteamento:
 *  - connection.update → inline (barato: update no config do canal)
 *  - qrcode.updated e demais → ignorado (o modal de QR usa polling REST)
 *  - messages.upsert / messages.update / send.message → persiste em
 *    crm_webhook_events com source='evolution' e segue o MESMO pipeline
 *    do Cloud API (QStash ou claim inline; cron de reprocess cobre)
 *
 * SEMPRE responde 200 depois de persistir — retry é da fila, não do
 * re-drive da Evolution.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { stripHeavyFields } from "@/lib/whatsapp/webhook-payload"
import { enqueueWhatsAppWebhookEvent, isQStashConfigured } from "@/lib/whatsapp/queue"
import { parseEvolutionEnvelope } from "@/lib/whatsapp/evolution-content"
import {
  clearEvolutionConfigCache,
  getEvolutionRuntimeConfig,
  isWebhookSecretValidFor,
} from "@/lib/whatsapp/evolution-settings"
import { applyConnectionUpdate, processEvolutionEvent } from "@/lib/whatsapp/evolution-processor"
import { processClaimedEvent, type WebhookEventRow } from "@/lib/whatsapp/webhook-processor"

const log = logger.child("EvolutionWebhook")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const QUEUED_EVENTS = new Set(["messages.upsert", "messages.update", "send.message"])

export async function POST(request: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params
  const admin = createAdminClient()

  const envFallback = {
    webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET ?? null,
    previousWebhookSecret: null,
    previousSecretUntil: null,
  }
  let cfg = await getEvolutionRuntimeConfig(admin)
  let valid = isWebhookSecretValidFor(secret, cfg ?? envFallback, new Date())
  if (!valid) {
    // Pode ser cache stale (até 30s por lambda) logo após uma rotação de
    // secret na rota admin — invalida e revalida UMA vez antes do 403.
    clearEvolutionConfigCache()
    cfg = await getEvolutionRuntimeConfig(admin)
    valid = isWebhookSecretValidFor(secret, cfg ?? envFallback, new Date())
  }
  if (!valid) {
    log.error("secret de webhook inválido")
    return new NextResponse("Forbidden", { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  const envelope = parseEvolutionEnvelope(payload)
  if (!envelope) {
    log.warn("payload sem envelope event/instance/data")
    return NextResponse.json({ ignored: true })
  }

  // connection.update é barato e sensível a latência (modal de QR):
  // aplica inline, sem passar pela fila.
  if (envelope.event === "connection.update") {
    await applyConnectionUpdate(admin, envelope.instance, envelope.data)
    return NextResponse.json({ received: true })
  }

  if (!QUEUED_EVENTS.has(envelope.event)) {
    return NextResponse.json({ ignored: true })
  }

  // Persiste o evento cru ANTES de processar (recuperabilidade) — mas
  // sem o binário: a Evolution embute mídia em base64 e 12 linhas
  // chegaram a ocupar 266 MB, na tabela que o cron varria por minuto.
  // A mídia continua recuperável pelo getBase64FromMediaMessage, que o
  // processor já usa quando o evento não traz o base64.
  const { payload: storedPayload, stripped, originalBytes } = stripHeavyFields(payload, {
    force: process.env.EVOLUTION_WEBHOOK_BASE64 === "false",
  })
  if (stripped) {
    log.info("payload sem binário antes de persistir", {
      instance: envelope.instance,
      event: envelope.event,
      original_bytes: originalBytes,
    })
  }

  const { data: event, error: insertError } = await admin
    .from("crm_webhook_events")
    .insert({
      source: "evolution",
      external_channel_id: envelope.instance,
      raw_payload: storedPayload,
    })
    .select("id, source, raw_payload, attempts, max_attempts")
    .single()

  if (insertError || !event) {
    log.error("falha ao persistir evento — fallback inline", insertError)
    try {
      await processEvolutionEvent(admin, payload)
    } catch (err) {
      log.error("fallback inline falhou", err)
    }
    return NextResponse.json({ received: true, persisted: false })
  }

  const asyncMode = process.env.ENABLE_ASYNC_WEBHOOK === "true" && isQStashConfigured()

  if (asyncMode) {
    await enqueueWhatsAppWebhookEvent(event.id)
    return NextResponse.json({ received: true, queued: true })
  }

  const { data: claimed } = await admin.rpc("claim_crm_webhook_event", { p_id: event.id })
  const claimedEvent = (claimed as WebhookEventRow[] | null)?.[0]
  if (claimedEvent) {
    await processClaimedEvent(admin, claimedEvent)
  }

  return NextResponse.json({ received: true })
}
