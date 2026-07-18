/**
 * Dispatch de provider dos canais WhatsApp (crm_channels.type='whatsapp').
 *
 * Dois providers coexistem:
 *  - 'whatsapp_cloud' — Meta Cloud API oficial (janela 24h, templates)
 *  - 'evolution'      — Evolution API/Baileys não-oficial (free-form
 *    sempre, sem templates; external_id = instance_name)
 *
 * Regra central: janela de 24h e crm_whatsapp_templates são EXCLUSIVOS
 * de whatsapp_cloud — callers usam o discriminante `provider` da union.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { loadWhatsAppChannel, type LoadedWhatsAppChannel, type WhatsAppChannelRow } from "./channel-config"
import { createEvolutionClient, type EvolutionAPI } from "./evolution-api"
import { getEvolutionRuntimeConfig } from "./evolution-settings"
import { notifyChannelDisconnected } from "@/lib/services/crm-channel-alert.service"

const log = logger.child("WhatsAppChannelClient")

export type LoadedChannelClient =
  | { provider: "whatsapp_cloud"; channel: WhatsAppChannelRow; cloud: LoadedWhatsAppChannel }
  | {
      provider: "evolution"
      channel: WhatsAppChannelRow
      client: EvolutionAPI
      instanceName: string
      /** Último estado conhecido (config.connection_state) — sem round-trip. */
      connectionState: string
    }

export function isEvolutionChannel(c: { provider?: string | null }): boolean {
  return c.provider === "evolution"
}

const CHANNEL_COLUMNS = "id, org_id, store_id, type, provider, display_name, external_id, config, is_active"

/**
 * Carrega o canal WhatsApp ativo (por id, external_id ou org) e monta o
 * client do provider correspondente. Retorna null se o canal não
 * existir, estiver sem credenciais ou (evolution) sem env configurado.
 */
export async function loadChannelClient(
  admin: SupabaseClient,
  by: { channelId?: string; externalId?: string; orgId?: string },
): Promise<LoadedChannelClient | null> {
  let query = admin.from("crm_channels").select(CHANNEL_COLUMNS).eq("type", "whatsapp").eq("is_active", true)

  if (by.channelId) query = query.eq("id", by.channelId)
  else if (by.externalId) query = query.eq("external_id", by.externalId)
  else if (by.orgId) query = query.eq("org_id", by.orgId)
  else return null

  const { data, error } = await query.limit(1).maybeSingle()
  if (error || !data) {
    if (error) log.error("channel lookup failed", error)
    return null
  }

  const channel = data as WhatsAppChannelRow

  if (channel.provider === "evolution") {
    const cfg = await getEvolutionRuntimeConfig(admin)
    if (!cfg) {
      log.warn("Evolution não configurada (env ou Configurações) — canal evolution indisponível", {
        channelId: channel.id,
      })
      return null
    }
    const config = (channel.config ?? {}) as Record<string, unknown>
    return {
      provider: "evolution",
      channel,
      instanceName: channel.external_id,
      connectionState: typeof config.connection_state === "string" ? config.connection_state : "unknown",
      client: createEvolutionClient({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: channel.external_id,
      }),
    }
  }

  const cloud = await loadWhatsAppChannel(admin, { channelId: channel.id })
  if (!cloud) return null
  return { provider: "whatsapp_cloud", channel, cloud }
}

/**
 * Marca o canal evolution como desconectado (envio recusado com
 * "not connected") — análogo ao markChannelAuthError do cloud. A UI de
 * Canais mostra o badge vermelho; reconectar = novo QR.
 */
export async function markEvolutionDisconnected(
  admin: SupabaseClient,
  channel: { id: string; config: Record<string, unknown> | null },
): Promise<void> {
  const now = new Date().toISOString()
  const config = {
    ...(channel.config ?? {}),
    connection_state: "close",
    disconnected_at: now,
    needs_reconnect_at: now,
  }
  const { error } = await admin.from("crm_channels").update({ config }).eq("id", channel.id)
  if (error) log.error("falha ao marcar canal evolution desconectado", { channelId: channel.id, message: error.message })

  // Envio recusado por desconexão é sinal definitivo (aconteceu em uso
  // real) — alerta o sino imediatamente. Best-effort, nunca lança.
  await notifyChannelDisconnected(admin, { channelId: channel.id, kind: "send_refused" })
}
