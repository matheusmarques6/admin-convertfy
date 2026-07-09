/**
 * WhatsApp Cloud API webhook receiver (fila durável).
 *
 * - GET: handshake de verificação (hub.mode=subscribe) — inalterado.
 * - POST: valida HMAC → persiste o payload CRU em crm_webhook_events
 *   ANTES de qualquer processamento (recuperabilidade) → com
 *   ENABLE_ASYNC_WEBHOOK=true enfileira no QStash e responde <50ms;
 *   senão processa inline com claim atômico.
 *
 * SEMPRE responde 200 depois de persistir — 5xx repetido degrada a
 * qualidade do número na Meta; falha de processamento é recuperada
 * pelo cron whatsapp-reprocess-webhooks.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { enqueueWhatsAppWebhookEvent, isQStashConfigured } from "@/lib/whatsapp/queue"
import {
  processClaimedEvent,
  type WebhookEventRow,
  type WebhookPayload,
} from "@/lib/whatsapp/webhook-processor"

const log = logger.child("WhatsAppWebhook")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

// ── GET: verify_token handshake ────────────────────────────────────
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get("hub.mode")
  const token = sp.get("hub.verify_token")
  const challenge = sp.get("hub.challenge")

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (!expected) {
    log.error("WHATSAPP_WEBHOOK_VERIFY_TOKEN nao configurado")
    return new NextResponse("Server misconfigured", { status: 500 })
  }

  if (mode === "subscribe" && token === expected && challenge) {
    log.info("[WhatsApp] webhook verified")
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse("Forbidden", { status: 403 })
}

// ── POST: persist + enqueue (ou inline) ────────────────────────────
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !signature) return false
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.byteLength !== b.byteLength) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  // Em dev local sem secret, aceitamos webhook (facilita teste). Em
  // prod a assinatura é mandatória.
  if (process.env.NODE_ENV === "production" && !verifySignature(rawBody, signature)) {
    log.error("[WhatsApp] invalid signature")
    return new NextResponse("Forbidden", { status: 403 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  if (payload.object !== "whatsapp_business_account") {
    log.warn("[WhatsApp] unknown payload object", { object: payload.object })
    return NextResponse.json({ ignored: true })
  }

  const admin = createAdminClient()

  // Persiste o evento cru ANTES de processar — se tudo depois falhar,
  // o cron de reprocess recupera a partir daqui.
  const externalChannelId =
    payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null

  const { data: event, error: insertError } = await admin
    .from("crm_webhook_events")
    .insert({
      source: "whatsapp",
      external_channel_id: externalChannelId,
      raw_payload: payload,
      signature,
    })
    .select("id, raw_payload, attempts, max_attempts")
    .single()

  if (insertError || !event) {
    // Persistência falhou: sem como recuperar depois — processa inline
    // como best-effort e responde 200 mesmo assim (500 degrada o número).
    log.error("[WhatsApp] falha ao persistir evento — fallback inline", insertError)
    try {
      const { processWebhookEvent } = await import("@/lib/whatsapp/webhook-processor")
      await processWebhookEvent(admin, payload)
    } catch (err) {
      log.error("[WhatsApp] fallback inline falhou", err)
    }
    return NextResponse.json({ received: true, persisted: false })
  }

  const asyncMode = process.env.ENABLE_ASYNC_WEBHOOK === "true" && isQStashConfigured()

  if (asyncMode) {
    // Falha de enqueue só loga — o cron pega o evento pending.
    await enqueueWhatsAppWebhookEvent(event.id)
    return NextResponse.json({ received: true, queued: true })
  }

  // Modo inline (canário / sem QStash): claim atômico + processa agora.
  const { data: claimed } = await admin.rpc("claim_crm_webhook_event", { p_id: event.id })
  const claimedEvent = (claimed as WebhookEventRow[] | null)?.[0]
  if (claimedEvent) {
    await processClaimedEvent(admin, claimedEvent)
  }

  return NextResponse.json({ received: true })
}
