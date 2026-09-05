/**
 * Perfis do módulo Conteúdo = canais Instagram da org.
 *
 * Lê `crm_channels` (type instagram), renova o snapshot de perfil da Graph
 * API (username, nome, foto, seguidores) no máximo 1x por dia e guarda a
 * foto no Storage do admin — a URL do CDN da Meta expira e não pode ser
 * embutida na exportação dos slides. Tudo em `config.conteudo` (JSONB, sem
 * migration nas tabelas do CRM).
 */

import sharp from "sharp"
import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { CONVERTIA_IMAGE_BUCKET, convertiaImageUrl } from "@/lib/ai/convertia-image-url"
import { META_SEMANAL_PADRAO } from "@/lib/conteudo/config"
import { corDoPerfil } from "@/lib/conteudo/brand"
import type { Perfil } from "@/lib/conteudo/types"
import { fetchInstagramProfile, resolveAndHealInstagramChannel } from "./instagram-activity.service"
import { appendFollowerSnapshot, normalizeFollowerHistory, spDayKey, type FollowerSnapshot } from "./instagram-followers"
import { channelIgConfig, loadIgChannels, type ChannelRow } from "./conteudo-instagram-sync.service"

const log = logger.child("ConteudoPerfis")

type Admin = ReturnType<typeof createAdminClient>

const PROFILE_TTL_MS = 24 * 3600_000
const AVATAR_TTL_MS = 7 * 24 * 3600_000

export interface ConteudoConfig {
  profile?: { username: string | null; name: string | null; picture_url: string | null; followers: number | null; fetched_at: string }
  profile_error?: string | null
  avatar_path?: string | null
  avatar_fetched_at?: string | null
  meta_semanal?: number
  last_media_sync_at?: string
  last_media_sync_error?: string | null
}

export function conteudoConfig(channel: ChannelRow): ConteudoConfig {
  const c = channel.config?.conteudo
  return c && typeof c === "object" ? (c as ConteudoConfig) : {}
}

export function historicoDoCanal(channel: ChannelRow): FollowerSnapshot[] {
  return normalizeFollowerHistory(channel.config?.follower_history)
}

async function guardarAvatar(admin: Admin, orgId: string, channelId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const png = await sharp(buf).resize(256, 256, { fit: "cover" }).png().toBuffer()
    const path = `stores/org-${orgId}/email-assets/avatar-${channelId}.png`
    const { error } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).upload(path, png, { contentType: "image/png", upsert: true })
    if (error) {
      log.warn("avatar não gravado", { channelId, error: error.message })
      return null
    }
    return path
  } catch (e) {
    log.warn("avatar não baixado", { channelId, error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

export function perfilDoCanal(channel: ChannelRow, indice: number): Perfil {
  const cc = conteudoConfig(channel)
  const hist = historicoDoCanal(channel)
  const ultimo = hist[hist.length - 1]
  return {
    id: channel.id,
    nome: cc.profile?.name || channel.display_name,
    handle: cc.profile?.username ? `@${cc.profile.username}` : null,
    cor: corDoPerfil(indice),
    avatar: cc.avatar_path ? convertiaImageUrl(cc.avatar_path) : null,
    canal: "instagram",
    ativo: channel.is_active,
    metaSemanal: typeof cc.meta_semanal === "number" && cc.meta_semanal > 0 ? cc.meta_semanal : META_SEMANAL_PADRAO,
    seguidores: ultimo?.followers ?? cc.profile?.followers ?? null,
    erro: cc.profile_error ?? cc.last_media_sync_error ?? null,
  }
}

/**
 * Canais + perfis. `refresh` força a leitura da Graph API; sem ele, só
 * renova o que passou do TTL. Grava snapshot diário de seguidores como
 * efeito colateral (mesma regra do painel do Instagram).
 */
export async function loadPerfis(admin: Admin, orgId: string, opts: { refresh?: boolean; includeInactive?: boolean } = {}): Promise<{ perfis: Perfil[]; channels: ChannelRow[] }> {
  const channels = await loadIgChannels(admin, orgId, !opts.includeInactive)
  const agora = Date.now()
  const atualizados: ChannelRow[] = []

  for (const ch of channels) {
    const cc = conteudoConfig(ch)
    const stale = !cc.profile || agora - Date.parse(cc.profile.fetched_at) > PROFILE_TTL_MS
    if (!ch.is_active || (!opts.refresh && !stale)) {
      atualizados.push(ch)
      continue
    }
    try {
      const healed = await resolveAndHealInstagramChannel(admin, ch, ch.config ?? {}, channelIgConfig(ch))
      const raw = { ...healed.rawConfig }
      const prof = await fetchInstagramProfile(healed.config)
      const novo: ConteudoConfig = { ...cc }
      if (prof.ok) {
        novo.profile = {
          username: prof.data.username,
          name: prof.data.name,
          picture_url: prof.data.profile_picture_url,
          followers: prof.data.followers_count,
          fetched_at: new Date(agora).toISOString(),
        }
        novo.profile_error = null
        if (typeof prof.data.followers_count === "number") {
          raw.follower_history = appendFollowerSnapshot(normalizeFollowerHistory(raw.follower_history), {
            day: spDayKey(),
            followers: prof.data.followers_count,
            follows: prof.data.follows_count,
            media: prof.data.media_count,
          })
        }
        const avatarStale = !cc.avatar_path || !cc.avatar_fetched_at || agora - Date.parse(cc.avatar_fetched_at) > AVATAR_TTL_MS
        if (prof.data.profile_picture_url && avatarStale) {
          const path = await guardarAvatar(admin, orgId, ch.id, prof.data.profile_picture_url)
          if (path) {
            novo.avatar_path = path
            novo.avatar_fetched_at = new Date(agora).toISOString()
          }
        }
      } else {
        novo.profile_error = prof.error.message
        // Mantém o snapshot antigo, mas evita bater na Meta a cada abertura.
        novo.profile = cc.profile ? { ...cc.profile, fetched_at: new Date(agora).toISOString() } : { username: null, name: null, picture_url: null, followers: null, fetched_at: new Date(agora).toISOString() }
      }
      const config = { ...raw, conteudo: novo }
      const { error } = await admin.from("crm_channels").update({ config }).eq("id", ch.id)
      if (error) log.warn("config do canal não gravado", { channel: ch.id, error: error.message })
      atualizados.push({ ...ch, config })
    } catch (e) {
      log.warn("perfil não renovado", { channel: ch.id, error: e instanceof Error ? e.message : String(e) })
      atualizados.push(ch)
    }
  }

  return { channels: atualizados, perfis: atualizados.map((c, i) => perfilDoCanal(c, i)) }
}

/** Atualiza só a parte `conteudo` do config (ex.: meta semanal). */
export async function patchConteudoConfig(admin: Admin, channel: ChannelRow, patch: Partial<ConteudoConfig>): Promise<void> {
  const raw = channel.config ?? {}
  const { error } = await admin
    .from("crm_channels")
    .update({ config: { ...raw, conteudo: { ...conteudoConfig(channel), ...patch } } })
    .eq("id", channel.id)
  if (error) throw error
}
