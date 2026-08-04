/**
 * Instagram webhook receiver (Meta Graph API).
 *
 * Aceita 2 tipos de evento:
 *   1. Direct Messages — entry[].messaging[]
 *   2. Comments — entry[].changes[] com field='comments'
 *
 * - GET: handshake hub.mode=subscribe (mesma mecanica do WhatsApp).
 * - POST: valida HMAC SHA-256 com META_APP_SECRET. Persiste em
 *   crm_threads + crm_messages (idempotente via external_id).
 *
 * Comments sao tratados como uma "thread" separada por post — usa o
 * media_id como contact_external_id pra agrupar todos os comentarios
 * de um mesmo post numa unica thread.
 *
 * Docs:
 *   - DMs: https://developers.facebook.com/docs/messenger-platform/instagram/get-started
 *   - Comments: https://developers.facebook.com/docs/instagram-api/guides/webhooks
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { dispatchThreadMessage } from "@/lib/services/crm-thread-trigger.service"

const log = logger.child("InstagramWebhook")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ─── GET: verify_token handshake ─────────────────────────────────
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get("hub.mode")
  const token = sp.get("hub.verify_token")
  const challenge = sp.get("hub.challenge")

  // Reusa o mesmo verify_token do WhatsApp se META_WEBHOOK_VERIFY_TOKEN
  // nao estiver definido (pratico pra single-tenant Meta App).
  const expected =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (!expected) {
    log.error("META_WEBHOOK_VERIFY_TOKEN nao configurado")
    return new NextResponse("Server misconfigured", { status: 500 })
  }

  if (mode === "subscribe" && token === expected && challenge) {
    log.info("[Instagram] webhook verified")
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse("Forbidden", { status: 403 })
}

// ─── POST: ingest events ─────────────────────────────────────────

function verifySignature(rawBody: string, signature: string | null): boolean {
  // META_APP_SECRET serve pro app inteiro (WhatsApp + Instagram + Pages).
  const secret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET
  if (!secret || !signature) return false
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.byteLength !== b.byteLength) return false
  return crypto.timingSafeEqual(a, b)
}

// ─── Tipos do payload ───────────────────────────────────────────

interface IgMessagingAttachment {
  type: "image" | "video" | "audio" | "file" | "story_mention" | "share" | "ig_reel" | string
  payload?: { url?: string; sticker_id?: number }
}

interface IgMessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: {
    mid: string
    text?: string
    attachments?: IgMessagingAttachment[]
    is_echo?: boolean
    is_deleted?: boolean
  }
  read?: { mid?: string }
  delivery?: { mids?: string[] }
}

interface IgCommentChange {
  field: "comments"
  value: {
    id: string // comment id
    from?: { id: string; username?: string }
    media: { id: string; media_product_type?: string }
    text?: string
    parent_id?: string
    created_time?: string
  }
}

interface IgWebhookEntry {
  id: string // page or IG account id
  time: number
  messaging?: IgMessagingEvent[]
  changes?: IgCommentChange[]
}

// ─── POST handler ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  if (
    process.env.NODE_ENV === "production" &&
    !verifySignature(rawBody, signature)
  ) {
    log.error("[Instagram] invalid signature")
    return new NextResponse("Forbidden", { status: 403 })
  }

  let payload: { object?: string; entry?: IgWebhookEntry[] }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  if (payload.object !== "instagram") {
    log.warn("[Instagram] unknown payload object", { object: payload.object })
    return NextResponse.json({ ignored: true })
  }

  const admin = createAdminClient()

  for (const entry of payload.entry || []) {
    const igAccountId = entry.id

    // Busca o channel correspondente (1 channel por IG business account).
    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, org_id, store_id, config")
      .eq("type", "instagram")
      .eq("external_id", igAccountId)
      .eq("is_active", true)
      .maybeSingle()

    if (!channel) {
      log.warn("[Instagram] channel nao encontrado", { igAccountId })
      continue
    }

    // ── DMs ──
    for (const ev of entry.messaging || []) {
      if (ev.message?.is_echo) continue // ignora eco da nossa propria msg
      await handleInboundDm(admin, {
        orgId: channel.org_id,
        channelId: channel.id,
        igAccountId,
        event: ev,
      })
    }

    // ── Comments ──
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue
      await handleInboundComment(admin, {
        orgId: channel.org_id,
        channelId: channel.id,
        change,
      })
    }
  }

  return NextResponse.json({ received: true })
}

// ─── Handlers ────────────────────────────────────────────────────

async function handleInboundDm(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    orgId: string
    channelId: string
    igAccountId: string
    event: IgMessagingEvent
  },
) {
  const { orgId, channelId, igAccountId, event } = args
  if (!event.message?.mid) return

  // Sender pode ser o usuario ou nossa propria conta. Quando sender ==
  // igAccountId, e mensagem que NOS mandamos via outra fonte (raro
  // porque is_echo deveria pegar). Skip pra ser seguro.
  if (event.sender.id === igAccountId) return

  const contactExternalId = event.sender.id

  // Upsert thread (uma por sender)
  const threadId = await upsertThread(admin, {
    orgId,
    channelId,
    contactExternalId,
    contactName: null,
    metadata: { kind: "dm" },
  })
  if (!threadId) return

  // Mapeia tipo
  let contentType = "text"
  let body: string | null = event.message.text || null
  let mediaUrl: string | null = null
  let mediaMime: string | null = null

  const att = event.message.attachments?.[0]
  if (att) {
    if (att.type === "image") {
      contentType = "image"
      mediaUrl = att.payload?.url || null
      mediaMime = "image/*"
    } else if (att.type === "video") {
      contentType = "video"
      mediaUrl = att.payload?.url || null
      mediaMime = "video/*"
    } else if (att.type === "audio") {
      contentType = "audio"
      mediaUrl = att.payload?.url || null
      mediaMime = "audio/*"
    } else if (att.type === "story_mention" || att.type === "share" || att.type === "ig_reel") {
      contentType = "system"
      body = body || `[${att.type}]`
    } else {
      contentType = "text"
      body = body || `[${att.type}]`
    }
  }

  const { error } = await admin.from("crm_messages").upsert(
    {
      thread_id: threadId,
      org_id: orgId,
      external_id: event.message.mid,
      direction: "inbound",
      content_type: contentType,
      body,
      media_url: mediaUrl,
      media_mime: mediaMime,
      metadata: { raw: event, source: "ig_dm" },
      sent_by_kind: "contact",
      status: "received",
    },
    { onConflict: "thread_id,external_id", ignoreDuplicates: true },
  )

  if (error) {
    log.error("[Instagram] erro ao persistir DM", error)
    return
  }

  // Inbound reabre conversa resolvida (mesma semântica do WhatsApp) —
  // sem isso, contato que volta a escrever depois do "resolver" (ou de
  // uma importação de histórico, que cria threads resolved) ficava
  // fora da fila de atendimento.
  await admin
    .from("crm_threads")
    .update({ status: "open" })
    .eq("id", threadId)
    .eq("status", "resolved")

  log.info("[Instagram] inbound DM", { thread_id: threadId, mid: event.message.mid })

  // "Respondeu o direct → entra nesta pipeline" mora aqui: sem este
  // disparo o gatilho "Mensagem recebida" nunca acontecia.
  await dispatchThreadMessage({
    org_id: orgId,
    thread_id: threadId,
    channel_id: channelId,
    channel_type: "instagram",
    event_kind: "message",
    contact_external_id: contactExternalId,
    message_text: body,
    is_first_message: await isFirstInboundMessage(admin, threadId, event.message.mid),
    external_message_id: event.message.mid,
  })
}

/**
 * Primeira mensagem do contato nesta conversa? Conta as inbound já
 * gravadas ignorando a atual — automação de "novo contato" não pode
 * disparar a cada resposta.
 */
