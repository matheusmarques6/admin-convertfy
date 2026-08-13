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

type SignatureVerdict = "ok" | "no_secret" | "no_signature" | "mismatch"

/**
 * Verifica o HMAC e DIZ POR QUÊ quando recusa.
 *
 * Antes devolvia só `false`: secret ausente no servidor e assinatura
 * errada produziam o mesmo 403 mudo, e o sintoma na tela era idêntico a
 * "a Meta nunca chamou". São causas opostas — uma é variável de ambiente
 * faltando, a outra é app secret trocado — e sem distinguir as duas o
 * diagnóstico virava adivinhação.
 */
function checkSignature(rawBody: string, signature: string | null): SignatureVerdict {
  // META_APP_SECRET serve pro app inteiro (WhatsApp + Instagram + Pages).
  const secret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET
  if (!secret) return "no_secret"
  if (!signature) return "no_signature"
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.byteLength !== b.byteLength) return "mismatch"
  return crypto.timingSafeEqual(a, b) ? "ok" : "mismatch"
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

  const verdict = checkSignature(rawBody, signature)
  if (process.env.NODE_ENV === "production" && verdict !== "ok") {
    // Cada motivo pede uma ação diferente — o log tem de dizer qual.
    log.error("[Instagram] webhook recusado na assinatura", {
      motivo: verdict,
      acao:
        verdict === "no_secret"
          ? "defina META_APP_SECRET no servidor (Configurações → Básico do app da Meta)"
          : verdict === "no_signature"
            ? "chamada sem X-Hub-Signature-256 — confira se veio mesmo da Meta"
            : "assinatura não confere — o META_APP_SECRET do servidor é de OUTRO app",
      body_bytes: rawBody.length,
    })
    return new NextResponse("Forbidden", { status: 403 })
  }

  let payload: { object?: string; entry?: IgWebhookEntry[] }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  // `instagram` é o objeto documentado; `page` aparece quando o app
  // entrega o direct do IG pelo produto Messenger. Recusar o segundo
  // descartava evento legítimo com um log.warn e nada mais. Quem decide
  // se o evento nos interessa é o lookup do canal, logo abaixo.
  if (payload.object !== "instagram" && payload.object !== "page") {
    log.warn("[Instagram] unknown payload object", { object: payload.object })
    return NextResponse.json({ ignored: true })
  }

  const admin = createAdminClient()

  const outcome = { canais: 0, sem_canal: [] as string[], dms: 0, comments: 0, ecos: 0 }

  for (const entry of payload.entry || []) {
    const channel = await resolveChannel(admin, entry.id)

    if (!channel) {
      // Não é erro: pode ser conta de outro produto no mesmo app da Meta.
      // Mas é a pista nº 1 quando "não chega mensagem", então registra o
      // ID exato pra comparar com o external_id salvo.
      log.warn("[Instagram] channel nao encontrado para o entry", { entryId: entry.id })
      outcome.sem_canal.push(entry.id)
      continue
    }
    outcome.canais++

    // ── DMs ──
    for (const ev of entry.messaging || []) {
      if (ev.message?.is_deleted) continue
      if (ev.message?.is_echo) {
        // Eco = mensagem que NÓS mandamos, inclusive pelo app do celular.
        // Descartar deixava o atendente cego: o histórico do inbox
        // divergia da conversa real sempre que alguém respondia fora
        // daqui. É idempotente pelo mid, então o eco do nosso próprio
        // envio pela API não duplica a bolha.
        const saved = await handleEchoDm(admin, {
          orgId: channel.org_id,
          channelId: channel.id,
          event: ev,
        })
        if (saved) outcome.ecos++
        continue
      }
      const saved = await handleInboundDm(admin, {
        orgId: channel.org_id,
        channelId: channel.id,
        igAccountId: channel.external_id,
        event: ev,
      })
      if (saved) outcome.dms++
    }

    // ── Comments ──
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue
      const saved = await handleInboundComment(admin, {
        orgId: channel.org_id,
        channelId: channel.id,
        change,
      })
      if (saved) outcome.comments++
    }
  }

  // Log forense do payload cru. Entra como 'done': a fila durável é
  // compartilhada e `processClaimedEvent` roteia tudo que não é
  // 'evolution' pro processador do WhatsApp — um evento do Instagram
  // em 'pending' seria repescado pelo cron e processado com o parser
  // errado. Aqui o objetivo é poder responder "a Meta chamou?", que é
  // exatamente o que faltava para diagnosticar.
  await admin
    .from("crm_webhook_events")
    .insert({
      source: "instagram",
      external_channel_id: payload.entry?.[0]?.id ?? null,
      raw_payload: payload,
      signature,
      status: "done",
      processed_at: new Date().toISOString(),
      last_error: outcome.sem_canal.length
        ? `sem canal ativo para: ${outcome.sem_canal.join(", ")}`
        : null,
    })
    .then(({ error }) => {
      if (error) log.warn("[Instagram] evento cru não persistido", { error: error.message })
    })

  log.info("[Instagram] webhook processado", outcome)
  return NextResponse.json({ received: true })
}

