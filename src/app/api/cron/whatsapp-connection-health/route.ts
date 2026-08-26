/**
 * Vercel Cron — health check da conexão das instâncias Evolution.
 *
 * Schedule: *&#47;5 * * * * (a cada 5 minutos)
 *
 * O webhook connection.update é a fonte primária de estado, mas não
 * cobre tudo: instância zumbi (config diz "open" mas a API falha),
 * Evolution fora do ar, ou webhook perdido. Este cron consulta o
 * estado LIVE de cada canal evolution ativo e:
 *  - open  → corrige drift no config + limpa alertas do sino
 *  - close/connecting → persiste estado + alerta o sino (dedup: 1
 *    alerta aberto por canal — crm-channel-alert.service)
 *  - erro na consulta → alerta "Evolution inacessível"
 *
 * Referência: docs/crm/channel-health-alerts.md
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { createEvolutionClient } from "@/lib/whatsapp/evolution-api"
import { getEvolutionRuntimeConfig } from "@/lib/whatsapp/evolution-settings"
import {
  clearChannelAlerts,
  notifyChannelDisconnected,
} from "@/lib/services/crm-channel-alert.service"

const log = logger.child("CronWhatsAppConnectionHealth")

export const dynamic = "force-dynamic"
export const maxDuration = 120

type ChannelRow = {
  id: string
  name: string | null
  external_id: string
  config: Record<string, unknown> | null
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()

    const cfg = await getEvolutionRuntimeConfig(admin)
    if (!cfg) {
      // Evolution não configurada — nada a monitorar.
      return NextResponse.json({ success: true, skipped: "evolution not configured" })
    }

    const { data: channels, error } = await admin
      .from("crm_channels")
      .select("id, name, external_id, config")
      .eq("type", "whatsapp")
      .eq("provider", "evolution")
      .eq("is_active", true)
    if (error) throw error

    let healthy = 0
    let unhealthy = 0
    let unreachable = 0
    // Nome + estado de cada canal com problema — o warn agregado só com
    // contadores ({unhealthy:1}) não dizia QUAL canal reconectar.
    const problems: string[] = []

    for (const channel of (channels as ChannelRow[] | null) ?? []) {
      const client = createEvolutionClient({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: channel.external_id,
      })
      const config = (channel.config ?? {}) as Record<string, unknown>
      const knownState = typeof config.connection_state === "string" ? config.connection_state : "unknown"

      let live: string
      try {
        live = await client.connectionState()
      } catch (err) {
        unreachable++
        const detail = err instanceof Error ? err.message : String(err)
        problems.push(`${channel.name || channel.external_id} (inacessível)`)
        log.warn("connectionState falhou no health check", { channelId: channel.id, channelName: channel.name, detail })
        await notifyChannelDisconnected(admin, { channelId: channel.id, kind: "unreachable", detail })
        continue
      }

      if (live === "open") {
        healthy++
        if (knownState !== "open") {
          await admin
            .from("crm_channels")
            .update({
              config: {
                ...config,
                connection_state: "open",
                connected_at: new Date().toISOString(),
                needs_reconnect_at: null,
              },
            })
            .eq("id", channel.id)
        }
        await clearChannelAlerts(admin, channel.id)
        continue
      }

      // close / connecting / unknown — instância não operante
      unhealthy++
      if (live !== knownState && live !== "unknown") {
        await admin
          .from("crm_channels")
          .update({
            config: {
              ...config,
              connection_state: live,
              ...(live === "close" ? { disconnected_at: new Date().toISOString() } : {}),
            },
          })
          .eq("id", channel.id)
      }
      const kind = live === "connecting" ? "connecting" : live === "close" ? "close" : "unreachable"
      await notifyChannelDisconnected(admin, {
        channelId: channel.id,
        kind,
        detail: live === "unknown" ? "estado desconhecido" : null,
      })
      problems.push(`${channel.name || channel.external_id} (${live})`)
      log.warn("instância não operante no health check", { channelId: channel.id, channelName: channel.name, state: live })
    }

    if (unhealthy > 0 || unreachable > 0) {
      log.warn("health check com problemas", { healthy, unhealthy, unreachable, channels: problems })
    }

    return NextResponse.json({ success: true, healthy, unhealthy, unreachable })
  } catch (error) {
    log.error("health check cron falhou", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
