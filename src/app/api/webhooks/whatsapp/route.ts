/**
 * WhatsApp Cloud API webhook receiver.
 *
 * - GET: handshake de verificacao do webhook (hub.mode=subscribe).
 *   Meta envia hub.verify_token e espera hub.challenge de volta.
 * - POST: recebe mensagens. Valida assinatura HMAC SHA-256 do header
 *   x-hub-signature-256 com WHATSAPP_APP_SECRET. Persiste mensagens
 *   em crm_threads + crm_messages (idempotente via external_id).
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("WhatsAppWebhook")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

// ── POST: ingest messages ───────────────────────────────────────────
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !signature) return false
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.byteLength !== b.byteLength) return false
  return crypto.timingSafeEqual(a, b)
}

interface WhatsAppWebhookEntry {
  changes?: Array<{
    field: string
    value: {
      messaging_product?: string
      metadata?: { display_phone_number?: string; phone_number_id?: string }
      contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
      messages?: Array<{
        id: string
        from: string
        timestamp: string
        type: string
        text?: { body: string }
        image?: { id: string; mime_type: string; sha256: string; caption?: string }
        audio?: { id: string; mime_type: string }
        video?: { id: string; mime_type: string; caption?: string }
        document?: { id: string; mime_type: string; filename: string; caption?: string }
        sticker?: { id: string; mime_type: string }
        location?: { latitude: number; longitude: number; name?: string; address?: string }
        contacts?: unknown
        interactive?: unknown
      }>
      statuses?: Array<{
        id: string
        status: "sent" | "delivered" | "read" | "failed"
        timestamp: string
        recipient_id: string
        errors?: Array<{ code: number; title: string; message?: string }>
      }>
    }
  }>
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  // Em dev local sem secret, aceitamos webhook (logs de aviso). Em prod o
  // secret e mandatorio.
  if (process.env.NODE_ENV === "production" && !verifySignature(rawBody, signature)) {
    log.error("[WhatsApp] invalid signature")
    return new NextResponse("Forbidden", { status: 403 })
  }

  let payload: { object?: string; entry?: WhatsAppWebhookEntry[] }
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

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue
      const v = change.value
      const phoneNumberId = v.metadata?.phone_number_id
      if (!phoneNumberId) continue

      // Busca o channel correspondente
      const { data: channel } = await admin
        .from("crm_channels")
        .select("id, org_id, store_id")
        .eq("type", "whatsapp")
        .eq("external_id", phoneNumberId)
        .eq("is_active", true)
        .maybeSingle()

      if (!channel) {
        log.warn("[WhatsApp] channel nao encontrado para phone_number_id", { phoneNumberId })
        continue
      }

      // Process messages (inbound)
      for (const m of v.messages || []) {
        await handleInboundMessage(admin, {
          orgId: channel.org_id,
          channelId: channel.id,
          message: m,
          contactName: v.contacts?.[0]?.profile?.name || null,
        })
      }

      // Process status updates (outbound feedback)
      for (const s of v.statuses || []) {
        await handleStatusUpdate(admin, {
          messageExternalId: s.id,
          status: s.status,
          errorCode: s.errors?.[0]?.code?.toString() || null,
          errorMessage: s.errors?.[0]?.message || s.errors?.[0]?.title || null,
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}

async function handleInboundMessage(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    orgId: string
    channelId: string
    message: NonNullable<NonNullable<WhatsAppWebhookEntry["changes"]>[number]["value"]["messages"]>[number]
    contactName: string | null
  },
) {
  const { orgId, channelId, message, contactName } = args
  const phoneE164 = message.from

  // Upsert thread
  const { data: existingThread } = await admin
    .from("crm_threads")
    .select("id")
    .eq("channel_id", channelId)
    .eq("contact_external_id", phoneE164)
    .maybeSingle()

  let threadId: string
  if (existingThread) {
    threadId = existingThread.id
    if (contactName) {
      await admin.from("crm_threads").update({ contact_name: contactName }).eq("id", threadId)
    }
  } else {
    const { data: newThread, error } = await admin
      .from("crm_threads")
      .insert({
        org_id: orgId,
        channel_id: channelId,
        contact_external_id: phoneE164,
        contact_name: contactName,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (error || !newThread) {
      log.error("[WhatsApp] erro ao criar thread", error)
      return
    }
    threadId = newThread.id
  }

  // Construct content per message type
  let contentType: string = "text"
  let body: string | null = null
  let mediaUrl: string | null = null
  let mediaMime: string | null = null

  switch (message.type) {
    case "text":
      contentType = "text"
      body = message.text?.body || ""
      break
    case "image":
      contentType = "image"
      body = message.image?.caption || null
      mediaMime = message.image?.mime_type || null
      mediaUrl = message.image?.id ? `wa-media:${message.image.id}` : null // resolved later
      break
    case "audio":
      contentType = "audio"
      mediaMime = message.audio?.mime_type || null
      mediaUrl = message.audio?.id ? `wa-media:${message.audio.id}` : null
      break
    case "video":
      contentType = "video"
      body = message.video?.caption || null
      mediaMime = message.video?.mime_type || null
      mediaUrl = message.video?.id ? `wa-media:${message.video.id}` : null
      break
    case "document":
      contentType = "document"
      body = message.document?.caption || message.document?.filename || null
      mediaMime = message.document?.mime_type || null
      mediaUrl = message.document?.id ? `wa-media:${message.document.id}` : null
      break
    case "sticker":
      contentType = "sticker"
      mediaMime = message.sticker?.mime_type || null
      mediaUrl = message.sticker?.id ? `wa-media:${message.sticker.id}` : null
      break
    case "location":
      contentType = "location"
      body = `${message.location?.latitude},${message.location?.longitude}`
      break
    default:
      contentType = "text"
      body = `[${message.type}]`
  }

  // Insert message (idempotent via external_id)
  await admin.from("crm_messages").insert({
    thread_id: threadId,
    org_id: orgId,
    external_id: message.id,
    direction: "inbound",
    content_type: contentType,
    body,
    media_url: mediaUrl,
    media_mime: mediaMime,
    metadata: { raw: message },
    sent_by_kind: "contact",
    status: "received",
  }).select("id").maybeSingle()
  // Conflict on UNIQUE (thread_id, external_id) is silently ignored — Supabase
  // returns the constraint error which we treat as duplicate (idempotency).

  log.info("[WhatsApp] inbound message", { thread_id: threadId, external_id: message.id })
}

async function handleStatusUpdate(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    messageExternalId: string
    status: "sent" | "delivered" | "read" | "failed"
    errorCode: string | null
    errorMessage: string | null
  },
) {
  await admin
    .from("crm_messages")
    .update({
      status: args.status,
      status_updated_at: new Date().toISOString(),
      error_code: args.errorCode,
      error_message: args.errorMessage,
    })
    .eq("external_id", args.messageExternalId)
}