async function isFirstInboundMessage(
  admin: ReturnType<typeof createAdminClient>,
  threadId: string,
  currentExternalId: string,
): Promise<boolean> {
  const { count } = await admin
    .from("crm_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .neq("external_id", currentExternalId)
  return (count ?? 0) === 0
}

async function handleInboundComment(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    orgId: string
    channelId: string
    change: IgCommentChange
  },
) {
  const { orgId, channelId, change } = args
  const v = change.value

  // Comments agrupados por media (post). contact_external_id = "comment:{media_id}"
  // pra nao colidir com DMs que usam o user_id.
  const contactExternalId = `comment:${v.media.id}`
  const senderName = v.from?.username || null

  const threadId = await upsertThread(admin, {
    orgId,
    channelId,
    contactExternalId,
    contactName: senderName,
    metadata: { kind: "comments", media_id: v.media.id },
  })
  if (!threadId) return

  const { error } = await admin.from("crm_messages").upsert(
    {
      thread_id: threadId,
      org_id: orgId,
      external_id: v.id,
      direction: "inbound",
      content_type: "text",
      body: v.text || null,
      metadata: {
        raw: change,
        source: "ig_comment",
        comment_id: v.id,
        media_id: v.media.id,
        parent_id: v.parent_id ?? null,
        sender_username: senderName,
        sender_id: v.from?.id ?? null,
      },
      sent_by_kind: "contact",
      status: "received",
    },
    { onConflict: "thread_id,external_id", ignoreDuplicates: true },
  )

  if (error) {
    log.error("[Instagram] erro ao persistir comment", error)
    return
  }

  await admin
    .from("crm_threads")
    .update({ status: "open" })
    .eq("id", threadId)
    .eq("status", "resolved")

  log.info("[Instagram] inbound comment", { thread_id: threadId, comment_id: v.id })

  // Comentário é o "interagiu" do pedido: pode cair numa pipeline
  // diferente da de quem manda direct.
  await dispatchThreadMessage({
    org_id: orgId,
    thread_id: threadId,
    channel_id: channelId,
    channel_type: "instagram",
    event_kind: "comment",
    contact_external_id: contactExternalId,
    contact_name: senderName,
    message_text: v.text || null,
    is_first_message: await isFirstInboundMessage(admin, threadId, v.id),
    external_message_id: v.id,
  })
}

async function upsertThread(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    orgId: string
    channelId: string
    contactExternalId: string
    contactName: string | null
    metadata: Record<string, unknown>
  },
): Promise<string | null> {
  const { data: existing } = await admin
    .from("crm_threads")
    .select("id")
    .eq("channel_id", args.channelId)
    .eq("contact_external_id", args.contactExternalId)
    .maybeSingle()

  if (existing) {
    if (args.contactName) {
      await admin
        .from("crm_threads")
        .update({ contact_name: args.contactName })
        .eq("id", existing.id)
    }
    return existing.id
  }

  const { data: created, error } = await admin
    .from("crm_threads")
    .insert({
      org_id: args.orgId,
      channel_id: args.channelId,
      contact_external_id: args.contactExternalId,
      contact_name: args.contactName,
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error || !created) {
    log.error("[Instagram] erro ao criar thread", error)
    return null
  }
  return created.id
}
