/**
 * Instagram Graph API client (Meta) — Direct Messages + Comments.
 *
 * Docs:
 *   - DMs: https://developers.facebook.com/docs/messenger-platform/instagram/get-started
 *   - Comments: https://developers.facebook.com/docs/instagram-api/guides/comment-moderation
 *
 * Versao: v20.0 (LTS).
 *
 * Cada channel armazena `instagram_business_account_id` em external_id
 * e `access_token` (page-scoped) em config. O mesmo token cobre DMs e
 * Comments.
 */

import { logger } from "@/lib/logger"

const log = logger.child("InstagramGraph")

const API_VERSION = "v20.0"
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`

export interface InstagramChannelConfig {
  /** IG Business Account ID (a.k.a IG User ID, usado pra enviar DMs). */
  instagram_business_account_id: string
  /** Page Access Token com escopos instagram_manage_messages + comments. */
  access_token: string
}

export interface InstagramDirectMessage {
  /** IG-scoped recipient ID (vem do webhook em entry.messaging[].sender.id). */
  to: string
  type: "text" | "image"
  text?: { body: string }
  image?: { url: string }
}

export interface SendResult {
  success: boolean
  message_id?: string
  error?: { code: string; message: string }
}

// ─── Direct Messages ─────────────────────────────────────────────

/**
 * Envia DM de Instagram via Messenger Platform endpoint.
 * Endpoint: POST /{ig-user-id}/messages
 *
 * NOTE: Janela de 24h padrao apos ultima mensagem do contato. Mensagens
 * fora dessa janela exigem human_agent tag (nao implementado aqui).
 */
export async function sendInstagramMessage(
  config: InstagramChannelConfig,
  msg: InstagramDirectMessage,
): Promise<SendResult> {
  if (!config.access_token || !config.instagram_business_account_id) {
    return {
      success: false,
      error: {
        code: "config_missing",
        message: "Channel config missing access_token or instagram_business_account_id",
      },
    }
  }

  const url = `${BASE_URL}/${config.instagram_business_account_id}/messages`
  const body: Record<string, unknown> = {
    recipient: { id: msg.to },
  }

  if (msg.type === "text" && msg.text) {
    body.message = { text: msg.text.body }
  } else if (msg.type === "image" && msg.image) {
    body.message = {
      attachment: {
        type: "image",
        payload: { url: msg.image.url, is_reusable: true },
      },
    }
  } else {
    return {
      success: false,
      error: { code: "invalid_payload", message: "Tipo de mensagem nao suportado" },
    }
  }

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
      log.error("[Instagram] DM send failed", {
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

    return {
      success: true,
      message_id: data.message_id || data.recipient_id,
    }
  } catch (err) {
    log.error("[Instagram] DM network error", err)
    return {
      success: false,
      error: {
        code: "network_error",
        message: err instanceof Error ? err.message : "Network error",
      },
    }
  }
}

// ─── Comments ────────────────────────────────────────────────────

/**
 * Responde a um comentario no Instagram.
 * Endpoint: POST /{comment-id}/replies
 */
export async function replyToInstagramComment(
  config: InstagramChannelConfig,
  commentId: string,
  message: string,
): Promise<SendResult> {
  if (!config.access_token) {
    return {
      success: false,
      error: { code: "config_missing", message: "Channel config missing access_token" },
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/${commentId}/replies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok || data.error) {
      log.error("[Instagram] comment reply failed", {
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

    return { success: true, message_id: data.id }
  } catch (err) {
    log.error("[Instagram] comment reply network error", err)
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
 * Esconde/exibe um comentario.
 * Endpoint: POST /{comment-id}?hide=true|false
 */
export async function setInstagramCommentHidden(
  config: InstagramChannelConfig,
  commentId: string,
  hide: boolean,
): Promise<SendResult> {
  if (!config.access_token) {
    return {
      success: false,
      error: { code: "config_missing", message: "Channel config missing access_token" },
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/${commentId}?hide=${hide}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
      },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return {
        success: false,
        error: {
          code: res.status.toString(),
          message: data.error?.message || "Failed to update comment",
        },
      }
    }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: {
        code: "network_error",
        message: err instanceof Error ? err.message : "Error",
      },
    }
  }
}
