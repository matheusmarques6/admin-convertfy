/**
 * Instagram Graph API — leitura de atividade da conta.
 *
 * Complementa o instagram-graph.service (que ENVIA DM/replies) com as
 * leituras que alimentam o painel /admin/comercial/instagram:
 *   - perfil (username, foto, followers_count...)
 *   - mídias recentes com os últimos comentários
 *   - conversas (Conversations API) pra importar o histórico de DMs
 *
 * LIMITAÇÃO OFICIAL: a Graph API não expõe QUEM seguiu/deixou de seguir
 * — só o total (followers_count). O "quem seguiu recente" vira
 * acompanhamento de delta diário (ver instagram-followers.ts).
 *
 * Todos os fetchers devolvem `{ ok } | { ok: false, error }` — erro de
 * token (code 190) ganha mensagem amigável pedindo reconexão do canal.
 */

import { logger } from "@/lib/logger"
import type { InstagramChannelConfig } from "./instagram-graph.service"

const log = logger.child("InstagramActivity")

const API_VERSION = "v20.0"
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`

export interface IgApiError {
  code: string
  message: string
}

type IgResult<T> = { ok: true; data: T } | { ok: false; error: IgApiError }

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number }
}

function friendlyError(status: number, body: GraphErrorBody): IgApiError {
  const code = body.error?.code?.toString() || status.toString()
  if (body.error?.code === 190) {
    return {
      code,
      message:
        "Token de acesso expirado ou inválido — reconecte o canal em Canais com um token novo (System User não expira).",
    }
  }
  return { code, message: body.error?.message || `Erro HTTP ${status} na Graph API` }
}

async function graphGet<T>(config: InstagramChannelConfig, path: string): Promise<IgResult<T>> {
  if (!config.access_token) {
    return { ok: false, error: { code: "config_missing", message: "Canal sem access_token no config" } }
  }
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${config.access_token}` },
      // Painel é leitura sob demanda — nunca servir cache velho.
      cache: "no-store",
    })
    const body = (await res.json().catch(() => ({}))) as T & GraphErrorBody
    if (!res.ok || body.error) {
      log.warn("[IgActivity] graph error", { path: path.split("?")[0], status: res.status, error: body.error })
      return { ok: false, error: friendlyError(res.status, body) }
    }
    return { ok: true, data: body }
  } catch (err) {
    log.error("[IgActivity] network error", err)
    return {
      ok: false,
      error: { code: "network_error", message: err instanceof Error ? err.message : "Erro de rede" },
    }
  }
}

// ─── Perfil ──────────────────────────────────────────────────────

export interface InstagramProfileInfo {
  id: string
  username: string | null
  name: string | null
  biography: string | null
  website: string | null
  profile_picture_url: string | null
  followers_count: number | null
  follows_count: number | null
  media_count: number | null
}

export async function fetchInstagramProfile(
  config: InstagramChannelConfig,
): Promise<IgResult<InstagramProfileInfo>> {
  const fields =
    "username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count"
  const res = await graphGet<Partial<InstagramProfileInfo> & { id?: string }>(
    config,
    `/${config.instagram_business_account_id}?fields=${fields}`,
  )
  if (!res.ok) return res
  const d = res.data
  return {
    ok: true,
    data: {
      id: d.id || config.instagram_business_account_id,
      username: d.username ?? null,
      name: d.name ?? null,
      biography: d.biography ?? null,
      website: d.website ?? null,
      profile_picture_url: d.profile_picture_url ?? null,
      followers_count: typeof d.followers_count === "number" ? d.followers_count : null,
      follows_count: typeof d.follows_count === "number" ? d.follows_count : null,
      media_count: typeof d.media_count === "number" ? d.media_count : null,
    },
  }
}

// ─── Mídias + comentários recentes ───────────────────────────────

export interface InstagramCommentInfo {
  id: string
  text: string | null
  username: string | null
  timestamp: string | null
  like_count: number | null
}

