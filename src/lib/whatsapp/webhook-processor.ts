/**
 * Processador de webhooks do WhatsApp Cloud API → modelo crm_*.
 *
 * Adaptação do webhook-processor do worder pro schema da convertfy
 * (crm_channels/crm_threads/crm_messages). Chamado pelo worker QStash,
 * pelo processamento inline do webhook e pelo cron de reprocess — o
 * evento cru vem de crm_webhook_events (claim atômico via RPC).
 *
 * - Inbound: thread upsert → mídia baixada pro Storage → insert
 *   idempotente (UNIQUE thread_id+external_id) → RPC de janela 24h
 * - Statuses: guard de retrograde (read antes de delivered é comum)
 *   com escopo por org — o update global antigo era bug
 * - message_template_status_update: reflete em crm_whatsapp_templates
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { dispatchThreadMessage } from "@/lib/services/crm-thread-trigger.service"
import { decrypt } from "@/lib/crypto"
import { createWhatsAppCloudClient, type WebhookMessage, type WhatsAppCloudAPI } from "./cloud-api"
import { buildMessageContent, shouldApplyStatus } from "./message-content"
import { persistInboundMedia } from "./media"
import { notifyCrmInboundMessage } from "@/lib/services/crm-inbox-notification.service"
import { phoneVariants } from "./phone"

const log = logger.child("WhatsAppProcessor")

// ─── Tipos do payload Meta ────────────────────────────────────────

interface WebhookStatus {
  id: string
  status: "sent" | "delivered" | "read" | "failed"
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string; message?: string }>
  conversation?: { id: string; origin?: { type?: string } }
  pricing?: { billable?: boolean; category?: string; pricing_model?: string }
}

interface WebhookChangeValue {
  messaging_product?: string
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
  messages?: WebhookMessage[]
  statuses?: WebhookStatus[]
  // message_template_status_update
  event?: string
  message_template_id?: number | string
  message_template_name?: string
  message_template_language?: string
  reason?: string | null
}

interface WebhookEntry {
  id?: string // WABA id
  changes?: Array<{ field: string; value: WebhookChangeValue }>
}

export interface WebhookPayload {
  object?: string
  entry?: WebhookEntry[]
}

export interface ProcessResult {
  messages: number
  statuses: number
  templates: number
  skipped: number
}

interface ChannelRow {
  id: string
  org_id: string
  config: Record<string, string> | null
}

export interface WebhookEventRow {
  id: string
  /** 'whatsapp' (Meta Cloud API) | 'evolution' (Baileys) — roteia o processor. */
  source: string
  raw_payload: WebhookPayload
  attempts: number
  max_attempts: number
}

// ─── Entry points ─────────────────────────────────────────────────

export async function processWebhookEvent(
  admin: SupabaseClient,
  payload: WebhookPayload,
): Promise<ProcessResult> {
  const result: ProcessResult = { messages: 0, statuses: 0, templates: 0, skipped: 0 }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "messages") {
        await processMessagesChange(admin, change.value, result)
      } else if (change.field === "message_template_status_update") {
        await processTemplateStatusUpdate(admin, entry.id, change.value, result)
      } else {
        result.skipped++
      }
    }
  }

  return result
}

/**
 * Processa um evento já claimado (status='processing') e persiste o
 * desfecho: done, failed ou dead (tentativas esgotadas). Compartilhado
 * pelo webhook inline, worker QStash e cron de reprocess.
 */
