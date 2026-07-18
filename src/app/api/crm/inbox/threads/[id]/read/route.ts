/**
 * POST /api/crm/inbox/threads/[id]/read
 *
 * Zera o unread_count e, em canal WhatsApp, envia read receipt de
 * volta pra Meta (✓✓ azul no cliente) — best-effort: falha na Meta
 * nunca falha a rota.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { loadChannelClient } from "@/lib/whatsapp/channel-client"
import { phoneToJid } from "@/lib/whatsapp/evolution-content"
import { clearCrmThreadNotifications } from "@/lib/services/crm-inbox-notification.service"

const log = logger.child("CrmInboxRead")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    type ThreadRow = {
      id: string
      channel_id: string
      contact_external_id: string
      channel: { type: string } | Array<{ type: string }> | null
    }
    const { data: thread } = await admin
      .from("crm_threads")
      .select("id, channel_id, contact_external_id, channel:crm_channels (type)")
      .eq("id", id)
      .maybeSingle<ThreadRow>()

    await admin.from("crm_threads").update({ unread_count: 0 }).eq("id", id)

    // Conversa vista — some do sino para TODOS os destinatários
    // (clear global, consistente com unread_count). Best-effort.
    await clearCrmThreadNotifications(admin, id)

    // Read receipt best-effort (só WhatsApp — cloud OU evolution)
    const channelType = Array.isArray(thread?.channel) ? thread?.channel[0]?.type : thread?.channel?.type
    if (thread && channelType === "whatsapp") {
      try {
        const { data: lastInbound } = await admin
          .from("crm_messages")
          .select("external_id, metadata")
          .eq("thread_id", id)
          .eq("direction", "inbound")
          .not("external_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastInbound?.external_id) {
          const loaded = await loadChannelClient(admin, { channelId: thread.channel_id })
          if (loaded?.provider === "evolution") {
            const rawKey = (lastInbound.metadata as { evolution_key?: { remoteJid?: string } } | null)
              ?.evolution_key
            await loaded.client.markAsRead([
              {
                id: lastInbound.external_id,
                remoteJid: rawKey?.remoteJid ?? phoneToJid(thread.contact_external_id),
                fromMe: false,
              },
            ])
          } else if (loaded?.provider === "whatsapp_cloud") {
            await loaded.cloud.client.markAsRead(lastInbound.external_id)
          }
        }
      } catch (err) {
        log.warn("markAsRead no provider falhou (best-effort)", {
          threadId: id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "crm-inbox-read")
  }
}
