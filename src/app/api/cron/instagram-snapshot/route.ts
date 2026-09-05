/**
 * Vercel Cron — snapshot diário de seguidores dos canais Instagram.
 *
 * Schedule: 15 8 * * * (05:15 BRT)
 *
 * A Graph API não expõe a lista de quem seguiu — só followers_count.
 * Este cron guarda o total do dia no config JSONB de cada canal ativo
 * (`follower_history`, ver instagram-followers.ts) para o painel
 * derivar os deltas 1d/7d/30d. Idempotente: rodar duas vezes no mesmo
 * dia só substitui o snapshot do dia.
 *
 * Desde set/2026 também sincroniza as mídias + insights do módulo Conteúdo
 * (`conteudo_ig_media` / `conteudo_ig_daily`), com orçamento por canal —
 * o dashboard lê do banco e só re-sincroniza inline quando o dado está
 * defasado.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  fetchInstagramProfile,
  resolveAndHealInstagramChannel,
} from "@/lib/services/instagram-activity.service"
import type { InstagramChannelConfig } from "@/lib/services/instagram-graph.service"
import {
  appendFollowerSnapshot,
  normalizeFollowerHistory,
  spDayKey,
} from "@/lib/services/instagram-followers"
import { syncChannelConteudo } from "@/lib/services/conteudo-instagram-sync.service"

const log = logger.child("CronInstagramSnapshot")

export const dynamic = "force-dynamic"
export const maxDuration = 300

type ChannelRow = {
  id: string
  org_id: string
  type: string
  display_name: string
  external_id: string
  config: Record<string, unknown> | null
  is_active: boolean
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const { data: channels } = await admin
      .from("crm_channels")
      .select("id, org_id, type, display_name, external_id, config, is_active")
      .eq("type", "instagram")
      .eq("is_active", true)
      .returns<ChannelRow[]>()

    const results: Array<{ channel: string; ok: boolean; followers?: number; error?: string; conteudo?: unknown }> = []
    const inicio = Date.now()

    for (const channel of channels ?? []) {
      const storedConfig = channel.config ?? {}
      const storedIg: InstagramChannelConfig = {
        instagram_business_account_id:
          (typeof storedConfig.instagram_business_account_id === "string"
            ? storedConfig.instagram_business_account_id
            : null) || channel.external_id,
        access_token: typeof storedConfig.access_token === "string" ? storedConfig.access_token : "",
      }

      // Mesma auto-cura do painel (ID de Página → IG ID vinculado).
      const healed = await resolveAndHealInstagramChannel(admin, channel, storedConfig, storedIg)
      const config = healed.config
      const rawConfig = healed.rawConfig

      const profile = await fetchInstagramProfile(config)
      if (!profile.ok || typeof profile.data.followers_count !== "number") {
        results.push({
          channel: channel.display_name,
          ok: false,
          error: profile.ok ? "followers_count ausente" : profile.error.message,
        })
        continue
      }

      const history = appendFollowerSnapshot(normalizeFollowerHistory(rawConfig.follower_history), {
        day: spDayKey(),
        followers: profile.data.followers_count,
        follows: profile.data.follows_count,
        media: profile.data.media_count,
      })

      const { error } = await admin
        .from("crm_channels")
        .update({ config: { ...rawConfig, follower_history: history } })
        .eq("id", channel.id)

      // Mídias + insights do módulo Conteúdo (orçamento por canal; o
      // restante fica para o próximo dia ou para o sync inline do dashboard).
      let conteudo: unknown = null
      const restante = 280_000 - (Date.now() - inicio)
      if (restante > 10_000) {
        const canalAtualizado = { ...channel, config: { ...rawConfig, follower_history: history } }
        conteudo = await syncChannelConteudo(admin, canalAtualizado, {
          budgetMs: Math.min(60_000, restante - 5_000),
        }).catch((e) => ({ ok: false, erro: e instanceof Error ? e.message : String(e) }))
      }

      results.push({
        channel: channel.display_name,
        ok: !error,
        followers: profile.data.followers_count,
        ...(error ? { error: error.message } : {}),
        conteudo,
      })
    }

    const failed = results.filter((r) => !r.ok)
    log.info("instagram snapshot cron", { channels: results.length, failed: failed.length })
    return NextResponse.json({ success: true, channels: results.length, failed: failed.length, results })
  } catch (error) {
    log.error("instagram snapshot cron failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