/**
 * Acha o canal do evento. `entry.id` é o IG Business Account ID no
 * objeto `instagram` e o ID da PÁGINA no objeto `page` — os dois chegam
 * dependendo de como o app está montado, e só o primeiro era procurado.
 */
async function resolveChannel(
  admin: ReturnType<typeof createAdminClient>,
  entryId: string,
): Promise<{ id: string; org_id: string; external_id: string } | null> {
  const { data: byAccount } = await admin
    .from("crm_channels")
    .select("id, org_id, external_id")
    .eq("type", "instagram")
    .eq("external_id", entryId)
    .eq("is_active", true)
    .maybeSingle()
  if (byAccount) return byAccount

  const { data: byPage } = await admin
    .from("crm_channels")
    .select("id, org_id, external_id")
    .eq("type", "instagram")
    .eq("config->>facebook_page_id", entryId)
    .eq("is_active", true)
    .maybeSingle()
  return byPage ?? null
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
): Promise<boolean> {
  const { orgId, channelId, igAccountId, event } = args
  if (!event.message?.mid) return false

  // Sender pode ser o usuario ou nossa propria conta. Quando sender ==
  // igAccountId, e mensagem que NOS mandamos via outra fonte (raro
  // porque is_echo deveria pegar). Skip pra ser seguro.
  if (event.sender.id === igAccountId) return false

  const contactExternalId = event.sender.id

  // Upsert thread (uma por sender)
  const threadId = await upsertThread(admin, {
    orgId,
    channelId,
    contactExternalId,
    contactName: null,
    metadata: { kind: "dm" },
  })
  if (!threadId) return false

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
    return false
  }

  // Inbound reabre conversa resolvida (mesma semântica do WhatsApp) e
  // ABRE A JANELA DE 24H. A barra de janela do inbox já era exibida pro
  // Instagram, mas nada no sistema abria a janela — ficava eternamente
  // "fechada" e o atendente não tinha como saber quanto tempo lhe resta
  // pra responder. O RPC é genérico (não é específico do WhatsApp).
  const { error: windowError } = await admin.rpc("open_crm_thread_window", {
    p_thread_id: threadId,
  })
  if (windowError) {
    // Fail-open: janela é indicador, nunca motivo pra perder a mensagem.
    log.warn("[Instagram] não abriu a janela de 24h", { threadId, error: windowError.message })
    await admin
      .from("crm_threads")
      .update({ status: "open" })
      .eq("id", threadId)
      .eq("status", "resolved")
  }

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
  return true
}

/**
 * Eco: mensagem enviada pela NOSSA conta fora deste admin (app do
 * celular, outra ferramenta). Grava como outbound `system`, que o inbox
 * já sabe rotular como "Pelo celular" (`crm-inbox-format`).
 *
 * No eco o contato é o RECIPIENT — o oposto do inbound. Não dispara
 * automação (nós mandamos, não há o que reagir), não mexe em unread e
 * não abre janela de 24h: quem abre a janela é o contato, não nós.
 */
async function handleEchoDm(
  admin: ReturnType<typeof createAdminClient>,
  args: { orgId: string; channelId: string; event: IgMessagingEvent },
): Promise<boolean> {
  const { orgId, channelId, event } = args
  if (!event.message?.mid) return false

  const contactExternalId = event.recipient?.id
  if (!contactExternalId) return false

  const threadId = await upsertThread(admin, {
    orgId,
    channelId,
    contactExternalId,
    contactName: null,
    metadata: { kind: "dm" },
  })
  if (!threadId) return false

  const att = event.message.attachments?.[0]
  const { error } = await admin.from("crm_messages").upsert(
    {
      thread_id: threadId,
      org_id: orgId,
      external_id: event.message.mid,
      direction: "outbound",
      content_type: att?.type === "image" ? "image" : "text",
      body: event.message.text || (att ? `[${att.type}]` : null),
      media_url: att?.payload?.url ?? null,
      metadata: { raw: event, source: "ig_dm_echo" },
      sent_by_kind: "system",
      status: "sent",
    },
    { onConflict: "thread_id,external_id", ignoreDuplicates: true },
  )

  if (error) {
    log.error("[Instagram] erro ao persistir eco", error)
    return false
  }
  return true
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
): Promise<boolean> {
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
  if (!threadId) return false

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
    return false
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
  return true
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
