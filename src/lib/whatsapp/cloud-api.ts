/**
 * WhatsApp Cloud API (Meta, oficial) — client completo, portado do worder.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * - Todo request passa por withRetry (backoff decorrelated, honra Retry-After)
 * - WhatsAppCloudError expõe a taxonomia de códigos da Meta (janela 24h,
 *   template pausado, auth inválida, rate limit) pros callers decidirem
 * - verifyWebhookSignature: HMAC SHA-256 timing-safe sobre o RAW body
 */

import { parsePhoneNumber, type CountryCode } from "libphonenumber-js"
import { logger } from "@/lib/logger"
import { withRetry } from "./backoff"

const log = logger.child("WhatsAppCloudAPI")

export const META_API_VERSION = "v22.0"
export const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

// ─── Tipos ────────────────────────────────────────────────────────

export interface WhatsAppCloudConfig {
  phoneNumberId: string
  accessToken: string
  wabaId?: string
}

export interface SendMessageResult {
  messaging_product: string
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string }>
}

export interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components: unknown[]
}

/** Mensagem inbound como chega no payload do webhook da Meta. */
export interface WebhookMessage {
  from: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string; caption?: string }
  video?: { id: string; mime_type: string; sha256: string; caption?: string }
  audio?: { id: string; mime_type: string; sha256: string }
  document?: { id: string; filename?: string; mime_type: string; sha256: string; caption?: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string }> }>
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string }
  }
  button?: { text: string; payload: string }
  sticker?: { id: string; mime_type: string; sha256: string }
  reaction?: { message_id: string; emoji: string }
}

// ─── Client ───────────────────────────────────────────────────────

export class WhatsAppCloudAPI {
  private config: WhatsAppCloudConfig

  constructor(config: WhatsAppCloudConfig) {
    this.config = config
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${META_BASE_URL}${endpoint}`

    const doFetch = async (): Promise<T> => {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        const err = new WhatsAppCloudError(
          data.error || { message: "Request failed", code: response.status },
        )
        err.status = response.status
        // Meta envia Retry-After em segundos (ou data HTTP); o
        // getDelayOverride do withRetry honra esse valor.
        const retryAfterRaw = response.headers.get("Retry-After")
        if (retryAfterRaw) {
          const seconds = Number(retryAfterRaw)
          if (Number.isFinite(seconds) && seconds > 0) {
            err.retryAfterMs = Math.round(seconds * 1000)
          } else {
            const ts = Date.parse(retryAfterRaw)
            if (Number.isFinite(ts)) {
              err.retryAfterMs = Math.max(0, ts - Date.now())
            }
          }
        }
        throw err
      }

      return data
    }

    return withRetry<T>(doFetch, {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30_000,
      jitter: "decorrelated",
      shouldRetry: (error, attempt) => {
        if (error instanceof WhatsAppCloudError) {
          // Erros permanentes da Meta — não retry
          if (error.isAuthError()) return false
          if (error.code === 100) return false
          if (error.isRateLimited() || error.isFrequencyCapped() || error.isSpamRateLimited()) {
            return true
          }
          if (error.status !== undefined && error.status >= 500 && error.status < 600) return true
          return false
        }
        // Erros de rede (fetch failed etc.)
        return attempt < 5
      },
      getDelayOverride: (error) => {
        const ms = (error as WhatsAppCloudError)?.retryAfterMs
        return typeof ms === "number" && ms > 0 ? ms : undefined
      },
      onRetry: (error, attempt, delay) => {
        const err = error as WhatsAppCloudError
        log.warn("retry", {
          attempt,
          delay_ms: delay,
          code: err?.code,
          status: err?.status,
        })
      },
    })
  }

  // ── Envio ──────────────────────────────────────────────────────

  async sendText(to: string, text: string, previewUrl = false): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "text",
        text: { preview_url: previewUrl, body: text },
      }),
    })
  }

  async sendImage(
    to: string,
    image: { link?: string; id?: string },
    caption?: string,
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "image",
        image: { ...image, caption },
      }),
    })
  }

  async sendVideo(
    to: string,
    video: { link?: string; id?: string },
    caption?: string,
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "video",
        video: { ...video, caption },
      }),
    })
  }

  async sendAudio(to: string, audio: { link?: string; id?: string }): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "audio",
        audio,
      }),
    })
  }

  async sendDocument(
    to: string,
    document: { link?: string; id?: string; filename?: string },
    caption?: string,
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "document",
        document: { ...document, caption },
      }),
    })
  }

  async sendSticker(to: string, sticker: { link?: string; id?: string }): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "sticker",
        sticker,
      }),
    })
  }

  async sendLocation(
    to: string,
    location: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "location",
        location,
      }),
    })
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode = "pt_BR",
    components?: unknown[],
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components || [],
        },
      }),
    })
  }

  async sendReaction(to: string, messageId: string, emoji: string): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "reaction",
        reaction: { message_id: messageId, emoji },
      }),
    })
  }

  // ── Status ─────────────────────────────────────────────────────

  /** Read receipt de volta pro cliente (✓✓ azul no WhatsApp dele). */
  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    })
  }

  // ── Templates ──────────────────────────────────────────────────

  async listTemplates(wabaId?: string): Promise<MetaTemplate[]> {
    const id = wabaId || this.config.wabaId
    if (!id) throw new Error("WABA ID required")

    interface TemplateListResponse {
      data: MetaTemplate[]
      paging?: { cursors?: { after?: string }; next?: string }
    }

    const allTemplates: MetaTemplate[] = []
    let nextUrl: string | null = `/${id}/message_templates?limit=250`
    let pages = 0
    const maxPages = 20

    while (nextUrl && pages < maxPages) {
      const page: TemplateListResponse = await this.request<TemplateListResponse>(nextUrl)
      allTemplates.push(...(page.data || []))
      nextUrl = page.paging?.next || null
      pages++
    }

    return allTemplates
  }

  async getTemplateById(templateId: string): Promise<MetaTemplate> {
    return this.request(`/${templateId}?fields=id,name,language,status,category,components`)
  }

  // ── Mídia ──────────────────────────────────────────────────────

  async uploadMedia(fileData: ArrayBuffer, mimeType: string, filename?: string): Promise<{ id: string }> {
    // O /media da Meta espera `type` = categoria ("image" | "video" |
    // "audio" | "document" | "sticker"), não o MIME completo — MIME
    // completo retorna code 100.
    const category = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : mimeType.startsWith("audio/")
          ? "audio"
          : "document"

    const formData = new FormData()
    formData.append("file", new Blob([fileData], { type: mimeType }), filename || "file")
    formData.append("messaging_product", "whatsapp")
    formData.append("type", category)

    const response = await fetch(`${META_BASE_URL}/${this.config.phoneNumberId}/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: formData,
    })

    const data = await response.json()
    if (!response.ok || data.error) {
      throw new WhatsAppCloudError(data.error || { message: "Media upload failed", code: response.status })
    }
    return data
  }

  async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size: number }> {
    return this.request(`/${mediaId}`)
  }

  /** Baixa a mídia da Meta (URL é opaca e expira em ~5min — baixar já). */
  async downloadMedia(mediaId: string): Promise<{ data: Uint8Array; mimeType: string; fileSize: number }> {
    const mediaInfo = await this.getMediaUrl(mediaId)

    const response = await fetch(mediaInfo.url, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    })
    if (!response.ok) {
      throw new WhatsAppCloudError({ message: `Media download failed (${response.status})`, code: response.status })
    }

    const buffer = await response.arrayBuffer()
    return {
      data: new Uint8Array(buffer),
      mimeType: mediaInfo.mime_type,
      fileSize: mediaInfo.file_size,
    }
  }
}

