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
import type { createAdminClient } from "@/lib/supabase/server"
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
  const rawMsg = body.error?.message || ""
  if (body.error?.code === 190) {
    // 190 NÃO é sempre "expirou": a Meta usa o mesmo código pra
    // "esta chamada exige um Page Access Token" (aconteceu com token de
    // System User válido — perfil/posts funcionavam e a mensagem
    // "expirado" era mentira). Distinguir e SEMPRE anexar o texto cru.
    if (/page access token/i.test(rawMsg)) {
      return {
        code,
        message:
          "Esta chamada exige um token de PÁGINA (o token do canal é de usuário/System User — válido, mas do tipo errado pra cá). O sistema obtém o token da Página sozinho via /me/accounts; garanta que o token tem a permissão pages_show_list e a Página nos ativos do System User.",
      }
    }
    return {
      code,
      message: `A Meta recusou o token nesta chamada (190${body.error?.error_subcode ? `/${body.error.error_subcode}` : ""}): "${rawMsg}". Se o resto do painel funciona, o token está válido — o problema é específico desta chamada; caso nada funcione, reconecte o canal com um token novo de System User.`,
    }
  }
  // "(#100) Tried accessing nonexisting field": ou o ID salvo não é o
  // Instagram Business Account ID (colar o ID da PÁGINA do me/accounts
  // é o erro clássico), ou o token não carrega as permissões
  // instagram_basic / instagram_manage_messages.
  if (body.error?.code === 100) {
    return {
      code,
      message:
        "A Meta não reconheceu a consulta (#100). Normalmente o ID salvo é o da Página do Facebook (o correto é o instagram_business_account.id) ou o token está sem as permissões instagram_basic / instagram_manage_messages. Confira o ID e gere o token de System User com a Página + o Instagram nos ativos.",
    }
  }
  // "(#3) Application does not have the capability": o APP Meta não tem
  // acesso à API de mensagens neste caminho/token.
  if (body.error?.code === 3) {
    return {
      code,
      message:
        "O app da Meta não tem a capability de mensagens (#3). No painel do app, adicione o produto Messenger e ative 'Instagram — configurações da API'; gere o token de System User marcando as permissões instagram_manage_messages, pages_messaging e pages_manage_metadata (com a Página e o Instagram nos ativos).",
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

// ─── Resolução do ID da conta (diagnóstico + auto-cura) ──────────

export interface InstagramAccountResolution {
  ok: boolean
  /** ID efetivo do IG User (corrigido quando o salvo era uma Página). */
  resolved_id: string
  /** true quando o ID salvo era o da Página e achamos o IG vinculado. */
  corrected: boolean
  /** Page ID conhecido (útil pro fallback de conversations). */
  page_id: string | null
  node_type: string | null
  error: IgApiError | null
}

/**
 * Descobre o que o ID salvo realmente É na Graph API. O erro clássico
 * de conexão é colar o ID da PÁGINA (primeiro `id` do me/accounts) no
 * lugar do instagram_business_account.id — aí TODAS as chamadas caem
 * em "(#100) nonexisting field". `?metadata=1` devolve o tipo do node;
 * quando é "page", seguimos o vínculo e devolvemos o IG ID correto.
 */
export async function resolveInstagramAccount(
  config: InstagramChannelConfig,
): Promise<InstagramAccountResolution> {
  const id = config.instagram_business_account_id
  const probe = await graphGet<{ id?: string; metadata?: { type?: string } }>(
    config,
    `/${id}?metadata=1&fields=id`,
  )
  if (!probe.ok) {
    return { ok: false, resolved_id: id, corrected: false, page_id: null, node_type: null, error: probe.error }
  }
  const nodeType = probe.data.metadata?.type?.toLowerCase() ?? null
  if (nodeType === "page") {
    const page = await graphGet<{ instagram_business_account?: { id?: string } }>(
      config,
      `/${id}?fields=instagram_business_account`,
    )
    const igId = page.ok ? page.data.instagram_business_account?.id : undefined
    if (igId) {
      return { ok: true, resolved_id: igId, corrected: true, page_id: id, node_type: nodeType, error: null }
    }
    return {
      ok: false,
      resolved_id: id,
      corrected: false,
      page_id: id,
      node_type: nodeType,
      error: {
        code: "page_without_ig",
        message:
          "O ID salvo é de uma Página do Facebook e o token não alcançou a conta de Instagram vinculada — confira se a Página tem um Instagram profissional vinculado e se o token de System User tem a Página + as permissões instagram_basic e instagram_manage_messages.",
      },
    }
  }
  return { ok: true, resolved_id: id, corrected: false, page_id: null, node_type: nodeType, error: null }
}

type AdminLike = ReturnType<typeof createAdminClient>

export interface DiscoveredPage {
  id: string
  /** Page Access Token — a Conversations API EXIGE token de Página
   *  (token de System User válido devolve 190 "must be called with a
   *  Page Access Token" nessa edge). Derivado de token longo, não expira. */
  access_token: string | null
}

/**
 * Descobre a Página do Facebook vinculada a um IG Business Account a
 * partir do próprio token (`/me/accounts` lista as Páginas concedidas
 * ao System User, COM o token de cada Página). A Conversations API com
 * login via Facebook é servida pela PÁGINA com token de Página — sem
 * isso a importação de conversas não tem o caminho canônico.
 */
export async function discoverPageForIgUser(
  config: InstagramChannelConfig,
): Promise<DiscoveredPage | null> {
  const res = await graphGet<{
    data?: Array<{
      id?: string
      access_token?: string
      instagram_business_account?: { id?: string }
    }>
  }>(config, `/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100`)
  if (!res.ok) return null
  const match = (res.data.data ?? []).find(
    (p) => p.instagram_business_account?.id === config.instagram_business_account_id,
  )
  if (!match?.id) return null
  return { id: match.id, access_token: match.access_token ?? null }
}

/**
 * Resolve o ID e CURA o canal quando o salvo era o da Página: atualiza
 * config (instagram_business_account_id + facebook_page_id) e o
 * external_id — que é a chave de roteamento do webhook; com o ID errado
 * nenhum evento chegava. Devolve o config efetivo pras chamadas.
 */
export async function resolveAndHealInstagramChannel(
  admin: AdminLike,
  channel: { id: string; external_id: string },
  rawConfig: Record<string, unknown>,
  config: InstagramChannelConfig,
): Promise<{
  config: InstagramChannelConfig
  rawConfig: Record<string, unknown>
  pageId: string | null
  /** Page Access Token (a Conversations API exige token de PÁGINA). */
  pageToken: string | null
  resolution: InstagramAccountResolution
}> {
  const resolution = await resolveInstagramAccount(config)
  const knownPageId =
    resolution.page_id ??
    (typeof rawConfig.facebook_page_id === "string" ? rawConfig.facebook_page_id : null)
  const knownPageToken =
    typeof rawConfig.facebook_page_token === "string" ? rawConfig.facebook_page_token : null

  if (!resolution.ok || !resolution.corrected) {
    // Canal conectado direto com o IG ID certo nunca passou pela cura —
    // e ficou SEM a Página (id + token de Página) salva, que é o
    // caminho canônico da Conversations API. Descobre pelo token do
    // canal e persiste. Re-roda também quando só falta o page TOKEN.
    if (resolution.ok && (!knownPageId || !knownPageToken)) {
      const discovered = await discoverPageForIgUser(config)
      if (discovered) {
        const raw: Record<string, unknown> = {
          ...rawConfig,
          facebook_page_id: discovered.id,
          ...(discovered.access_token ? { facebook_page_token: discovered.access_token } : {}),
        }
        const { error } = await admin
          .from("crm_channels")
          .update({ config: raw })
          .eq("id", channel.id)
        if (error) {
          log.warn("[IgActivity] página descoberta mas não persistida", {
            channelId: channel.id,
            error: error.message,
          })
        } else {
          log.info("[IgActivity] Página vinculada descoberta e salva", {
            channelId: channel.id,
            pageId: discovered.id,
            pageToken: Boolean(discovered.access_token),
          })
        }
        return {
          config,
          rawConfig: raw,
          pageId: discovered.id,
          pageToken: discovered.access_token ?? knownPageToken,
          resolution,
        }
      }
    }
    return { config, rawConfig, pageId: knownPageId, pageToken: knownPageToken, resolution }
  }

  const healedRaw: Record<string, unknown> = {
    ...rawConfig,
    instagram_business_account_id: resolution.resolved_id,
    facebook_page_id: resolution.page_id,
  }
  const healedConfig: InstagramChannelConfig = {
    ...config,
    instagram_business_account_id: resolution.resolved_id,
  }

  // external_id só muda se não colidir com outro canal ativo (o lookup
  // do webhook é por external_id — dois iguais quebrariam o roteamento).
  const { data: clash } = await admin
    .from("crm_channels")
    .select("id")
    .eq("type", "instagram")
    .eq("external_id", resolution.resolved_id)
    .eq("is_active", true)
    .neq("id", channel.id)
    .limit(1)
    .maybeSingle()

  const update: Record<string, unknown> = { config: healedRaw }
  if (!clash) update.external_id = resolution.resolved_id

  const { error } = await admin.from("crm_channels").update(update).eq("id", channel.id)
  if (error) {
    log.warn("[IgActivity] auto-cura do canal falhou (seguindo com o ID resolvido)", {
      channelId: channel.id,
      error: error.message,
    })
  } else {
    log.info("[IgActivity] canal curado: ID da Página → IG Business Account", {
      channelId: channel.id,
      from: channel.external_id,
      to: resolution.resolved_id,
      external_id_updated: !clash,
    })
  }

  return {
    config: healedConfig,
    rawConfig: healedRaw,
    pageId: resolution.page_id,
    // O token de Página é descoberto na próxima visita (o canal recém-
    // curado cai no caminho normal, que roda o discover).
    pageToken: knownPageToken,
    resolution,
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
 *
 * Tenta primeiro no IG User; se a Meta negar a edge (#100) e a Página
 * for conhecida, refaz via `/{page-id}/conversations?platform=instagram`
 * — mesma resposta, exigência de permissão ligeiramente diferente.
 */
export async function fetchInstagramConversations(
  config: InstagramChannelConfig,
  opts: {
    limit?: number
    messagesPerConversation?: number
    pageId?: string | null
    /** Page Access Token — a edge da Página EXIGE token de Página
     *  (token de System User válido leva 190 "must be called with a
     *  Page Access Token", que soava como "expirado" e não era). */
    pageToken?: string | null
  } = {},
): Promise<IgResult<InstagramConversationInfo[]>> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const perConv = Math.min(Math.max(opts.messagesPerConversation ?? 25, 1), 100)
  const fields = `id,updated_time,participants,messages.limit(${perConv}){id,created_time,message,from}`
  const query = `conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=${limit}`

  // Com login via Facebook, a Conversations API é servida pela PÁGINA,
  // com token de Página. Página primeiro quando conhecida; o IG User
  // fica de fallback pra QUALQUER erro (o #3/#100/190 variam por
  // configuração de app).
  const attempts: Array<{ path: string; cfg: InstagramChannelConfig }> = opts.pageId
    ? [
        {
          path: `/${opts.pageId}/${query}`,
          cfg: opts.pageToken ? { ...config, access_token: opts.pageToken } : config,
        },
        { path: `/${config.instagram_business_account_id}/${query}`, cfg: config },
      ]
    : [{ path: `/${config.instagram_business_account_id}/${query}`, cfg: config }]

  let res = await graphGet<{ data?: RawConversation[] }>(attempts[0].cfg, attempts[0].path)
  if (!res.ok && attempts[1]) {
    const fallback = await graphGet<{ data?: RawConversation[] }>(
      attempts[1].cfg,
      attempts[1].path,
    )
    if (fallback.ok) res = fallback
  }
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
