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
import { loadWhatsAppChannel } from "@/lib/whatsapp/channel-config"

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

    const { data: thread } = await admin
      .from("crm_threads")
      .select("id, channel_id, channel:crm_channels (type)")
      .eq("id", id)
      .maybeSingle<{ id: string; channel_id: string; channel: { type: string } | Array<{ type: string }> | null }>()

    await admin.from("crm_threads").update({ unread_count: 0 }).eq("id", id)

    // Read receipt best-effort (só WhatsApp)
    const channelType = Array.isArray(thread?.channel) ? thread?.channel[0]?.type : thread?.channel?.type
    if (thread && channelType === "whatsapp") {
      try {
        const { data: lastInbound } = await admin
          .from("crm_messages")
          .select("external_id")
          .eq("thread_id", id)
          .eq("direction", "inbound")
          .not("external_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastInbound?.external_id) {
          const loaded = await loadWhatsAppChannel(admin, { channelId: thread.channel_id })
          if (loaded) {
            await loaded.client.markAsRead(lastInbound.external_id)
          }
        }
      } catch (err) {
        log.warn("markAsRead na Meta falhou (best-effort)", {
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
