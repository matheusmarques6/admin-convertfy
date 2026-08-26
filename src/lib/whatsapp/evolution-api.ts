/**
 * Evolution API (v2 / Baileys) — client HTTP server-only.
 *
 * A Evolution roda em OUTRO servidor (self-hosted); esta app só consome
 * REST (header `apikey`) e recebe webhooks. Um servidor global por env:
 * EVOLUTION_API_URL + EVOLUTION_API_KEY + EVOLUTION_WEBHOOK_SECRET.
 *
 * - Todo request passa por withRetry (só 5xx/429/rede — 4xx nunca)
 * - Shapes variam entre builds da v2: os parsers puros exportados
 *   (parseCreateInstanceResponse etc.) normalizam as variações
 * - Anti-ban: jitter de 0,8–2,5s antes de cada send + `delay` de
 *   "digitando" no sendText (o throttle por canal fica nas rotas)
 */

import { logger } from "@/lib/logger"
import { sleep, withRetry } from "./backoff"

const log = logger.child("EvolutionAPI")

// A leitura de env/banco vive em evolution-settings.ts
// (getEvolutionRuntimeConfig) — este módulo é só o client HTTP.

// ─── Erro tipado ──────────────────────────────────────────────────

export class EvolutionAPIError extends Error {
  status?: number
  responseBody?: unknown

  constructor(message: string, status?: number, responseBody?: unknown) {
    super(message)
    this.name = "EvolutionAPIError"
    this.status = status
    this.responseBody = responseBody
  }

  /** 401/403 — apikey global inválida ou sem permissão. */
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** Instância existe mas não está conectada (envio recusado). */
  isNotConnected(): boolean {
    if (this.status !== 400) return false
    const text = `${this.message} ${JSON.stringify(this.responseBody ?? "")}`.toLowerCase()
    return text.includes("not connected") || text.includes("connection closed") || text.includes("instance is closed")
  }

  isInstanceNotFound(): boolean {
    return this.status === 404
  }
}

/**
 * Prova real de uma API key global contra o servidor Evolution:
 * GET /instance/fetchInstances com o header apikey, SEM retry.
 * 2xx → { ok: true }; 401/403 → { ok: false } (key inválida);
 * qualquer outra resposta/erro de rede → EvolutionAPIError
 * ("Evolution inacessível" — o caller mapeia pra 502).
 */
export async function verifyEvolutionApiKey(baseUrl: string, apiKey: string): Promise<{ ok: boolean }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/instance/fetchInstances`
  let response: Response
  try {
    response = await fetch(url, {
      headers: { apikey: apiKey },
      cache: "no-store",
    })
  } catch (error) {
    throw new EvolutionAPIError(
      `Evolution inacessível: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (response.ok) return { ok: true }
  if (response.status === 401 || response.status === 403) return { ok: false }
  throw new EvolutionAPIError(`Evolution inacessível (${response.status})`, response.status)
}

// ─── Parsers puros (variações de build da v2) ─────────────────────

export interface CreateInstanceResult {
  instanceName: string
  /** Token por instância — `hash` string (v2 atual) ou `hash.apikey` (antigas). */
  instanceApikey: string | null
  qrBase64: string | null
  pairingCode: string | null
}

export function parseCreateInstanceResponse(json: unknown, instanceName: string): CreateInstanceResult {
  const j = (json ?? {}) as Record<string, unknown>
  const hash = j.hash
  let instanceApikey: string | null = null
  if (typeof hash === "string" && hash) instanceApikey = hash
  else if (hash && typeof hash === "object") {
    const apikey = (hash as Record<string, unknown>).apikey
    if (typeof apikey === "string" && apikey) instanceApikey = apikey
  }
  const qr = (j.qrcode ?? {}) as Record<string, unknown>
  return {
    instanceName,
    instanceApikey,
    qrBase64: typeof qr.base64 === "string" && qr.base64 ? qr.base64 : null,
    pairingCode: typeof qr.pairingCode === "string" && qr.pairingCode ? qr.pairingCode : null,
  }
}

export type EvolutionConnectionState = "open" | "connecting" | "close" | "unknown"

/** Resposta pode ser `{ instance: { state } }` ou `{ state }` flat. */
export function parseConnectionState(json: unknown): EvolutionConnectionState {
  const j = (json ?? {}) as Record<string, unknown>
  const nested = (j.instance ?? {}) as Record<string, unknown>
  const state = typeof nested.state === "string" ? nested.state : typeof j.state === "string" ? j.state : null
  if (state === "open" || state === "connecting" || state === "close") return state
  return "unknown"
}

export interface ConnectResult {
  qrBase64: string | null
  pairingCode: string | null
}

