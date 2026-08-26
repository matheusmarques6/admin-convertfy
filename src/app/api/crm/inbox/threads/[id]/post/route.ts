/**
 * GET /api/crm/inbox/threads/[id]/post — dados do POST de uma thread de
 * comentários do Instagram (legenda, permalink, thumb, curtidas,
 * nº de comentários) via Graph API, com o token do canal da thread.
 *
 * O media_id vem do próprio contact_external_id ("comment:{media_id}").
 * `unavailable: true` quando a Graph não devolve (post apagado, token
 * sem permissão) — a UI degrada pro card genérico, sem inventar dado.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { assertThreadInOrg } from "@/lib/crm/inbox-thread-guard"
import {
  getInstagramMediaInfo,
  type InstagramChannelConfig,
} from "@/lib/services/instagram-graph.service"
import { logger } from "@/lib/logger"

const log = logger.child("CrmInboxThreadPost")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: thread, error } = await admin
      .from("crm_threads")
      .select("id, org_id, contact_external_id, channel_id")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    if (!thread) throw new AppError("Conversa não encontrada", 404, "not-found")
    assertThreadInOrg(thread.org_id as string, orgId)

    if (!thread.contact_external_id?.startsWith("comment:")) {
      throw new AppError("Esta conversa não é uma thread de comentários", 400, "not-a-comment-thread")
    }
    const mediaId = thread.contact_external_id.slice("comment:".length)

    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, external_id, config")
      .eq("id", thread.channel_id)
      .maybeSingle()
    if (!channel) throw new AppError("Canal da conversa não encontrado", 404, "channel-not-found")

    const raw = (channel.config ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === "string" && v ? v : null)
    const config: InstagramChannelConfig = {
      instagram_business_account_id: channel.external_id || str(raw.instagram_business_account_id) || "",
      access_token: str(raw.access_token) || "",
      facebook_page_id: str(raw.facebook_page_id),
      facebook_page_token: str(raw.facebook_page_token),
    }

    const post = await getInstagramMediaInfo(config, mediaId)
    if (!post) {
      log.info("post indisponível na Graph", { threadId: id, mediaId })
      return successResponse(request, { media_id: mediaId, unavailable: true })
    }

    return successResponse(request, { media_id: mediaId, post })
  } catch (error) {
    return errorResponse(request, error, "crm-inbox-thread-post")
  }
}
