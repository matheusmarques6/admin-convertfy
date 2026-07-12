/**
 * GET /api/crm/channels/[id]/evolution/state
 *
 * Estado LIVE da conexão da instância (polling do modal de QR, 3s).
 * Persiste no config do canal quando mudou — o webhook connection.update
 * é a fonte primária, isto cobre eventos perdidos.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { loadChannelClient } from "@/lib/whatsapp/channel-client"

const log = logger.child("CrmChannelEvolutionState")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const live = await loaded.client.connectionState()

    if (live !== "unknown" && live !== loaded.connectionState) {
      const config: Record<string, unknown> = {
        ...(loaded.channel.config ?? {}),
        connection_state: live,
      }
      if (live === "open") {
        config.connected_at = new Date().toISOString()
        config.needs_reconnect_at = null
      }
      await admin.from("crm_channels").update({ config }).eq("id", channelId)
    }

    const config = (loaded.channel.config ?? {}) as Record<string, unknown>
    return successResponse(request, {
      state: live === "unknown" ? loaded.connectionState : live,
      owner_jid: typeof config.owner_jid === "string" ? config.owner_jid : null,
      needs_reconnect: Boolean(config.needs_reconnect_at) && live !== "open",
    })
  } catch (error) {
    log.error("state error:", error)
    return errorResponse(request, error, "crm-channel-evolution-state")
  }
}