/** QR pode vir em `base64`, `qrcode.base64` ou `code` (raro). */
export function parseConnectResponse(json: unknown): ConnectResult {
  const j = (json ?? {}) as Record<string, unknown>
  const qr = (j.qrcode ?? {}) as Record<string, unknown>
  const base64 =
    (typeof j.base64 === "string" && j.base64) || (typeof qr.base64 === "string" && qr.base64) || null
  const pairingCode =
    (typeof j.pairingCode === "string" && j.pairingCode) ||
    (typeof qr.pairingCode === "string" && qr.pairingCode) ||
    null
  return { qrBase64: base64 || null, pairingCode: pairingCode || null }
}

export interface EvolutionSendResult {
  externalId: string
  remoteJid: string | null
}

/** `{ key: { id, remoteJid } }` no topo (padrão) ou aninhado. */
export function parseSendResponse(json: unknown): EvolutionSendResult | null {
  const j = (json ?? {}) as Record<string, unknown>
  const key = (j.key ?? (j.message as Record<string, unknown> | undefined)?.key ?? {}) as Record<string, unknown>
  const id = typeof key.id === "string" && key.id ? key.id : null
  if (!id) return null
  return {
    externalId: id,
    remoteJid: typeof key.remoteJid === "string" && key.remoteJid ? key.remoteJid : null,
  }
}

/** Jitter anti-ban aplicado antes de cada envio (0,8–2,5s default). */
export function sendJitterMs(min = 800, max = 2500): number {
  return Math.round(min + Math.random() * (max - min))
}

// ─── Client ───────────────────────────────────────────────────────

export interface EvolutionConfig {
  baseUrl: string
  apiKey: string
  instanceName: string
}

const WEBHOOK_EVENTS_DEFAULT = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"]

export class EvolutionAPI {
  private config: EvolutionConfig

  constructor(config: EvolutionConfig) {
    this.config = config
  }

  get instanceName(): string {
    return this.config.instanceName
  }

  private async request<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const { json, headers, ...rest } = init
    const url = `${this.config.baseUrl}${path}`

    const doFetch = async (): Promise<T> => {
      const response = await fetch(url, {
        ...rest,
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.apiKey,
          ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
        cache: "no-store",
      })

      const text = await response.text().catch(() => "")
      let body: unknown = null
      if (text) {
        try {
          body = JSON.parse(text)
        } catch {
          body = text
        }
      }

      if (!response.ok) {
        const message =
          (body && typeof body === "object" && typeof (body as Record<string, unknown>).message === "string"
            ? ((body as Record<string, unknown>).message as string)
            : null) ?? `Evolution ${response.status} em ${path}`
        throw new EvolutionAPIError(message, response.status, body)
      }

      return (body ?? {}) as T
    }

