/**
 * WhatsApp Cloud API client (oficial Meta) — apenas a API oficial.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
 *
 * Versao da API: v20.0 (LTS estavel ate ~2027).
 *
 * Provider pattern: cada channel armazena access_token + phone_number_id
 * em config (criptografado via supabase secrets em prod). Funcao
 * sendText monta a request /messages e retorna {message_id, error}.
 */

import { logger } from "@/lib/logger"

const log = logger.child("WhatsAppCloud")

const API_VERSION = "v20.0"
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`

interface WhatsAppChannelConfig {
  phone_number_id: string
  access_token: string
  business_account_id?: string
}

export interface WhatsAppMessage {
  to: string // E.164 phone number, no leading +
  type: "text" | "template" | "image" | "document"
  text?: { body: string; preview_url?: boolean }
  template?: {
    name: string
    language: { code: string }
    components?: Array<{
      type: "body" | "header" | "button"
      parameters?: Array<{ type: string; text?: string }>
    }>
  }
  image?: { link: string; caption?: string }
  document?: { link: string; filename?: string; caption?: string }
}

export interface SendResult {
  success: boolean
  message_id?: string
  error?: { code: string; message: string }
}

export async function sendWhatsAppMessage(
  config: WhatsAppChannelConfig,
  msg: WhatsAppMessage,
): Promise<SendResult> {
  if (!config.access_token || !config.phone_number_id) {
    return {
      success: false,
      error: { code: "config_missing", message: "Channel config missing access_token or phone_number_id" },
    }
  }

  const url = `${BASE_URL}/${config.phone_number_id}/messages`
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: msg.to.replace(/^\+/, ""),
    type: msg.type,
  }

  if (msg.type === "text" && msg.text) body.text = msg.text
  if (msg.type === "template" && msg.template) body.template = msg.template
  if (msg.type === "image" && msg.image) body.image = msg.image
  if (msg.type === "document" && msg.document) body.document = msg.document

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok || data.error) {
      log.error("[WhatsApp] send failed", {
        status: res.status,
        error: data.error,
      })
      return {
        success: false,
        error: {
          code: data.error?.code?.toString() || res.status.toString(),
          message: data.error?.message || "Unknown error",
        },
      }
    }

    const messageId = data.messages?.[0]?.id
    return {
      success: true,
      message_id: messageId,
    }
  } catch (err) {
    log.error("[WhatsApp] network error", err)
    return {
      success: false,
      error: {
        code: "network_error",
        message: err instanceof Error ? err.message : "Network error",
      },
    }
  }
}

/**
 * Marca mensagem como lida (read receipts).
 */
export async function markAsRead(
  config: WhatsAppChannelConfig,
  externalMessageId: string,
): Promise<SendResult> {
  if (!config.access_token || !config.phone_number_id) {
    return {
      success: false,
      error: { code: "config_missing", message: "Channel config missing" },
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/${config.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: externalMessageId,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: { code: res.status.toString(), message: data.error?.message || "Failed" } }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: { code: "network_error", message: err instanceof Error ? err.message : "Error" } }
  }
}
