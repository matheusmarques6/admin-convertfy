/**
 * Instagram Graph API client (Meta) — Direct Messages + Comments.
 *
 * Docs:
 *   - DMs: https://developers.facebook.com/docs/messenger-platform/instagram/get-started
 *   - Comments: https://developers.facebook.com/docs/instagram-api/guides/comment-moderation
 *
 * Versao: v20.0 (LTS).
 *
 * Cada channel armazena `instagram_business_account_id` em external_id
 * e `access_token` em config. Quando a conexão é por login do Facebook
 * (o nosso caso), quem SERVE mensagens é a PÁGINA, com TOKEN DE PÁGINA:
 * o mesmo aprendizado que a importação de conversas já tinha absorvido
 * (`instagram-activity.service`), e que o envio ficou sem. Token de
 * System User é válido e passa em perfil/mídias, mas a Meta recusa nas
 * edges de mensagem com 190 "must be called with a Page Access Token"
 * ou #3 "does not have the capability" — daí a cascata Página→IG User
 * em todo envio.
 */

import { logger } from "@/lib/logger"

const log = logger.child("InstagramGraph")

const API_VERSION = "v20.0"
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`

export interface InstagramChannelConfig {
  /** IG Business Account ID (a.k.a IG User ID, usado pra enviar DMs). */
  instagram_business_account_id: string
  /** Token do canal (System User ou de Página). */
  access_token: string
  /** Página do Facebook vinculada — caminho canônico das mensagens. */
  facebook_page_id?: string | null
  /** Page Access Token, descoberto via /me/accounts e persistido. */
  facebook_page_token?: string | null
}

/**
 * Caminhos de envio, do mais canônico ao de fallback.
 *
 * 1. Página + token de Página — o que a Meta serve no login por Facebook.
 * 2. IG User + token do canal — comportamento histórico; ainda vale para
 *    contas ligadas por Instagram Login e para o app que expõe a edge no
 *    IG User.
 *
 * A ordem importa e o fallback também: apps diferentes recusam caminhos
 * diferentes (#3/#100/190 variam), então tentar um só devolve um erro
 * que não prova nada.
 */
export function buildSendAttempts(
  config: InstagramChannelConfig,
): Array<{ nodeId: string; token: string; via: "page" | "ig_user" }> {
  const attempts: Array<{ nodeId: string; token: string; via: "page" | "ig_user" }> = []
  if (config.facebook_page_id && config.facebook_page_token) {
    attempts.push({
      nodeId: config.facebook_page_id,
      token: config.facebook_page_token,
      via: "page",
    })
  }
  if (config.instagram_business_account_id && config.access_token) {
    attempts.push({
      nodeId: config.instagram_business_account_id,
      token: config.access_token,
      via: "ig_user",
    })
  }
  return attempts
}

/** Tokens a tentar em edges que não são por node (reply de comentário). */
export function buildTokenAttempts(config: InstagramChannelConfig): string[] {
  const out: string[] = []
  if (config.facebook_page_token) out.push(config.facebook_page_token)
  if (config.access_token && config.access_token !== config.facebook_page_token) {
    out.push(config.access_token)
  }
  return out
}

// ─── Leitura: post (media) e foto de perfil ─────────────────────────

export interface InstagramMediaInfo {
  id: string
  caption: string | null
  permalink: string | null
  /** Melhor imagem pra thumb: thumbnail_url (vídeo) ou media_url. */
  thumbnail_url: string | null
  media_type: string | null
  like_count: number | null
  comments_count: number | null
  timestamp: string | null
}

/**
 * Dados do post pra thread de comentários (card do inbox): legenda,
 * permalink, thumb e contadores. Tenta token de Página e do canal —
 * apps diferentes servem o node de media por caminhos diferentes.
 * null = nenhum token conseguiu (post apagado, permissão, token morto).
 */
export async function getInstagramMediaInfo(
  config: InstagramChannelConfig,
  mediaId: string,
): Promise<InstagramMediaInfo | null> {
  const fields = "caption,permalink,media_url,thumbnail_url,media_type,like_count,comments_count,timestamp"
  for (const token of buildTokenAttempts(config)) {
    try {
      const res = await fetch(
        `${BASE_URL}/${encodeURIComponent(mediaId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(6_000), cache: "no-store" },
      )
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || !body) {
        log.info("[IG] media info falhou, tentando próximo token", {
          mediaId,
          status: res.status,
          error: (body as { error?: { message?: string } } | null)?.error?.message,
        })
        continue
      }
      const str = (v: unknown) => (typeof v === "string" && v ? v : null)
      const num = (v: unknown) => (typeof v === "number" ? v : null)
      return {
        id: str(body.id) ?? mediaId,
        caption: str(body.caption),
        permalink: str(body.permalink),
        thumbnail_url: str(body.thumbnail_url) ?? str(body.media_url),
        media_type: str(body.media_type),
        like_count: num(body.like_count),
        comments_count: num(body.comments_count),
        timestamp: str(body.timestamp),
      }
    } catch (err) {
      log.warn("[IG] media info erro de rede", {
        mediaId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return null
}

/**
 * Foto de perfil de quem mandou DM (IGSID via Messaging Profile API).
 * Só está disponível para contatos que já falaram com a conta; null
 * quando a Meta não expõe (privacidade/escopo) — não é erro.
 */
export async function getInstagramUserProfilePic(
  config: InstagramChannelConfig,
  igsid: string,
): Promise<string | null> {
  for (const token of buildTokenAttempts(config)) {
    try {
      const res = await fetch(
        `${BASE_URL}/${encodeURIComponent(igsid)}?fields=profile_pic&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(5_000), cache: "no-store" },
      )
      const body = (await res.json().catch(() => null)) as { profile_pic?: unknown } | null
      if (res.ok && body && typeof body.profile_pic === "string" && body.profile_pic) {
        return body.profile_pic
      }
    } catch {
      // rede/timeout — tenta o próximo token
    }
  }
  return null
}

export interface InstagramDirectMessage {
  /** IG-scoped recipient ID (vem do webhook em entry.messaging[].sender.id). */
  to: string
  type: "text" | "image"
  text?: { body: string }
  image?: { url: string }
}

export interface SendResult {
  success: boolean
  message_id?: string
  error?: { code: string; message: string }
}

// ─── Direct Messages ─────────────────────────────────────────────

/**
 * Envia DM de Instagram via Messenger Platform endpoint.
 * Endpoint: POST /{ig-user-id}/messages
 *
 * NOTE: Janela de 24h padrao apos ultima mensagem do contato. Mensagens
 * fora dessa janela exigem human_agent tag (nao implementado aqui).
 */
export async function sendInstagramMessage(
  config: InstagramChannelConfig,
  msg: InstagramDirectMessage,
): Promise<SendResult> {
  const attempts = buildSendAttempts(config)
  if (attempts.length === 0) {
    return {
      success: false,
      error: {
        code: "config_missing",
        message:
          "Canal sem credenciais de envio — falta o token ou o ID da conta. Reconecte o canal em Comercial → Canais.",
      },
    }
  }

  const body: Record<string, unknown> = { recipient: { id: msg.to } }

  if (msg.type === "text" && msg.text) {
    body.message = { text: msg.text.body }
  } else if (msg.type === "image" && msg.image) {
    body.message = {
      attachment: {
        type: "image",
        payload: { url: msg.image.url, is_reusable: true },
      },
    }
  } else {
    return {
      success: false,
      error: { code: "invalid_payload", message: "Tipo de mensagem nao suportado" },
    }
  }

  let firstError: SendResult["error"] | null = null

  for (const attempt of attempts) {
    try {
      const res = await fetch(`${BASE_URL}/${attempt.nodeId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${attempt.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && !data.error) {
        return { success: true, message_id: data.message_id || data.recipient_id }
      }

      log.warn("[Instagram] DM send recusado", {
        via: attempt.via,
        status: res.status,
        error: data.error,
      })
      if (!firstError) firstError = friendlySendError(res.status, data)
    } catch (err) {
      log.error("[Instagram] DM network error", err)
      if (!firstError) {
        firstError = {
          code: "network_error",
          message: err instanceof Error ? err.message : "Network error",
        }
      }
    }
  }

  return {
    success: false,
    error: firstError ?? { code: "unknown", message: "Falha ao enviar a mensagem" },
  }
}

/**
 * Traduz o erro da Meta para o que o atendente precisa FAZER. A rota de
 * envio devolve isso como 502, então esta string aparece na tela — vale
 * mais que o texto cru da Graph API, que fala de capabilities e nodes.
 */
function friendlySendError(
  status: number,
  data: { error?: { message?: string; code?: number; error_subcode?: number } },
): { code: string; message: string } {
  const code = data.error?.code?.toString() || status.toString()
  const raw = data.error?.message || ""

  if (data.error?.code === 190) {
    return {
      code,
      message: /page access token/i.test(raw)
        ? "A Meta exige TOKEN DE PÁGINA para enviar. O canal ainda não descobriu a Página vinculada — abra Comercial → Canais e clique em \"Ativar recebimento\" nesta conta para resolver o vínculo."
        : `A Meta recusou o token no envio (190): "${raw}". Reconecte o canal com um token novo de System User.`,
    }
  }
  if (data.error?.code === 3) {
    return {
      code,
      message:
        "O app da Meta não tem a capability de mensagens (#3). No painel do app adicione o produto Messenger, ative \"Instagram — configurações da API\" e gere o token com instagram_manage_messages + pages_messaging.",
    }
  }
  if (data.error?.code === 100) {
    return {
      code,
      message:
        "A Meta não reconheceu o destino (#100). Normalmente é a conta conectada com o ID errado ou o token sem instagram_manage_messages — abra a edição do canal e confira o ID.",
    }
  }
  // 10 / 613: fora da janela de 24h — o caso mais comum no dia a dia.
  if (data.error?.code === 10 || /outside.*(allowed|24)/i.test(raw)) {
    return {
      code,
      message:
        "Fora da janela de 24h do Instagram: a Meta só permite responder até 24h após a última mensagem do contato.",
    }
  }
  return { code, message: raw || `Erro HTTP ${status} na Graph API` }
}

// ─── Comments ────────────────────────────────────────────────────

/**
 * Responde a um comentario no Instagram.
 * Endpoint: POST /{comment-id}/replies
 */
export async function replyToInstagramComment(
  config: InstagramChannelConfig,
  commentId: string,
  message: string,
): Promise<SendResult> {
  const tokens = buildTokenAttempts(config)
  if (tokens.length === 0) {
    return {
      success: false,
      error: { code: "config_missing", message: "Canal sem access_token configurado" },
    }
  }

  let firstError: SendResult["error"] | null = null

  for (const token of tokens) {
    try {
      const res = await fetch(`${BASE_URL}/${commentId}/replies`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && !data.error) return { success: true, message_id: data.id }

      log.warn("[Instagram] comment reply recusado", { status: res.status, error: data.error })
      if (!firstError) firstError = friendlySendError(res.status, data)
    } catch (err) {
      log.error("[Instagram] comment reply network error", err)
      if (!firstError) {
        firstError = {
          code: "network_error",
          message: err instanceof Error ? err.message : "Network error",
        }
      }
    }
  }

  return {
    success: false,
    error: firstError ?? { code: "unknown", message: "Falha ao responder o comentário" },
  }
}

// ─── Assinatura do webhook (a peça que faltava) ──────────────────

/**
 * Campos da PÁGINA que entregam DM e comentário do Instagram.
 * `messages`/`messaging_postbacks` cobrem o direct; `feed` não serve pro
 * IG, mas `messaging_seen`/`messaging_referral` vêm de brinde e não
 * atrapalham. Se a Meta recusar o conjunto, caímos no mínimo viável.
 */
const PAGE_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_seen",
  "messaging_referral",
]
const PAGE_WEBHOOK_FIELDS_MINIMAL = ["messages", "messaging_postbacks"]

export interface SubscribeResult {
  success: boolean
  /** Campos efetivamente assinados nesta chamada. */
  fields: string[]
  error?: { code: string; message: string }
}

/**
 * Assina o app nos eventos da PÁGINA — `POST /{page-id}/subscribed_apps`.
 *
 * Este passo NÃO existia no projeto, e é o que faltava para a mensagem
 * chegar. Configurar o webhook no painel do app diz apenas QUAIS campos
 * o app quer; a entrega por conta exige assinar a Página. Sem isso a
 * Meta não envia nada e não há erro em lugar nenhum — o sintoma é um
 * inbox que simplesmente nunca recebe.
 */
export async function subscribePageToWebhooks(
  pageId: string,
  pageToken: string,
  fields: string[] = PAGE_WEBHOOK_FIELDS,
): Promise<SubscribeResult> {
  if (!pageId || !pageToken) {
    return {
      success: false,
      fields: [],
      error: {
        code: "config_missing",
        message:
          "Sem a Página vinculada e o token dela não dá para assinar os eventos. Verifique se o token de System User tem a Página nos ativos e a permissão pages_show_list.",
      },
    }
  }

  try {
    const res = await fetch(
      `${BASE_URL}/${pageId}/subscribed_apps?subscribed_fields=${fields.join(",")}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${pageToken}` },
      },
    )
    const data = await res.json().catch(() => ({}))

    if (res.ok && !data.error) return { success: true, fields }

    // Campo desconhecido para este app: tenta o mínimo antes de desistir.
    if (fields !== PAGE_WEBHOOK_FIELDS_MINIMAL && /subscribed_fields|invalid/i.test(data.error?.message || "")) {
      log.warn("[Instagram] campos recusados — tentando o mínimo", { error: data.error })
      return subscribePageToWebhooks(pageId, pageToken, PAGE_WEBHOOK_FIELDS_MINIMAL)
    }

    log.error("[Instagram] subscribed_apps falhou", { status: res.status, error: data.error })
    return {
      success: false,
      fields: [],
      error: friendlySendError(res.status, data),
    }
  } catch (err) {
    return {
      success: false,
      fields: [],
      error: {
        code: "network_error",
        message: err instanceof Error ? err.message : "Network error",
      },
    }
  }
}

export interface AppSubscriptionCheck {
  /** Deu pra consultar? (precisa de META_APP_ID + META_APP_SECRET) */
  checked: boolean
  /** Existe assinatura do objeto `instagram` com o campo `messages`. */
  instagram_messages: boolean
  /** Existe assinatura do campo `comments`. */
  instagram_comments: boolean
  /** URL de callback que a Meta tem registrada — compare com a sua. */
  callback_url: string | null
  /** Objetos assinados no app (instagram, page...). */
  objects: string[]
  error?: { code: string; message: string }
}

/**
 * O que o APP tem assinado — a camada ACIMA da Página.
 *
 * Assinar a Página diz "entregue os eventos desta conta"; a assinatura
 * do app diz "deste objeto, destes campos, nesta URL". As duas precisam
 * existir, e só a segunda é feita à mão no painel — então quando a
 * Página está assinada e nada chega, é aqui que está o buraco. Sem esta
 * consulta o diagnóstico vira tentativa e erro no painel da Meta.
 *
 * Usa app access token (`{app-id}|{app-secret}`), que não expira.
 */
export async function getAppWebhookSubscriptions(): Promise<AppSubscriptionCheck> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET
  const vazio: AppSubscriptionCheck = {
    checked: false,
    instagram_messages: false,
    instagram_comments: false,
    callback_url: null,
    objects: [],
  }
  if (!appId || !appSecret) {
    return {
      ...vazio,
      error: {
        code: "config_missing",
        message:
          "Defina META_APP_ID e META_APP_SECRET no servidor para eu conseguir checar a assinatura do app.",
      },
    }
  }

  try {
    const res = await fetch(
      `${BASE_URL}/${appId}/subscriptions?access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      { cache: "no-store" },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) {
      return { ...vazio, error: friendlySendError(res.status, data) }
    }

    const rows = (data.data ?? []) as Array<{
      object?: string
      callback_url?: string
      active?: boolean
      fields?: Array<{ name?: string }>
    }>
    const ig = rows.find((r) => r.object === "instagram")
    const nomes = (ig?.fields ?? []).map((f) => f.name)

    return {
      checked: true,
      instagram_messages: Boolean(ig?.active) && nomes.includes("messages"),
      instagram_comments: Boolean(ig?.active) && nomes.includes("comments"),
      callback_url: ig?.callback_url ?? null,
      objects: rows.map((r) => r.object ?? "?"),
    }
  } catch (err) {
    return {
      ...vazio,
      error: { code: "network_error", message: err instanceof Error ? err.message : "Network error" },
    }
  }
}

/** O que a Página tem assinado hoje — diagnóstico honesto pra tela. */
export async function getPageWebhookSubscription(
  pageId: string,
  pageToken: string,
): Promise<{ subscribed: boolean; fields: string[]; error?: { code: string; message: string } }> {
  if (!pageId || !pageToken) {
    return { subscribed: false, fields: [], error: { code: "config_missing", message: "Página ou token ausente" } }
  }
  try {
    const res = await fetch(`${BASE_URL}/${pageId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${pageToken}` },
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) {
      return { subscribed: false, fields: [], error: friendlySendError(res.status, data) }
    }
    const apps = (data.data ?? []) as Array<{ subscribed_fields?: string[] }>
    const fields = apps.flatMap((a) => a.subscribed_fields ?? [])
    return { subscribed: apps.length > 0, fields }
  } catch (err) {
    return {
      subscribed: false,
      fields: [],
      error: { code: "network_error", message: err instanceof Error ? err.message : "Network error" },
    }
  }
}

/**
 * Esconde/exibe um comentario.
 * Endpoint: POST /{comment-id}?hide=true|false
 */
export async function setInstagramCommentHidden(
  config: InstagramChannelConfig,
  commentId: string,
  hide: boolean,
): Promise<SendResult> {
  if (!config.access_token) {
    return {
      success: false,
      error: { code: "config_missing", message: "Channel config missing access_token" },
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/${commentId}?hide=${hide}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
      },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return {
        success: false,
        error: {
          code: res.status.toString(),
          message: data.error?.message || "Failed to update comment",
        },
      }
    }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: {
        code: "network_error",
        message: err instanceof Error ? err.message : "Error",
      },
    }
  }
}
