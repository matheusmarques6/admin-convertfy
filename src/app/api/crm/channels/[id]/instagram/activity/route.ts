/**
 * GET /api/crm/channels/[id]/instagram/activity — painel de atividade.
 *
 * Busca na Graph API o perfil (seguidores/seguindo/posts) e as mídias
 * recentes com últimos comentários. De quebra, grava o snapshot DIÁRIO
 * de seguidores no config JSONB do canal (`follower_history`) — abrir o
 * painel já alimenta o histórico mesmo antes do cron rodar.
 *
 * Payload tolerante a falha parcial: perfil e mídias vêm com campo de
 * erro próprio (token expirado em um não esconde o outro).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import {
  fetchInstagramProfile,
  fetchInstagramRecentMedia,
} from "@/lib/services/instagram-activity.service"
import type { InstagramChannelConfig } from "@/lib/services/instagram-graph.service"
import {
  appendFollowerSnapshot,
  followerDelta,
  normalizeFollowerHistory,
  spDayKey,
} from "@/lib/services/instagram-followers"

const log = logger.child("IgActivityRoute")

export const dynamic = "force-dynamic"
export const maxDuration = 60

type ChannelRow = {
  id: string
  org_id: string
  type: string
  display_name: string
  external_id: string
  config: Record<string, unknown> | null
  is_active: boolean
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, org_id, type, display_name, external_id, config, is_active")
      .eq("id", channelId)
      .maybeSingle<ChannelRow>()

    if (!channel || channel.org_id !== orgId) {
      throw new AppError("Canal não encontrado", 404, "not-found")
    }
    if (channel.type !== "instagram") {
      throw new AppError("Este painel só existe para canais Instagram", 422, "unsupported-channel")
    }

    const rawConfig = channel.config ?? {}
    const config: InstagramChannelConfig = {
      instagram_business_account_id:
        (typeof rawConfig.instagram_business_account_id === "string"
          ? rawConfig.instagram_business_account_id
          : null) || channel.external_id,
      access_token: typeof rawConfig.access_token === "string" ? rawConfig.access_token : "",
    }

    const [profileRes, mediaRes] = await Promise.all([
      fetchInstagramProfile(config),
      fetchInstagramRecentMedia(config, 12),
    ])

    // Snapshot diário no config (best-effort — falha não derruba o GET).
    let history = normalizeFollowerHistory(rawConfig.follower_history)
    if (profileRes.ok && typeof profileRes.data.followers_count === "number") {
      history = appendFollowerSnapshot(history, {
        day: spDayKey(),
        followers: profileRes.data.followers_count,
        follows: profileRes.data.follows_count,
        media: profileRes.data.media_count,
      })
      const { error: upErr } = await admin
        .from("crm_channels")
        .update({ config: { ...rawConfig, follower_history: history } })
        .eq("id", channelId)
      if (upErr) {
        log.warn("[IgActivity] snapshot não gravado", { channelId, error: upErr.message })
      }
    }

    return successResponse(request, {
      channel: {
        id: channel.id,
        display_name: channel.display_name,
        external_id: channel.external_id,
        is_active: channel.is_active,
      },
      profile: profileRes.ok ? profileRes.data : null,
      profile_error: profileRes.ok ? null : profileRes.error.message,
      media: mediaRes.ok ? mediaRes.data : [],
      media_error: mediaRes.ok ? null : mediaRes.error.message,
      follower_history: history,
      deltas: {
        d1: followerDelta(history, 1),
        d7: followerDelta(history, 7),
        d30: followerDelta(history, 30),
      },
    })
  } catch (error) {
    log.error("instagram activity error:", error)
    return errorResponse(request, error, "crm-instagram-activity")
  }
}
