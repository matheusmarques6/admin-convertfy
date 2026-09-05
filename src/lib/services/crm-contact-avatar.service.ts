/**
 * Backfill da foto de perfil do contato da thread (crm_threads.
 * contact_avatar_url) — os webhooks não entregam a foto, então ela é
 * buscada sob demanda e PERSISTIDA:
 *
 *  - Instagram DM: Messaging Profile API (GET /{igsid}?fields=profile_pic)
 *  - WhatsApp via QR (Evolution): POST /chat/fetchProfilePictureUrl
 *  - WhatsApp Cloud (oficial): a Meta NÃO expõe foto de contato — skip.
 *  - Comentário de post: o "contato" é a publicação — skip (o card do
 *    post cobre a identidade visual).
 *
 * Chamado pelo detail (abertura da conversa) e em LOTE pelo after() da
 * lista — sem o lote, só conversa aberta ganhava foto e a lista ficava
 * de iniciais pra sempre. Cooldown in-memory por thread (15 min) segura
 * o custo quando a API não devolve foto e o polling segue batendo.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { createEvolutionClient } from "@/lib/whatsapp/evolution-api"
import { getEvolutionRuntimeConfig } from "@/lib/whatsapp/evolution-settings"
import {
  getInstagramUserProfilePic,
  type InstagramChannelConfig,
} from "@/lib/services/instagram-graph.service"

const log = logger.child("CrmContactAvatar")

const ATTEMPT_COOLDOWN_MS = 15 * 60 * 1000
const lastAttempt = new Map<string, number>()

interface ThreadForAvatar {
  id: string
  contact_external_id: string
  contact_avatar_url?: string | null
  /** Só o id é obrigatório — o canal é recarregado com config/external_id. */
  channel?: { id: string } | null
  channel_id?: string | null
}

function igConfigFromChannel(channel: {
  external_id?: string | null
  config: Record<string, unknown> | null
}): InstagramChannelConfig {
  const raw = (channel.config ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v ? v : null)
  return {
    instagram_business_account_id: channel.external_id || str(raw.instagram_business_account_id) || "",
    access_token: str(raw.access_token) || "",
    facebook_page_id: str(raw.facebook_page_id),
    facebook_page_token: str(raw.facebook_page_token),
  }
}

/**
 * Busca e persiste a foto do contato quando ainda não existe.
 * Retorna a URL nova (ou null quando não há/skip) — o chamador pode
 * sobrescrever a resposta com ela sem re-selecionar a thread.
 */
export async function ensureThreadAvatar(
  admin: SupabaseClient,
  thread: ThreadForAvatar,
): Promise<string | null> {
  if (thread.contact_avatar_url) return null
  const channelId = thread.channel?.id ?? thread.channel_id
  if (!channelId) return null
  if (thread.contact_external_id.startsWith("comment:")) return null

  const now = Date.now()
  const prev = lastAttempt.get(thread.id)
  if (prev && now - prev < ATTEMPT_COOLDOWN_MS) return null
  lastAttempt.set(thread.id, now)
  // Mapa não pode crescer sem limite num runtime quente.
  if (lastAttempt.size > 2000) {
    for (const [k, ts] of lastAttempt) {
      if (now - ts > ATTEMPT_COOLDOWN_MS) lastAttempt.delete(k)
    }
  }

  try {
    // Canal fresco com config/external_id — a lista não os expõe.
    const { data: ch } = await admin
      .from("crm_channels")
      .select("id, type, provider, external_id, config")
      .eq("id", channelId)
      .maybeSingle()
    if (!ch) {
      log.info("avatar: canal não encontrado", { threadId: thread.id, channelId })
      return null
    }

    let url: string | null = null

    if (ch.type === "instagram") {
      url = await getInstagramUserProfilePic(
        igConfigFromChannel(ch),
        thread.contact_external_id,
      )
      if (!url) {
        log.info("avatar: IG sem profile_pic (privacidade/permissão)", {
          threadId: thread.id,
          igsid: thread.contact_external_id,
        })
      }
    } else if (ch.type === "whatsapp" && ch.provider === "evolution") {
      const cfg = await getEvolutionRuntimeConfig(admin)
      if (!cfg || !ch.external_id) {
        log.info("avatar: Evolution sem config/instância", { threadId: thread.id })
        return null
      }
      const client = createEvolutionClient({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: ch.external_id,
      })
      const number = thread.contact_external_id.replace(/\D/g, "")
      if (!number) return null
      url = await client.fetchProfilePictureUrl(number)
      if (!url) {
        log.info("avatar: WhatsApp sem foto (privacidade)", { threadId: thread.id })
      }
    } else {
      // WhatsApp Cloud: sem API de foto de contato.
      return null
    }

    if (!url) return null

    const { error } = await admin
      .from("crm_threads")
      .update({ contact_avatar_url: url })
      .eq("id", thread.id)
    if (error) {
      log.warn("avatar: update falhou", { threadId: thread.id, error: error.message })
      return url // ainda serve pra resposta atual
    }
    log.info("avatar: preenchido", { threadId: thread.id, channelType: ch.type })
    return url
  } catch (err) {
    log.warn("avatar: fetch falhou", {
      threadId: thread.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
