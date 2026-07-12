/**
 * POST /api/crm/channels/[id]/evolution/connect
 *
 * Gera/renova o QR de conexão da instância Evolution do canal. Se a
 * instância já está open, retorna direto sem QR (nada a escanear).
 * A UI (modal de QR) chama isto ao abrir e re-chama ~40s (QR expira).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { loadChannelClient } from "@/lib/whatsapp/channel-client"

const log = logger.child("CrmChannelEvolutionConnect")

export const dynamic = "force-dynamic"

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

    const state = await loaded.client.connectionState()
    if (state === "open") {
      return successResponse(request, { state: "open", qr_base64: null, pairing_code: null })
    }

    const connect = await loaded.client.connect()
    log.info("connect", { channelId, state, hasQr: Boolean(connect.qrBase64) })
    return successResponse(request, {
      state,
      qr_base64: connect.qrBase64,
      pairing_code: connect.pairingCode,
    })
  } catch (error) {
    log.error("connect error:", error)
    return errorResponse(request, error, "crm-channel-evolution-connect")
  }
}
