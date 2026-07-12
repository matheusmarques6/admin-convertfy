/**
 * Helpers puros da integração Evolution API (v2 / Baileys, não-oficial).
 *
 * Tudo aqui é função pura e testável: parsing do envelope de webhook,
 * normalização de JID ↔ telefone, mapeamento de status Baileys → nosso
 * ordinal (message-content.ts) e extração de conteúdo de mensagem no
 * shape de crm_messages.
 *
 * Regras v1:
 *  - Só DM (@s.whatsapp.net) entra no inbox — grupos (@g.us), @lid e
 *    broadcast/status são skip silencioso
 *  - reactionMessage e tipos desconhecidos → null (skip)
 *  - PENDING não vira status nosso (a mensagem local já nasce queued)
 */

export interface EvolutionEnvelope {
  event: string
  instance: string
  data: Record<string, unknown>
}

/** "MESSAGES_UPSERT" (configurado) → "messages.upsert" (recebido). */
export function normalizeEvolutionEvent(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, ".")
}

export function parseEvolutionEnvelope(payload: unknown): EvolutionEnvelope | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  const event = typeof p.event === "string" ? p.event : null
  const instance = typeof p.instance === "string" ? p.instance : null
  const data = p.data && typeof p.data === "object" && !Array.isArray(p.data) ? (p.data as Record<string, unknown>) : null
  if (!event || !instance || !data) return null
  return { event: normalizeEvolutionEvent(event), instance, data }
}

// ─── JID ↔ telefone ───────────────────────────────────────────────

const DM_SUFFIX = "@s.whatsapp.net"

/**
 * "5531999999999:12@s.whatsapp.net" → "5531999999999".
 * Retorna null para JIDs que não são DM (grupo, @lid, broadcast).
 */
export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid || typeof jid !== "string") return null
  if (!jid.endsWith(DM_SUFFIX)) return null
  const local = jid.slice(0, -DM_SUFFIX.length).split(":")[0]
  const digits = local.replace(/\D/g, "")
  return digits.length >= 8 ? digits : null
}

export function phoneToJid(phone: string): string {
  return `${phone.replace(/\D/g, "")}${DM_SUFFIX}`
}

/** v1: só DM entra no inbox. Grupos/@lid/broadcast/status → skip. */
export function shouldSkipRemoteJid(jid: string | null | undefined): boolean {
  if (!jid || typeof jid !== "string") return true
  if (jid.endsWith("@g.us")) return true
  if (jid.endsWith("@lid")) return true
  if (jid.includes("@broadcast")) return true
  return !jid.endsWith(DM_SUFFIX)
}

// ─── Status Baileys → nosso ordinal ───────────────────────────────

/**
 * Mapeia o status do Baileys pro vocabulário de crm_messages. PENDING
 * retorna null (não aplica — a mensagem local já nasce queued); o
 * resultado ainda passa pelo shouldApplyStatus (guard anti-retrocesso).
 */
export function mapEvolutionStatus(
  status: string | null | undefined,
): "sent" | "delivered" | "read" | "failed" | null {
  switch ((status ?? "").toUpperCase()) {
    case "SERVER_ACK":
      return "sent"
    case "DELIVERY_ACK":
      return "delivered"
    case "READ":
    case "PLAYED":
      return "read"
    case "ERROR":
      return "failed"
    default:
      return null
  }
}

// ─── Conteúdo de mensagem (messages.upsert) ───────────────────────

