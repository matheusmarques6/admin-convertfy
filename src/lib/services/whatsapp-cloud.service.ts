/**
 * WhatsApp Cloud API — adapter de compatibilidade.
 *
 * A implementação real vive em @/lib/whatsapp/cloud-api (client completo
 * com retry/backoff, taxonomia de erros Meta e Graph v22). Este módulo
 * mantém as assinaturas antigas (sendWhatsAppMessage/markAsRead sobre o
 * config do canal) pros callers existentes — acompanhamento, automação
 * do CRM e onboarding — sem churn. Código novo deve usar o client via
 * loadWhatsAppChannel (@/lib/whatsapp/channel-config).
 */

import { logger } from "@/lib/logger"
import { decrypt } from "@/lib/crypto"
import {
  createWhatsAppCloudClient,
  WhatsAppCloudError,
  type SendMessageResult,
} from "@/lib/whatsapp/cloud-api"

const log = logger.child("WhatsAppCloud")

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

function buildClient(config: WhatsAppChannelConfig) {
  // access_token pode estar cifrado (enc:v1:) ou em plaintext legado —
  // decrypt tem passthrough.
  return createWhatsAppCloudClient({
    phoneNumberId: config.phone_number_id,
    accessToken: decrypt(config.access_token),
    wabaId: config.business_account_id,
  })
}

function toSendResult(result: SendMessageResult): SendResult {
  return { success: true, message_id: result.messages?.[0]?.id }
}

function toErrorResult(err: unknown): SendResult {
  if (err instanceof WhatsAppCloudError) {
    return {
      success: false,
      error: { code: String(err.code || err.status || "unknown"), message: err.message },
    }
  }
  return {
    success: false,
    error: {
      code: "network_error",
      message: err instanceof Error ? err.message : "Network error",
    },
  }
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

  const client = buildClient(config)

  try {
    switch (msg.type) {
      case "text":
        return toSendResult(
          await client.sendText(msg.to, msg.text?.body ?? "", msg.text?.preview_url ?? false),
        )
      case "template":
        return toSendResult(
          await client.sendTemplate(
            msg.to,
            msg.template?.name ?? "",
            msg.template?.language?.code ?? "pt_BR",
            msg.template?.components,
          ),
        )
      case "image":
        return toSendResult(
          await client.sendImage(msg.to, { link: msg.image?.link }, msg.image?.caption),
        )
      case "document":
        return toSendResult(
          await client.sendDocument(
            msg.to,
            { link: msg.document?.link, filename: msg.document?.filename },
            msg.document?.caption,
          ),
        )
      default:
        return { success: false, error: { code: "unsupported_type", message: `Unsupported type: ${msg.type}` } }
    }
  } catch (err) {
    log.error("send failed", { code: (err as WhatsAppCloudError)?.code, message: (err as Error)?.message })
    return toErrorResult(err)
  }
}

/**
 * Marca mensagem como lida (read receipt de volta pro cliente).
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
    await buildClient(config).markAsRead(externalMessageId)
    return { success: true }
  } catch (err) {
    return toErrorResult(err)
  }
}