export async function processClaimedEvent(
  admin: SupabaseClient,
  event: WebhookEventRow,
): Promise<{ ok: boolean; result?: ProcessResult; error?: string }> {
  try {
    // Roteamento por source: a fila durável é compartilhada entre a
    // Cloud API (Meta) e a Evolution — payloads têm shapes diferentes.
    // Import lazy evita ciclo (evolution-processor usa getOrCreateThread).
    let result: ProcessResult
    if (event.source === "evolution") {
      const { processEvolutionEvent } = await import("./evolution-processor")
      result = await processEvolutionEvent(admin, event.raw_payload)
    } else {
      result = await processWebhookEvent(admin, event.raw_payload)
    }
    await admin
      .from("crm_webhook_events")
      .update({
        status: "done",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", event.id)
    return { ok: true, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isDead = event.attempts >= event.max_attempts
    log.error("processamento de evento falhou", { eventId: event.id, attempts: event.attempts, message })
    await admin
      .from("crm_webhook_events")
      .update({
        status: isDead ? "dead" : "failed",
        last_error: message.slice(0, 2000),
        in_flight_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id)
    return { ok: false, error: message }
  }
}

// ─── Inbound + statuses ───────────────────────────────────────────

async function processMessagesChange(
  admin: SupabaseClient,
  value: WebhookChangeValue,
  result: ProcessResult,
): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) {
    result.skipped++
    return
  }

  const { data: channel } = await admin
    .from("crm_channels")
    .select("id, org_id, config")
    .eq("type", "whatsapp")
    .eq("external_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle<ChannelRow>()

  if (!channel) {
    log.warn("canal não encontrado para phone_number_id", { phoneNumberId })
    result.skipped++
    return
  }

  // Client só é necessário pra baixar mídia — lazy e tolerante a config
  // incompleto (mensagens de texto persistem mesmo sem token).
  let client: WhatsAppCloudAPI | null | undefined
  const getClient = (): WhatsAppCloudAPI | null => {
    if (client !== undefined) return client
    const config = channel.config ?? {}
    if (config.access_token) {
      client = createWhatsAppCloudClient({
        phoneNumberId,
        accessToken: decrypt(config.access_token),
        wabaId: config.business_account_id,
      })
    } else {
      client = null
    }
    return client
  }

  for (const message of value.messages || []) {
    const inserted = await handleInboundMessage(admin, {
      orgId: channel.org_id,
      channelId: channel.id,
      message,
      contactName: value.contacts?.[0]?.profile?.name ?? null,
      getClient,
    })
    if (inserted) result.messages++
  }

  for (const status of value.statuses || []) {
    const applied = await handleStatusUpdate(admin, channel.org_id, status)
    if (applied) result.statuses++
  }
}

async function handleInboundMessage(
  admin: SupabaseClient,
  args: {
    orgId: string
    channelId: string
    message: WebhookMessage
    contactName: string | null
    getClient: () => WhatsAppCloudAPI | null
  },
): Promise<boolean> {
  const { orgId, channelId, message, contactName } = args

  // Dedup barato ANTES de baixar mídia — a Meta reenvia eventos e o
  // download é a parte cara do processamento.
  const { data: existing } = await admin
    .from("crm_messages")
    .select("id")
    .eq("external_id", message.id)
    .eq("org_id", orgId)
    .maybeSingle()
  if (existing) return false

  const threadId = await getOrCreateThread(admin, {
    orgId,
    channelId,
    contactExternalId: message.from,
    contactName,
  })
  if (!threadId) return false

  const content = buildMessageContent(message)

  // Mídia: baixa da Meta → Storage. Falha não derruba a mensagem —
  // metadata.wa_media_id permite resolver on-demand depois.
  let mediaUrl: string | null = null
  let mediaStoragePath: string | null = null
  let mediaSize: number | null = null
  if (content.mediaId) {
    const client = args.getClient()
    if (client) {
      const persisted = await persistInboundMedia(admin, client, {
        orgId,
        threadId,
        mediaId: content.mediaId,
        filename: content.mediaFilename,
      })
      if (persisted) {
        mediaUrl = persisted.signedUrl
        mediaStoragePath = persisted.storagePath
        mediaSize = persisted.size
      }
    }
  }

  const { data: insertedRows, error: msgErr } = await admin
    .from("crm_messages")
    .upsert(
      {
        thread_id: threadId,
        org_id: orgId,
        external_id: message.id,
        direction: "inbound",
        content_type: content.contentType,
        body: content.body,
        media_url: mediaUrl,
        media_mime: content.mediaMime,
        media_storage_path: mediaStoragePath,
        media_filename: content.mediaFilename,
        media_size: mediaSize,
        metadata: { raw: message, ...(content.mediaId ? { wa_media_id: content.mediaId } : {}) },
        sent_by_kind: "contact",
        status: "received",
      },
      { onConflict: "thread_id,external_id", ignoreDuplicates: true },
    )
    .select("id")

  if (msgErr) {
    log.error("erro ao persistir mensagem", msgErr)
    throw new Error(`persist message failed: ${msgErr.message}`)
  }

  const inserted = (insertedRows?.length ?? 0) > 0
  if (inserted) {
    // Cada inbound reabre/renova a janela de 24h. RPC não toca
    // last_message_*/unread_count (trigger AFTER INSERT já cuida).
    const ts = Number(message.timestamp)
    const messageAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString()
    const { error: rpcError } = await admin.rpc("open_crm_thread_window", {
      p_thread_id: threadId,
      p_now: messageAt,
    })
    if (rpcError) log.error("open_crm_thread_window falhou", { threadId, message: rpcError.message })

    // Notificação no sino do admin (coalescida por thread) — awaited
    // de propósito: promise solta pode ser congelada pelo runtime
    // serverless após o return. Best-effort: nunca lança.
    await notifyCrmInboundMessage(admin, {
      orgId,
      threadId,
      messageId: insertedRows![0].id as string,
      contentType: content.contentType,
      body: content.body,
    })

    // Mesma ponte do Instagram: o gatilho "Mensagem recebida" nunca era
    // emitido, então automações com ele ficavam paradas. Awaited de
    // propósito — promise solta some no runtime serverless.
    const { count: previousInbound } = await admin
      .from("crm_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .neq("external_id", message.id)

    await dispatchThreadMessage({
      org_id: orgId,
      thread_id: threadId,
      channel_id: channelId,
      channel_type: "whatsapp",
      event_kind: "message",
      contact_external_id: args.message.from,
      contact_name: contactName,
      message_text: content.body,
      is_first_message: (previousInbound ?? 0) === 0,
      external_message_id: message.id,
    })

    log.info("inbound message", { thread_id: threadId, external_id: message.id, type: content.contentType })
  }

  return inserted
}

/**
 * Busca/cria a thread do contato no canal (compartilhado com o
 * evolution-processor). contactExternalId = telefone E.164 sem "+".
 */
export async function getOrCreateThread(
  admin: SupabaseClient,
  args: { orgId: string; channelId: string; contactExternalId: string; contactName: string | null },
): Promise<string | null> {
  const { orgId, channelId, contactName } = args
  const phoneE164 = args.contactExternalId

  // Lookup pelas variantes BR do nono dígito: a Meta às vezes reporta
  // o wa_id SEM o 9 e o outbound (resolve/popup) grava COM — sem as
  // variantes o inbound criava uma SEGUNDA thread (split de conversa).
  // Só o LOOKUP usa variantes; o insert mantém o wa_id original.
  const { data: existingThread } = await admin
    .from("crm_threads")
    .select("id")
    .eq("channel_id", channelId)
    .in("contact_external_id", phoneVariants(phoneE164))
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingThread) {
    if (contactName) {
      await admin.from("crm_threads").update({ contact_name: contactName }).eq("id", existingThread.id)
    }
    return existingThread.id
  }

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

  if (error) {
    // Race na criação (23505): outro worker criou a thread — rebusca
    // (também pelas variantes, espelhando o lookup inicial).
    if (error.code === "23505") {
      const { data: raced } = await admin
        .from("crm_threads")
        .select("id")
        .eq("channel_id", channelId)
        .in("contact_external_id", phoneVariants(phoneE164))
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      return raced?.id ?? null
    }
    log.error("erro ao criar thread", error)
    throw new Error(`create thread failed: ${error.message}`)
  }

  return newThread?.id ?? null
}

async function handleStatusUpdate(
  admin: SupabaseClient,
  orgId: string,
  status: WebhookStatus,
): Promise<boolean> {
  // Escopo por org (o update antigo era global por external_id).
  const { data: message } = await admin
    .from("crm_messages")
    .select("id, status, metadata")
    .eq("external_id", status.id)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!message) return false
  if (!shouldApplyStatus(message.status, status.status)) return false

  const metadata = {
    ...((message.metadata as Record<string, unknown>) ?? {}),
    ...(status.pricing ? { pricing: status.pricing } : {}),
    ...(status.conversation ? { conversation: status.conversation } : {}),
  }

  const { error } = await admin
    .from("crm_messages")
    .update({
      status: status.status,
      status_updated_at: new Date().toISOString(),
      error_code: status.errors?.[0]?.code?.toString() ?? null,
      error_message: status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? null,
      metadata,
    })
    .eq("id", message.id)

  if (error) {
    log.error("erro ao aplicar status", { external_id: status.id, message: error.message })
    return false
  }
  return true
}

// ─── Template status update ───────────────────────────────────────

async function processTemplateStatusUpdate(
  admin: SupabaseClient,
  wabaId: string | undefined,
  value: WebhookChangeValue,
  result: ProcessResult,
): Promise<void> {
  const name = value.message_template_name
  const language = value.message_template_language
  const event = value.event
  if (!name || !event) {
    result.skipped++
    return
  }

  let query = admin
    .from("crm_whatsapp_templates")
    .update({
      status: event.toUpperCase(),
      rejection_reason: value.reason ?? null,
      synced_at: new Date().toISOString(),
    })
    .eq("name", name)

  if (language) query = query.eq("language", language)
  if (wabaId) query = query.eq("waba_id", wabaId)

  const { error } = await query
  if (error) {
    log.error("template status update falhou", { name, event, message: error.message })
  } else {
    result.templates++
    log.info("template status atualizado", { name, language, event })
  }
}