export interface EvolutionInboundContent {
  /** Mesmo vocabulário do CHECK de crm_messages.content_type. */
  contentType: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contact"
  body: string | null
  /** Base64 entregue no webhook (setWebhook com base64: true). */
  mediaBase64: string | null
  mediaMime: string | null
  mediaFilename: string | null
  externalId: string
  remoteJid: string
  fromMe: boolean
  pushName: string | null
  /** Epoch em segundos (messageTimestamp) ou null. */
  timestamp: number | null
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/**
 * Extrai o conteúdo de um `data` de messages.upsert. Retorna null para
 * payloads malformados e tipos fora do escopo v1 (reação, enquete,
 * botão interativo etc.) — o caller conta como skipped.
 */
export function buildEvolutionMessageContent(data: Record<string, unknown>): EvolutionInboundContent | null {
  const key = obj(data.key)
  const externalId = str(key?.id)
  const remoteJid = str(key?.remoteJid)
  if (!externalId || !remoteJid) return null

  const fromMe = key?.fromMe === true
  const pushName = str(data.pushName)
  const tsRaw = Number(data.messageTimestamp)
  const timestamp = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : null
  const message = obj(data.message)
  if (!message) return null

  // Mídia em base64 chega em message.base64 (webhook base64:true).
  const mediaBase64 = str(message.base64)

  const base = { externalId, remoteJid, fromMe, pushName, timestamp }
  const noMedia = { mediaBase64: null, mediaMime: null, mediaFilename: null }

  const conversation = str(message.conversation)
  if (conversation) return { contentType: "text", body: conversation, ...noMedia, ...base }

  const extended = obj(message.extendedTextMessage)
  const extendedText = str(extended?.text)
  if (extendedText) return { contentType: "text", body: extendedText, ...noMedia, ...base }

  const image = obj(message.imageMessage)
  if (image) {
    return {
      contentType: "image",
      body: str(image.caption),
      mediaBase64,
      mediaMime: str(image.mimetype) ?? "image/jpeg",
      mediaFilename: null,
      ...base,
    }
  }

  const video = obj(message.videoMessage)
  if (video) {
    return {
      contentType: "video",
      body: str(video.caption),
      mediaBase64,
      mediaMime: str(video.mimetype) ?? "video/mp4",
      mediaFilename: null,
      ...base,
    }
  }

  const audio = obj(message.audioMessage)
  if (audio) {
    return {
      contentType: "audio",
      body: null,
      mediaBase64,
      mediaMime: str(audio.mimetype) ?? "audio/ogg",
      mediaFilename: null,
      ...base,
    }
  }

  const document = obj(message.documentMessage)
  if (document) {
    const filename = str(document.fileName)
    return {
      contentType: "document",
      body: str(document.caption) ?? filename,
      mediaBase64,
      mediaMime: str(document.mimetype) ?? "application/octet-stream",
      mediaFilename: filename,
      ...base,
    }
  }

  const sticker = obj(message.stickerMessage)
  if (sticker) {
    return {
      contentType: "sticker",
      body: null,
      mediaBase64,
      mediaMime: str(sticker.mimetype) ?? "image/webp",
      mediaFilename: null,
      ...base,
    }
  }

  const location = obj(message.locationMessage)
  if (location) {
    const lat = Number(location.degreesLatitude)
    const lng = Number(location.degreesLongitude)
    const label = str(location.name) ?? str(location.address)
    const coords = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : null
    if (!coords && !label) return null
    return {
      contentType: "location",
      body: [coords, label].filter(Boolean).join(" · "),
      ...noMedia,
      ...base,
    }
  }

  const contact = obj(message.contactMessage)
  if (contact) {
    return {
      contentType: "contact",
      body: str(contact.displayName) ?? "[contato]",
      ...noMedia,
      ...base,
    }
  }

  // reactionMessage, pollCreationMessage, protocolMessage etc. → skip v1
  return null
}

// ─── messages.update ──────────────────────────────────────────────

export interface EvolutionStatusUpdate {
  externalId: string
  remoteJid: string | null
  status: string
}

/**
 * Extrai o update de status. Builds variam: `data.keyId` vs
 * `data.key.id`; `data.status` vs `data.update.status`.
 */
export function extractStatusUpdate(data: Record<string, unknown>): EvolutionStatusUpdate | null {
  const key = obj(data.key)
  const externalId = str(data.keyId) ?? str(key?.id)
  const update = obj(data.update)
  const status = str(data.status) ?? str(update?.status)
  if (!externalId || !status) return null
  return {
    externalId,
    remoteJid: str(data.remoteJid) ?? str(key?.remoteJid),
    status,
  }
}

// ─── connection.update ────────────────────────────────────────────

export interface EvolutionConnectionUpdate {
  state: "open" | "connecting" | "close"
  /** Telefone conectado (wuid "5531...:1@s.whatsapp.net") ou null. */
  ownerPhone: string | null
  statusCode: number | null
}

export function extractConnectionUpdate(data: Record<string, unknown>): EvolutionConnectionUpdate | null {
  const state = str(data.state)
  if (state !== "open" && state !== "connecting" && state !== "close") return null
  const codeRaw = Number(data.statusReason ?? data.statusCode)
  return {
    state,
    ownerPhone: jidToPhone(str(data.wuid)),
    statusCode: Number.isFinite(codeRaw) ? codeRaw : null,
  }
}

// ─── Webhook secret / nome de instância ───────────────────────────

/**
 * Compara o secret do path com o esperado sem short-circuit por
 * conteúdo (XOR byte a byte). Length mismatch retorna cedo — o tamanho
 * do secret não é segredo.
 */
export function isValidWebhookSecret(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!received || !expected) return false
  if (received.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= received.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

const INSTANCE_RAND_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

/**
 * Nome de instância determinístico no prefixo (org) + sufixo aleatório
 * (permite recriar instância pra mesma org sem colisão na Evolution).
 */
export function buildInstanceName(orgId: string): string {
  const org8 = orgId.replace(/-/g, "").slice(0, 8).toLowerCase() || "org"
  let rand = ""
  for (let i = 0; i < 6; i++) {
    rand += INSTANCE_RAND_CHARS[Math.floor(Math.random() * INSTANCE_RAND_CHARS.length)]
  }
  return `cvfy_${org8}_${rand}`
}
