/**
 * Envio de texto WhatsApp provider-aware pros fluxos fora do inbox
 * (onboarding, automação do CRM, acompanhamento).
 *
 * Esses fluxos buscam a row do canal (crm_channels) e mandavam direto
 * pelo adapter da Cloud API; com a Evolution como segundo provider, o
 * dispatch acontece aqui: evolution → client novo (free-form sempre,
 * sem janela de 24h), senão → sendWhatsAppMessage (Cloud API) intocado.
 */

import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/server"
import { createEvolutionClient, EvolutionAPIError } from "@/lib/whatsapp/evolution-api"
import { getEvolutionRuntimeConfig } from "@/lib/whatsapp/evolution-settings"
import { sendWhatsAppMessage, type SendResult } from "./whatsapp-cloud.service"

const log = logger.child("WhatsAppChannelSend")

export interface ChannelForSend {
  provider?: string | null
  external_id?: string | null
  config?: Record<string, unknown> | null
}

export async function sendTextViaChannel(
  channel: ChannelForSend,
  to: string,
  body: string,
): Promise<SendResult> {
  if (channel.provider === "evolution") {
    const admin = createAdminClient()
    const cfg = await getEvolutionRuntimeConfig(admin)
    if (!cfg) {
      return {
        success: false,
        error: { code: "config_missing", message: "Evolution não configurada no servidor (env ou Configurações)" },
      }
    }
    const instanceName = channel.external_id
    if (!instanceName) {
      return { success: false, error: { code: "config_missing", message: "Canal evolution sem instance_name" } }
    }
    try {
      const client = createEvolutionClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, instanceName })
      const sent = await client.sendText(to, body)
      return { success: true, message_id: sent.externalId }
    } catch (err) {
      const code =
        err instanceof EvolutionAPIError
          ? err.isNotConnected() || err.isInstanceNotFound()
            ? "INSTANCE_DISCONNECTED"
            : String(err.status ?? "evolution_error")
          : "network_error"
      log.error("envio evolution falhou", { instanceName, code, message: (err as Error)?.message })
      return {
        success: false,
        error: { code, message: err instanceof Error ? err.message : "Network error" },
      }
    }
  }

  const config = (channel.config ?? {}) as {
    phone_number_id?: string
    access_token?: string
    business_account_id?: string
  }
  if (!config.phone_number_id || !config.access_token) {
    return {
      success: false,
      error: { code: "config_missing", message: "Channel config missing access_token or phone_number_id" },
    }
  }

  return sendWhatsAppMessage(
    {
      phone_number_id: config.phone_number_id,
      access_token: config.access_token,
      business_account_id: config.business_account_id,
    },
    { to, type: "text", text: { body } },
  )
}
