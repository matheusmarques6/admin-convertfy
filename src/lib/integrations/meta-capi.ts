import { fetchWithRetry } from "@/lib/utils/retry"
import { logger } from "@/lib/logger"
import { hashEmail, hashName, hashPhone } from "@/lib/tracking/hash-pii"

const log = logger.child("MetaCAPI")

/** Versao da Graph API usada para a Conversions API. */
export const META_CAPI_VERSION = "v20.0"
const GRAPH_API_URL = `https://graph.facebook.com/${META_CAPI_VERSION}`

/**
 * Cliente da Meta Conversions API (server-side events).
 *
 * Envia eventos de conversao (ex. "Lead") direto pro servidor do Meta,
 * com PII hasheada (SHA-256) + sinais de matching (fbc/fbp/IP/UA). O
 * `event_id` deduplica com o pixel do browser (fbq eventID).
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

/** Dados brutos do lead — hasheados por `buildMetaUserData`. */
export interface RawUserData {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  /** IP do cliente (nao hasheado). */
  clientIpAddress?: string | null
  /** User-Agent do cliente (nao hasheado). */
  clientUserAgent?: string | null
  /** Cookie _fbc (ou derivado de fbclid). Nao hasheado. */
  fbc?: string | null
  /** Cookie _fbp. Nao hasheado. */
  fbp?: string | null
}

/** user_data no formato do Meta (campos de PII ja hasheados). */
export interface MetaUserData {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  client_ip_address?: string
  client_user_agent?: string
  fbc?: string
  fbp?: string
}

/** Evento server-side (item de `data[]`). */
export interface MetaServerEvent {
  event_name: string
  event_time: number
  event_id?: string
  event_source_url?: string
  action_source: "website"
  user_data: MetaUserData
  custom_data?: Record<string, unknown>
}

export interface SendMetaEventParams {
  pixelId: string
  accessToken: string
  testEventCode?: string | null
  event: MetaServerEvent
}

export interface SendMetaEventResult {
  ok: boolean
  status: number
  /** Resposta (ou erro) do Meta pra logar em crm_conversion_events.response. */
  body: Record<string, unknown>
}

/**
 * Monta o `user_data` do Meta a partir dos dados brutos do lead,
 * hasheando email/telefone/nome e omitindo campos vazios. Maximiza os
 * sinais de matching (IP, UA, fbc, fbp) para melhorar a atribuicao.
 */
export function buildMetaUserData(raw: RawUserData): MetaUserData {
  const userData: MetaUserData = {}

  const em = hashEmail(raw.email)
  if (em) userData.em = [em]

  const ph = hashPhone(raw.phone)
  if (ph) userData.ph = [ph]

  const fn = hashName(raw.firstName)
  if (fn) userData.fn = [fn]

  const ln = hashName(raw.lastName)
  if (ln) userData.ln = [ln]

  if (raw.clientIpAddress) userData.client_ip_address = raw.clientIpAddress
  if (raw.clientUserAgent) userData.client_user_agent = raw.clientUserAgent
  if (raw.fbc) userData.fbc = raw.fbc
  if (raw.fbp) userData.fbp = raw.fbp

  return userData
}

/**
 * Monta um evento server-side pronto pra enfileirar/enviar. `eventTime`
 * em segundos unix (default: agora). `customData` pode carregar value/
 * currency + parametros extras do lead (faturamento, company, UTMs).
 */
export function buildMetaServerEvent(params: {
  eventName: string
  eventId?: string
  eventSourceUrl?: string | null
  eventTime?: number
  userData: MetaUserData
  customData?: Record<string, unknown>
}): MetaServerEvent {
  const event: MetaServerEvent = {
    event_name: params.eventName,
    event_time: params.eventTime ?? Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: params.userData,
  }
  if (params.eventId) event.event_id = params.eventId
  if (params.eventSourceUrl) event.event_source_url = params.eventSourceUrl
  if (params.customData && Object.keys(params.customData).length > 0) {
    event.custom_data = params.customData
  }
  return event
}

/**
 * Envia um evento pra Meta Conversions API. Nunca lanca — retorna
 * `{ ok, status, body }` pra o chamador persistir o resultado.
 */
export async function sendMetaConversionEvent(
  params: SendMetaEventParams,
): Promise<SendMetaEventResult> {
  const { pixelId, accessToken, testEventCode, event } = params

  const url = `${GRAPH_API_URL}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`

  const payload: Record<string, unknown> = { data: [event] }
  if (testEventCode) payload.test_event_code = testEventCode

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { maxRetries: 2 },
    )

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (!response.ok) {
      log.warn("Meta CAPI event rejeitado", {
        pixelId,
        status: response.status,
        event_name: event.event_name,
        error: body?.error,
      })
    }

    return { ok: response.ok, status: response.status, body }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error("Meta CAPI request falhou", { pixelId, event_name: event.event_name, message })
    return { ok: false, status: 0, body: { error: message } }
  }
}