export interface InstagramMediaInfo {
  id: string
  caption: string | null
  media_type: string | null
  media_url: string | null
  thumbnail_url: string | null
  permalink: string | null
  timestamp: string | null
  like_count: number | null
  comments_count: number | null
  comments: InstagramCommentInfo[]
}

interface RawMedia {
  id: string
  caption?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
  comments?: {
    data?: Array<{
      id: string
      text?: string
      username?: string
      timestamp?: string
      like_count?: number
    }>
  }
}

export async function fetchInstagramRecentMedia(
  config: InstagramChannelConfig,
  limit = 12,
): Promise<IgResult<InstagramMediaInfo[]>> {
  const fields =
    "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count," +
    "comments.limit(3){id,text,username,timestamp,like_count}"
  const res = await graphGet<{ data?: RawMedia[] }>(
    config,
    `/${config.instagram_business_account_id}/media?fields=${encodeURIComponent(fields)}&limit=${limit}`,
  )
  if (!res.ok) return res
  const media = (res.data.data ?? []).map((m): InstagramMediaInfo => ({
    id: m.id,
    caption: m.caption ?? null,
    media_type: m.media_type ?? null,
    media_url: m.media_url ?? null,
    thumbnail_url: m.thumbnail_url ?? null,
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? null,
    like_count: typeof m.like_count === "number" ? m.like_count : null,
    comments_count: typeof m.comments_count === "number" ? m.comments_count : null,
    comments: (m.comments?.data ?? []).map((c) => ({
      id: c.id,
      text: c.text ?? null,
      username: c.username ?? null,
      timestamp: c.timestamp ?? null,
      like_count: typeof c.like_count === "number" ? c.like_count : null,
    })),
  }))
  return { ok: true, data: media }
}

// ─── Conversas (histórico de DMs) ────────────────────────────────

export interface InstagramConversationMessage {
  id: string
  created_time: string | null
  message: string | null
  from_id: string | null
  from_username: string | null
}

export interface InstagramConversationInfo {
  id: string
  updated_time: string | null
  participants: Array<{ id: string; username: string | null }>
  messages: InstagramConversationMessage[]
}

interface RawConversation {
  id: string
  updated_time?: string
  participants?: { data?: Array<{ id: string; username?: string; name?: string }> }
  messages?: {
    data?: Array<{
      id: string
      created_time?: string
      message?: string
      from?: { id?: string; username?: string }
    }>
  }
}

/**
 * Conversas recentes da conta com as últimas mensagens de cada uma.
 * A Conversations API só entrega o histórico RECENTE (janela da Meta) —
 * conversas antigas/arquivadas podem não vir. `from.id` é o mesmo IGSID
 * dos webhooks, então a importação casa com as threads existentes.
 */
export async function fetchInstagramConversations(
  config: InstagramChannelConfig,
  opts: { limit?: number; messagesPerConversation?: number } = {},
): Promise<IgResult<InstagramConversationInfo[]>> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const perConv = Math.min(Math.max(opts.messagesPerConversation ?? 25, 1), 100)
  const fields = `id,updated_time,participants,messages.limit(${perConv}){id,created_time,message,from}`
  const res = await graphGet<{ data?: RawConversation[] }>(
    config,
    `/${config.instagram_business_account_id}/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=${limit}`,
  )
  if (!res.ok) return res
  const conversations = (res.data.data ?? []).map((c): InstagramConversationInfo => ({
    id: c.id,
    updated_time: c.updated_time ?? null,
    participants: (c.participants?.data ?? []).map((p) => ({
      id: p.id,
      username: p.username ?? p.name ?? null,
    })),
    messages: (c.messages?.data ?? []).map((m) => ({
      id: m.id,
      created_time: m.created_time ?? null,
      message: m.message ?? null,
      from_id: m.from?.id ?? null,
      from_username: m.from?.username ?? null,
    })),
  }))
  return { ok: true, data: conversations }
}