    return withRetry<T>(doFetch, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 15_000,
      jitter: "decorrelated",
      shouldRetry: (error, attempt) => {
        if (error instanceof EvolutionAPIError) {
          if (error.status === 429) return true
          if (error.status !== undefined && error.status >= 500 && error.status < 600) return true
          return false // 4xx é permanente (auth, not connected, validação)
        }
        // Erro de rede (fetch failed etc.)
        return attempt < 3
      },
      onRetry: (error, attempt, delay) => {
        const err = error as EvolutionAPIError
        log.warn("retry", { path, attempt, delay_ms: delay, status: err?.status })
      },
    })
  }

  // ── Instância ──────────────────────────────────────────────────

  /**
   * `syncFullHistory` amplia o histórico que o WhatsApp entrega NO
   * PAREAMENTO — é o único momento em que ele manda conversas antigas,
   * e não se repete. Default false: só liga quando o operador pede a
   * importação, porque um sync pesado logo após conectar é justamente
   * o padrão de tráfego que a detecção do WhatsApp observa.
   * Ver docs/crm/whatsapp-history-sync-riscos.md.
   */
  async createInstance(opts?: { syncFullHistory?: boolean }): Promise<CreateInstanceResult> {
    const json = await this.request("/instance/create", {
      method: "POST",
      json: {
        instanceName: this.config.instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        syncFullHistory: opts?.syncFullHistory === true,
      },
    })
    return parseCreateInstanceResponse(json, this.config.instanceName)
  }

  async connect(): Promise<ConnectResult> {
    const json = await this.request(`/instance/connect/${this.config.instanceName}`)
    return parseConnectResponse(json)
  }

  async connectionState(): Promise<EvolutionConnectionState> {
    const json = await this.request(`/instance/connectionState/${this.config.instanceName}`)
    return parseConnectionState(json)
  }

  async logout(): Promise<void> {
    await this.request(`/instance/logout/${this.config.instanceName}`, { method: "DELETE" })
  }

  /**
   * Derruba e recria o socket Baileys usando as credenciais salvas —
   * SEM novo QR. É o remédio para instância zumbi (banco diz "open",
   * socket morto). Builds v2 usam POST; algumas antigas exigem PUT —
   * fallback em 404/405.
   */
  async restart(): Promise<void> {
    try {
      await this.request(`/instance/restart/${this.config.instanceName}`, { method: "POST" })
    } catch (err) {
      const status = err instanceof EvolutionAPIError ? err.status : undefined
      if (status === 404 || status === 405) {
        log.warn("restart POST rejeitado — tentando PUT", { status })
        await this.request(`/instance/restart/${this.config.instanceName}`, { method: "PUT" })
        return
      }
      throw err
    }
  }

  async deleteInstance(): Promise<void> {
    await this.request(`/instance/delete/${this.config.instanceName}`, { method: "DELETE" })
  }

  /**
   * Configura o webhook por instância. Builds recentes exigem o
   * envelope { webhook: {...} }; intermediárias aceitam só o flat —
   * em 400/422 do envelope, re-tenta no formato flat.
   */
  async setWebhook(url: string, events: string[] = WEBHOOK_EVENTS_DEFAULT): Promise<void> {
    const enveloped = {
      webhook: { enabled: true, url, byEvents: false, base64: true, events },
    }
    try {
      await this.request(`/webhook/set/${this.config.instanceName}`, { method: "POST", json: enveloped })
      return
    } catch (error) {
      const err = error as EvolutionAPIError
      if (!(error instanceof EvolutionAPIError) || (err.status !== 400 && err.status !== 422)) throw error
      log.warn("setWebhook envelope rejeitado — tentando formato flat", { status: err.status })
    }
    await this.request(`/webhook/set/${this.config.instanceName}`, {
      method: "POST",
      json: { enabled: true, url, webhook_by_events: false, webhook_base64: true, events },
    })
  }

  /**
   * Foto de perfil de um contato (WhatsApp via QR). Retorna null quando o
   * contato não tem foto ou a privacidade dele esconde — não é erro.
   */
  async fetchProfilePictureUrl(number: string): Promise<string | null> {
    const parse = (json: { profilePictureUrl?: string | null; profilePicUrl?: string | null } | null) => {
      const url = json?.profilePictureUrl ?? json?.profilePicUrl ?? null
      return typeof url === "string" && url.startsWith("http") ? url : null
    }
    try {
      const json = await this.request<{ profilePictureUrl?: string | null; profilePicUrl?: string | null }>(
        `/chat/fetchProfilePictureUrl/${this.config.instanceName}`,
        { method: "POST", json: { number } },
      )
      return parse(json)
    } catch (err) {
      // Builds v1 expõem o endpoint com o nome curto.
      if (err instanceof EvolutionAPIError && err.status === 404) {
        const json = await this.request<{ profilePictureUrl?: string | null; profilePicUrl?: string | null }>(
          `/chat/fetchProfilePicUrl/${this.config.instanceName}`,
          { method: "POST", json: { number } },
        )
        return parse(json)
      }
      throw err
    }
  }

  // ── Mensagens ──────────────────────────────────────────────────

  async sendText(to: string, text: string, typingDelayMs = 1200): Promise<EvolutionSendResult> {
    await sleep(sendJitterMs())
    const json = await this.request(`/message/sendText/${this.config.instanceName}`, {
      method: "POST",
      json: { number: to, text, ...(typingDelayMs > 0 ? { delay: typingDelayMs } : {}) },
    })
    return this.requireSendResult(json, "sendText")
  }

  async sendMedia(
    to: string,
    args: {
      mediatype: "image" | "video" | "document"
      /** URL pública OU base64 puro (sem prefixo data:). */
      media: string
      mimetype?: string
      caption?: string
      fileName?: string
    },
  ): Promise<EvolutionSendResult> {
    await sleep(sendJitterMs())
    const json = await this.request(`/message/sendMedia/${this.config.instanceName}`, {
      method: "POST",
      json: { number: to, ...args },
    })
    return this.requireSendResult(json, "sendMedia")
  }

  /**
   * Nota de voz (PTT). `audio` aceita URL pública OU base64 puro.
   * encoding:true transcoda no servidor da Evolution (exige ffmpeg lá).
   */
  async sendAudio(to: string, audio: string): Promise<EvolutionSendResult> {
    await sleep(sendJitterMs())
    const json = await this.request(`/message/sendWhatsAppAudio/${this.config.instanceName}`, {
      method: "POST",
      json: { number: to, audio, encoding: true },
    })
    return this.requireSendResult(json, "sendAudio")
  }

  private requireSendResult(json: unknown, op: string): EvolutionSendResult {
    const parsed = parseSendResponse(json)
    if (!parsed) {
      throw new EvolutionAPIError(`${op}: resposta sem key.id`, undefined, json)
    }
    return parsed
  }

  // ── Chat / utilitários ─────────────────────────────────────────

  async markAsRead(keys: Array<{ id: string; remoteJid: string; fromMe: boolean }>): Promise<void> {
    await this.request(`/chat/markMessageAsRead/${this.config.instanceName}`, {
      method: "POST",
      json: { readMessages: keys },
    })
  }

  async checkNumbers(numbers: string[]): Promise<Array<{ number: string; exists: boolean; jid: string | null }>> {
    const json = await this.request<unknown>(`/chat/whatsappNumbers/${this.config.instanceName}`, {
      method: "POST",
      json: { numbers },
    })
    if (!Array.isArray(json)) return []
    return json.map((item) => {
      const it = (item ?? {}) as Record<string, unknown>
      return {
        number: typeof it.number === "string" ? it.number : "",
        exists: it.exists === true,
        jid: typeof it.jid === "string" ? it.jid : null,
      }
    })
  }

  /** Fallback de mídia inbound quando o webhook não entrega base64. */
  async getBase64FromMediaMessage(messageKey: { id: string }): Promise<{ base64: string; mimetype: string | null } | null> {
    try {
      const json = await this.request<Record<string, unknown>>(
        `/chat/getBase64FromMediaMessage/${this.config.instanceName}`,
        { method: "POST", json: { message: { key: { id: messageKey.id } }, convertToMp4: false } },
      )
      const base64 = typeof json.base64 === "string" && json.base64 ? json.base64 : null
      if (!base64) return null
      return { base64, mimetype: typeof json.mimetype === "string" ? json.mimetype : null }
    } catch (error) {
      log.warn("getBase64FromMediaMessage falhou", {
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  // ── Histórico (leitura do banco da Evolution) ──────────────────
  // Exige DATABASE_SAVE_DATA_HISTORIC/CHATS na Evolution. Nada aqui
  // fala com o WhatsApp: é HTTP entre nossos servidores, então pode
  // ser paginado no ritmo que quisermos.
  //
  // O envelope de resposta mudou entre versões (array cru, {records},
  // {chats|messages:{records}}) — os dois métodos aceitam as três
  // formas em vez de assumir a da versão instalada.

  /** JIDs das conversas conhecidas pela instância. */
  async findChats(): Promise<string[]> {
    const json = await this.request<unknown>(`/chat/findChats/${this.config.instanceName}`, {
      method: "POST",
      json: {},
    })

    const rows = unwrapRecords(json, "chats")
    const jids: string[] = []
    for (const row of rows) {
      const r = (row ?? {}) as Record<string, unknown>
      // v2 usa `remoteJid`; builds antigas expõem o jid direto em `id`.
      const jid =
        (typeof r.remoteJid === "string" && r.remoteJid) ||
        (typeof r.id === "string" && r.id.includes("@") ? r.id : null)
      if (jid) jids.push(jid)
    }
    return Array.from(new Set(jids))
  }

  /**
   * Página de mensagens de uma conversa. `page` é 1-based e `pageSize`
   * vai no campo `offset` — que na Evolution v2 é o TAMANHO da página,
   * não o deslocamento.
   */
  async findMessages(args: {
    remoteJid: string
    page?: number
    pageSize?: number
  }): Promise<{ records: Record<string, unknown>[]; total: number | null; pages: number | null }> {
    const json = await this.request<unknown>(`/chat/findMessages/${this.config.instanceName}`, {
      method: "POST",
      json: {
        where: { key: { remoteJid: args.remoteJid } },
        page: args.page ?? 1,
        offset: args.pageSize ?? 100,
      },
    })

    const envelope = pickEnvelope(json, "messages")
    return {
      records: unwrapRecords(json, "messages"),
      total: numOrNull(envelope?.total),
      pages: numOrNull(envelope?.pages),
    }
  }
}

function numOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** `{key: {...}}` quando a resposta é envelopada; null caso contrário. */
export function pickEnvelope(json: unknown, key: string): Record<string, unknown> | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null
  const inner = (json as Record<string, unknown>)[key]
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>
  }
  return null
}

/** Aceita array cru, `{records}` ou `{<key>: {records}}`. */
export function unwrapRecords(json: unknown, key: string): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[]
  if (!json || typeof json !== "object") return []

  const root = json as Record<string, unknown>
  const envelope = pickEnvelope(json, key)
  const candidates = [envelope?.records, root.records, root[key]]

  for (const c of candidates) {
    if (Array.isArray(c)) return c as Record<string, unknown>[]
  }
  return []
}

export function createEvolutionClient(config: EvolutionConfig): EvolutionAPI {
  return new EvolutionAPI(config)
}
