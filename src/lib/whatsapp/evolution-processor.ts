/**
 * Processador de webhooks da Evolution API (Baileys) → modelo crm_*.
 *
 * Mesma fila durável do fluxo Cloud API (crm_webhook_events com
 * source='evolution'); processClaimedEvent roteia pra cá. Diferenças de
 * regra vs Meta:
 *  - SEM janela de 24h (free-form sempre) — inbound só reabre thread
 *    resolvida, não chama open_crm_thread_window
 *  - fromMe=true (enviada do celular) vira outbound espelhada
 *    (sent_by_kind 'system'); o que a API enviou cai no dedup por
 *    external_id e não duplica
 *  - grupos/@lid/broadcast e reações são skip (v1 só DM)
 *  - mídia chega em base64 no webhook (setWebhook base64:true) com
 *    fallback getBase64FromMediaMessage
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { createEvolutionClient, type EvolutionAPI } from "./evolution-api"
import { getEvolutionRuntimeConfig } from "./evolution-settings"
import {
  buildEvolutionMessageContent,
  extractConnectionUpdate,
  extractStatusUpdate,
  jidToPhone,
  mapEvolutionStatus,
  parseEvolutionEnvelope,
  shouldSkipRemoteJid,
} from "./evolution-content"
import { shouldApplyStatus } from "./message-content"
import { persistBase64Media } from "./media"
import { getOrCreateThread, type ProcessResult } from "./webhook-processor"
import {
  clearCrmThreadNotifications,
  notifyCrmInboundMessage,
} from "@/lib/services/crm-inbox-notification.service"
import {
  clearChannelAlerts,
  notifyChannelDisconnected,
} from "@/lib/services/crm-channel-alert.service"

const log = logger.child("EvolutionProcessor")

interface EvolutionChannelRow {
  id: string
  org_id: string
  config: Record<string, unknown> | null
}

export async function processEvolutionEvent(
  admin: SupabaseClient,
  payload: unknown,
): Promise<ProcessResult> {
  const result: ProcessResult = { messages: 0, statuses: 0, templates: 0, skipped: 0 }

  const envelope = parseEvolutionEnvelope(payload)
  if (!envelope) {
    result.skipped++
    return result
  }

  const { data: channel } = await admin
    .from("crm_channels")
    .select("id, org_id, config")
    .eq("type", "whatsapp")
    .eq("provider", "evolution")
    .eq("external_id", envelope.instance)
    .eq("is_active", true)
    .maybeSingle<EvolutionChannelRow>()

  if (!channel) {
    log.warn("canal evolution não encontrado para instância", { instance: envelope.instance })
    result.skipped++
    return result
  }

  switch (envelope.event) {
    case "messages.upsert":
    case "send.message": {
      const inserted = await handleEvolutionMessage(admin, channel, envelope.instance, envelope.data)
      if (inserted) result.messages++
      else result.skipped++
      break
    }
    case "messages.update": {
      const applied = await handleEvolutionStatus(admin, channel.org_id, envelope.data)
      if (applied) result.statuses++
      else result.skipped++
      break
    }
    case "connection.update": {
      // Normalmente tratado inline no receiver; cobre o reprocess.
      const applied = await applyConnectionUpdate(admin, envelope.instance, envelope.data)
      if (!applied) result.skipped++
      break
    }
    default:
      result.skipped++
  }

  return result
}

async function handleEvolutionMessage(
  admin: SupabaseClient,
  channel: EvolutionChannelRow,
  instanceName: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const content = buildEvolutionMessageContent(data)
  if (!content) return false
  if (shouldSkipRemoteJid(content.remoteJid)) return false

  const contactPhone = jidToPhone(content.remoteJid)
  if (!contactPhone) return false

  // Dedup barato ANTES de mídia — é também o que impede a mensagem
  // enviada pela nossa API de duplicar quando ecoa com fromMe=true.
  const { data: existing } = await admin
    .from("crm_messages")
    .select("id")
    .eq("external_id", content.externalId)
    .eq("org_id", channel.org_id)
    .maybeSingle()
  if (existing) return false

  const threadId = await getOrCreateThread(admin, {
    orgId: channel.org_id,
    channelId: channel.id,
    contactExternalId: contactPhone,
    // pushName só é o nome do contato no inbound; fromMe traz o nosso.
    contactName: content.fromMe ? null : content.pushName,
  })
  if (!threadId) return false

  // Mídia: base64 do webhook → Storage; sem base64, fallback via REST.
  let mediaUrl: string | null = null
  let mediaStoragePath: string | null = null
  let mediaSize: number | null = null
  let mediaMime = content.mediaMime
  const isMediaType = ["image", "video", "audio", "document", "sticker"].includes(content.contentType)
  if (isMediaType) {
    let base64 = content.mediaBase64
    if (!base64) {
      const client = await getClientForChannel(admin, instanceName)
      if (client) {
        const fetched = await client.getBase64FromMediaMessage({ id: content.externalId })
        if (fetched) {
          base64 = fetched.base64
          mediaMime = fetched.mimetype ?? mediaMime
        }
      }
    }
    if (base64) {
      const persisted = await persistBase64Media(admin, {
        orgId: channel.org_id,
        threadId,
        base64,
        mime: mediaMime,
      })
      if (persisted) {
        mediaUrl = persisted.signedUrl
        mediaStoragePath = persisted.storagePath
        mediaSize = persisted.size
        mediaMime = persisted.mime
      }
    }
  }

  // Payload cru sem o base64 (pesado demais pro metadata JSONB).
  const rawForMetadata: Record<string, unknown> = { ...data }
  if (rawForMetadata.message && typeof rawForMetadata.message === "object") {
    const { base64: _omit, ...rest } = rawForMetadata.message as Record<string, unknown>
    rawForMetadata.message = rest
  }

  const { data: insertedRows, error: msgErr } = await admin
    .from("crm_messages")
    .upsert(
      {
        thread_id: threadId,
        org_id: channel.org_id,
        external_id: content.externalId,
        direction: content.fromMe ? "outbound" : "inbound",
        content_type: content.contentType,
        body: content.body,
        media_url: mediaUrl,
        media_mime: mediaMime,
        media_storage_path: mediaStoragePath,
        media_filename: content.mediaFilename,
        media_size: mediaSize,
        metadata: { raw: rawForMetadata, evolution_key: { id: content.externalId, remoteJid: content.remoteJid } },
        sent_by_kind: content.fromMe ? "system" : "contact",
        status: content.fromMe ? "sent" : "received",
      },
      { onConflict: "thread_id,external_id", ignoreDuplicates: true },
    )
    .select("id")

  if (msgErr) {
    log.error("erro ao persistir mensagem evolution", msgErr)
    throw new Error(`persist evolution message failed: ${msgErr.message}`)
  }

  const inserted = (insertedRows?.length ?? 0) > 0
  if (inserted && !content.fromMe) {
    // Sem janela de 24h no Baileys — inbound só reabre thread resolvida.
    await admin.from("crm_threads").update({ status: "open" }).eq("id", threadId).eq("status", "resolved")

    // Notificação no sino do admin (coalescida por thread). Awaited:
    // promise solta pode ser congelada no serverless. Best-effort.
    await notifyCrmInboundMessage(admin, {
      orgId: channel.org_id,
      threadId,
      messageId: insertedRows![0].id as string,
      contentType: content.contentType,
      body: content.body,
    })
  }

  if (inserted && content.fromMe) {
    // Agente respondeu pelo celular = conversa atendida — limpa as
    // notificações pendentes da thread (mesma semântica do send route).
    await clearCrmThreadNotifications(admin, threadId)
  }

  if (inserted) {
    log.info("evolution message", {
      thread_id: threadId,
      external_id: content.externalId,
      type: content.contentType,
      from_me: content.fromMe,
    })
  }

  return inserted
}

async function handleEvolutionStatus(
  admin: SupabaseClient,
  orgId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const update = extractStatusUpdate(data)
  if (!update) return false

  const mapped = mapEvolutionStatus(update.status)
  if (!mapped) return false

  const { data: message } = await admin
    .from("crm_messages")
    .select("id, status")
    .eq("external_id", update.externalId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!message) return false
  if (!shouldApplyStatus(message.status, mapped)) return false

  const { error } = await admin
    .from("crm_messages")
    .update({ status: mapped, status_updated_at: new Date().toISOString() })
    .eq("id", message.id)

  if (error) {
    log.error("erro ao aplicar status evolution", { external_id: update.externalId, message: error.message })
    return false
  }
  return true
}

/**
 * connection.update → estado da instância no config do canal. Também é
 * chamado inline pelo receiver (barato, sem fila).
 */
