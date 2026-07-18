/**
 * POST /api/crm/channels/[id]/evolution/restart
 *
 * Reinicia a instância na Evolution (derruba e recria o socket Baileys
 * com as credenciais salvas — SEM novo QR). É o remédio para instância
 * zumbi: o painel/banco diz "conectado" mas o socket está morto (envios
 * dão 500, mensagens não chegam). Após o restart, faz polling curto do
 * estado live e persiste no config do canal.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { loadChannelClient } from "@/lib/whatsapp/channel-client"
import { clearChannelAlerts } from "@/lib/services/crm-channel-alert.service"

const log = logger.child("CrmChannelEvolutionRestart")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const POLL_ATTEMPTS = 5
const POLL_INTERVAL_MS = 2000

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const loaded = await loadChannelClient(admin, { channelId })
    if (!loaded || loaded.provider !== "evolution" || loaded.channel.org_id !== orgId) {
      throw new AppError("Canal evolution não encontrado", 404, "not-found")
    }

    await loaded.client.restart()
    log.info("restart disparado", { channelId, instance: loaded.instanceName })

    // Polling curto: o socket leva alguns segundos para reabrir.
    let state = "connecting"
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      try {
        state = await loaded.client.connectionState()
      } catch {
        state = "unknown"
      }
      if (state === "open") break
    }

    const config: Record<string, unknown> = {
      ...(loaded.channel.config ?? {}),
      ...(state !== "unknown" ? { connection_state: state } : {}),
    }
    if (state === "open") {
      config.connected_at = new Date().toISOString()
      config.needs_reconnect_at = null
    }
    await admin.from("crm_channels").update({ config }).eq("id", channelId)

    if (state === "open") {
      await clearChannelAlerts(admin, channelId)
    }

    log.info("restart concluído", { channelId, state })
    return successResponse(request, {
      state,
      // open = voltou sem QR; close/connecting = sessão pode estar
      // corrompida → próximo passo é logout + QR novo
      recovered: state === "open",
    })
  } catch (error) {
    log.error("restart error:", error)
    return errorResponse(request, error, "crm-channel-evolution-restart")
  }
}
