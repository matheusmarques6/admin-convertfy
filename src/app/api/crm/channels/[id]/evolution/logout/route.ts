/**
 * POST   /api/crm/channels/[id]/evolution/logout — desconecta o número
 *        (permite reconectar com outro QR/número depois).
 * DELETE /api/crm/channels/[id]/evolution/logout — remove a instância
 *        no servidor Evolution e desativa o canal.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { loadChannelClient, type LoadedChannelClient } from "@/lib/whatsapp/channel-client"

const log = logger.child("CrmChannelEvolutionLogout")

export const dynamic = "force-dynamic"

async function loadOwnEvolutionChannel(
  channelId: string,
): Promise<{ admin: ReturnType<typeof createAdminClient>; loaded: Extract<LoadedChannelClient, { provider: "evolution" }> }> {
  const sb = await createClient()
  const user = await requireAuth(sb)
  const admin = createAdminClient()
  const orgId = await resolveOrgId(user.id)

  const loaded = await loadChannelClient(admin, { channelId })
  if (!loaded || loaded.provider !== "evolution" || loaded.channel.org_id !== orgId) {
    throw new AppError("Canal evolution não encontrado", 404, "not-found")
  }
  return { admin, loaded }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const { admin, loaded } = await loadOwnEvolutionChannel(channelId)

    await loaded.client.logout().catch((err) => {
      log.warn("logout na Evolution falhou (seguindo)", { channelId, message: (err as Error)?.message })
    })

    const config = {
      ...(loaded.channel.config ?? {}),
      connection_state: "close",
      disconnected_at: new Date().toISOString(),
      needs_reconnect_at: new Date().toISOString(),
      owner_jid: null,
    }
    await admin.from("crm_channels").update({ config }).eq("id", channelId)

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("logout error:", error)
    return errorResponse(request, error, "crm-channel-evolution-logout")
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const { admin, loaded } = await loadOwnEvolutionChannel(channelId)

    await loaded.client.logout().catch(() => {})
    await loaded.client.deleteInstance().catch((err) => {
      log.warn("delete na Evolution falhou (seguindo)", { channelId, message: (err as Error)?.message })
    })

    const config = {
      ...(loaded.channel.config ?? {}),
      connection_state: "close",
      disconnected_at: new Date().toISOString(),
    }
    await admin.from("crm_channels").update({ config, is_active: false }).eq("id", channelId)

    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("delete error:", error)
    return errorResponse(request, error, "crm-channel-evolution-delete")
  }
}