export async function applyConnectionUpdate(
  admin: SupabaseClient,
  instanceName: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const update = extractConnectionUpdate(data)
  if (!update) return false

  const { data: channel } = await admin
    .from("crm_channels")
    .select("id, config")
    .eq("type", "whatsapp")
    .eq("provider", "evolution")
    .eq("external_id", instanceName)
    .maybeSingle<{ id: string; config: Record<string, unknown> | null }>()

  if (!channel) {
    log.warn("connection.update para instância sem canal", { instanceName, state: update.state })
    return false
  }

  const now = new Date().toISOString()
  const config: Record<string, unknown> = {
    ...(channel.config ?? {}),
    connection_state: update.state,
  }
  if (update.state === "open") {
    config.connected_at = now
    config.needs_reconnect_at = null
    if (update.ownerPhone) config.owner_jid = update.ownerPhone
  } else if (update.state === "close") {
    config.disconnected_at = now
    // statusCode 401 = deslogou no celular → precisa de novo QR.
    if (update.statusCode === 401) config.needs_reconnect_at = now
  }

  const { error } = await admin.from("crm_channels").update({ config }).eq("id", channel.id)
  if (error) {
    log.error("falha ao persistir connection.update", { instanceName, message: error.message })
    return false
  }

  // Alertas no sino do admin (best-effort, nunca lançam):
  // - 401 = deslogou no celular → alerta IMEDIATO (definitivo, precisa QR).
  //   close genérico NÃO alerta aqui — Baileys oscila close→connecting→open
  //   em reconexão normal; o cron de health confirma se ficou fora mesmo.
  // - open → limpa os alertas abertos do canal.
  if (update.state === "close" && update.statusCode === 401) {
    await notifyChannelDisconnected(admin, { channelId: channel.id, kind: "logged_out" })
  } else if (update.state === "open") {
    await clearChannelAlerts(admin, channel.id)
  }

  log.info("connection.update aplicado", { instanceName, state: update.state, statusCode: update.statusCode })
  return true
}

async function getClientForChannel(admin: SupabaseClient, instanceName: string): Promise<EvolutionAPI | null> {
  const cfg = await getEvolutionRuntimeConfig(admin)
  if (!cfg) return null
  return createEvolutionClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, instanceName })
}
