/**
 * Funções puras de conteúdo de mensagem WhatsApp (portadas do worder):
 * - buildMessageContent: payload cru do webhook → shape de crm_messages
 * - shouldApplyStatus: guard de retrograde pra webhooks fora de ordem
 */

import type { WebhookMessage } from "./cloud-api"

export interface InboundContent {
  /** content_type de crm_messages (CHECK constraint da tabela). */
  contentType:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "contact"
    | "interactive"
    | "system"
  body: string | null
  /** media_id da Meta (opaco, expira ~30d) — download é do caller. */
  mediaId: string | null
  mediaMime: string | null
  mediaFilename: string | null
}

export function buildMessageContent(message: WebhookMessage): InboundContent {
  const none = { mediaId: null, mediaMime: null, mediaFilename: null }

  switch (message.type) {
    case "text":
      return { contentType: "text", body: message.text?.body ?? "", ...none }

    case "image":
      return {
        contentType: "image",
        body: message.image?.caption ?? null,
        mediaId: message.image?.id ?? null,
        mediaMime: message.image?.mime_type ?? null,
        mediaFilename: null,
      }

    case "audio":
      return {
        contentType: "audio",
        body: null,
        mediaId: message.audio?.id ?? null,
        mediaMime: message.audio?.mime_type ?? null,
        mediaFilename: null,
      }

    case "video":
      return {
        contentType: "video",
        body: message.video?.caption ?? null,
        mediaId: message.video?.id ?? null,
        mediaMime: message.video?.mime_type ?? null,
        mediaFilename: null,
      }

    case "document":
      return {
        contentType: "document",
        body: message.document?.caption ?? message.document?.filename ?? null,
        mediaId: message.document?.id ?? null,
        mediaMime: message.document?.mime_type ?? null,
        mediaFilename: message.document?.filename ?? null,
      }

    case "sticker":
      return {
        contentType: "sticker",
        body: null,
        mediaId: message.sticker?.id ?? null,
        mediaMime: message.sticker?.mime_type ?? null,
        mediaFilename: null,
      }

    case "location": {
      const loc = message.location
      const label = loc?.name || loc?.address
      return {
        contentType: "location",
        body: loc ? `${loc.latitude},${loc.longitude}${label ? ` · ${label}` : ""}` : null,
        ...none,
      }
    }

    case "interactive": {
      const reply = message.interactive?.button_reply ?? message.interactive?.list_reply
      return { contentType: "interactive", body: reply?.title ?? "[interactive]", ...none }
    }

    case "button":
      return { contentType: "interactive", body: message.button?.text ?? "[button]", ...none }

    case "reaction":
      return {
        contentType: "system",
        body: message.reaction?.emoji
          ? `Reagiu com ${message.reaction.emoji}`
          : "Removeu a reação",
        ...none,
      }

    case "contacts": {
      const names = (message.contacts ?? [])
        .map((c) => c.name?.formatted_name)
        .filter(Boolean)
        .join(", ")
      return { contentType: "contact", body: names || "[contato]", ...none }
    }

    default:
      return { contentType: "text", body: `[${message.type}]`, ...none }
  }
}

/**
 * Ordinal de status: webhooks da Meta chegam fora de ordem (read antes
 * de delivered é comum). Só aplica status que avança; failed é terminal
 * e sempre vence.
 */
const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
}

export function shouldApplyStatus(current: string | null | undefined, incoming: string): boolean {
  const inc = STATUS_ORDER[incoming]
  if (inc === undefined) return false
  const cur = STATUS_ORDER[current ?? ""] ?? -1
  return inc > cur
}