// ─── Erro customizado (taxonomia Meta) ────────────────────────────

export class WhatsAppCloudError extends Error {
  code: number
  type: string
  fbtrace_id: string
  error_subcode?: number
  error_data?: unknown
  status?: number
  retryAfterMs?: number

  constructor(error: { message?: string; code?: number; type?: string; fbtrace_id?: string; error_subcode?: number; error_data?: unknown }) {
    super(error.message || "WhatsApp Cloud API Error")
    this.name = "WhatsAppCloudError"
    this.code = error.code || 0
    this.type = error.type || "OAuthException"
    this.fbtrace_id = error.fbtrace_id || ""
    this.error_subcode = error.error_subcode
    this.error_data = error.error_data
  }

  isRateLimited(): boolean {
    return this.code === 4 || this.code === 80007
  }

  isFrequencyCapped(): boolean {
    return this.code === 131049
  }

  isSpamRateLimited(): boolean {
    return this.code === 131048
  }

  /** 131047: mensagem free-form fora da janela de 24h. */
  isWindowExpired(): boolean {
    return this.code === 131047
  }

  isInvalidRecipient(): boolean {
    return this.code === 131026
  }

  isTemplateNotApproved(): boolean {
    return this.code === 132012
  }

  isTemplatePaused(): boolean {
    return this.code === 132015
  }

  isTemplateDisabled(): boolean {
    return this.code === 132016
  }

  /** 190/102/200: token inválido/expirado ou permissão revogada. */
  isAuthError(): boolean {
    return [190, 102, 200].includes(this.code)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

export function normalizePhone(phone: string, country = "BR"): string {
  try {
    const parsed = parsePhoneNumber(phone, country as CountryCode)
    return parsed?.number?.replace("+", "") || phone.replace(/\D/g, "")
  } catch {
    return phone.replace(/\D/g, "")
  }
}

/** Extrai texto legível do payload cru do webhook da Meta. */
export function extractWebhookMessageText(message: WebhookMessage): string {
  if (message.text) return message.text.body
  if (message.image?.caption) return message.image.caption
  if (message.video?.caption) return message.video.caption
  if (message.document?.caption) return message.document.caption
  if (message.interactive?.button_reply) return message.interactive.button_reply.title
  if (message.interactive?.list_reply) return message.interactive.list_reply.title
  if (message.button) return message.button.text
  return ""
}

/**
 * Verifica o X-Hub-Signature-256 da Meta contra o RAW body.
 *
 * - timingSafeEqual em buffers de tamanho igual (sem side channel)
 * - short-circuit em length mismatch ANTES do compare (hex de sha256 tem
 *   largura fixa de 64 chars — o tamanho em si não vaza nada)
 * - aceita 'sha256=<hex>' e '<hex>' puro
 *
 * IMPORTANTE: passar o body CRU da request — a Meta assina os bytes
 * exatos; re-serializar o JSON quebra o HMAC.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | null | undefined,
  appSecret: string,
): Promise<boolean> {
  if (!signature || !appSecret) return false

  const nodeCrypto = await import("crypto")
  const expected = nodeCrypto.createHmac("sha256", appSecret).update(payload, "utf8").digest("hex")

  const received = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature

  if (expected.length !== received.length) return false

  return nodeCrypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"))
}

export function createWhatsAppCloudClient(config: WhatsAppCloudConfig): WhatsAppCloudAPI {
  return new WhatsAppCloudAPI(config)
}
