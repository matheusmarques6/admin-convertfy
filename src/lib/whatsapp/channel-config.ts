/**
 * Carrega canais WhatsApp de crm_channels e monta o client da Cloud API.
 *
 * O config JSONB do canal guarda { access_token, phone_number_id,
 * business_account_id }. O access_token é cifrado via @/lib/crypto
 * (enc:v1:...); decrypt tem passthrough de plaintext, então canais
 * antigos continuam funcionando e são migrados no próximo save.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { decrypt, encrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { createWhatsAppCloudClient, type WhatsAppCloudAPI, type WhatsAppCloudError } from "./cloud-api"

const log = logger.child("WhatsAppChannelConfig")

export interface WhatsAppChannelRow {
  id: string
  org_id: string
  store_id: string | null
  type: string
  provider: string
  display_name: string | null
  external_id: string
  config: Record<string, unknown>
  is_active: boolean
}

export interface LoadedWhatsAppChannel {
  channel: WhatsAppChannelRow
  client: WhatsAppCloudAPI
  accessToken: string
  phoneNumberId: string
  wabaId: string | null
}

const CHANNEL_COLUMNS = "id, org_id, store_id, type, provider, display_name, external_id, config, is_active"

/**
 * Carrega um canal WhatsApp ativo por id, phone_number_id (external_id)
 * ou org (primeiro canal ativo da org). Retorna null se não existir ou
 * o config estiver incompleto.
 */
export async function loadWhatsAppChannel(
  admin: SupabaseClient,
  by: { channelId?: string; phoneNumberId?: string; orgId?: string },
): Promise<LoadedWhatsAppChannel | null> {
  let query = admin
    .from("crm_channels")
    .select(CHANNEL_COLUMNS)
    .eq("type", "whatsapp")
    .eq("is_active", true)

  if (by.channelId) query = query.eq("id", by.channelId)
  else if (by.phoneNumberId) query = query.eq("external_id", by.phoneNumberId)
  else if (by.orgId) query = query.eq("org_id", by.orgId)
  else return null

  const { data, error } = await query.limit(1).maybeSingle()
  if (error || !data) {
    if (error) log.error("channel lookup failed", error)
    return null
  }

  const channel = data as WhatsAppChannelRow
  const config = (channel.config ?? {}) as Record<string, string>
  const phoneNumberId = config.phone_number_id || channel.external_id
  const rawToken = config.access_token

  if (!rawToken || !phoneNumberId) {
    log.warn("channel config missing access_token or phone_number_id", { channelId: channel.id })
    return null
  }

  const accessToken = decrypt(rawToken)
  const wabaId = config.business_account_id || null

  return {
    channel,
    accessToken,
    phoneNumberId,
    wabaId,
    client: createWhatsAppCloudClient({
      phoneNumberId,
      accessToken,
      wabaId: wabaId ?? undefined,
    }),
  }
}

/**
 * Re-grava o config do canal com o access_token cifrado (migração lazy
 * de tokens em plaintext). Preserva as demais chaves do config.
 */
export async function saveChannelConfig(
  admin: SupabaseClient,
  channelId: string,
  config: Record<string, unknown>,
): Promise<void> {
  const next = { ...config }
  if (typeof next.access_token === "string" && next.access_token) {
    next.access_token = encrypt(next.access_token)
  }
  const { error } = await admin.from("crm_channels").update({ config: next }).eq("id", channelId)
  if (error) throw error
}

/**
 * Marca erro de auth no config do canal (token expirado/revogado na Meta).
 * Não desativa o canal sozinho — quem decide é o operador; o timestamp
 * fica visível pra UI de canais sinalizar.
 */
export async function markChannelAuthError(
  admin: SupabaseClient,
  channel: WhatsAppChannelRow,
  err: WhatsAppCloudError,
): Promise<void> {
  log.error("channel auth error", { channelId: channel.id, code: err.code, message: err.message })
  const config = {
    ...(channel.config ?? {}),
    auth_error_at: new Date().toISOString(),
    auth_error_code: err.code,
    auth_error_message: err.message,
  }
  const { error } = await admin.from("crm_channels").update({ config }).eq("id", channel.id)
  if (error) log.error("failed to persist auth error", error)
}
