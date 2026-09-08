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
 * Chamado pelo detail (abertura da conversa) e pelo cron
 * `crm-avatar-backfill` — sem o lote, só conversa aberta ganhava foto e
 * a lista ficava de iniciais pra sempre. Cooldown in-memory por thread
 * (15 min) segura o custo quando a API não devolve foto e o polling
 * segue batendo.
 *
 * A URL que a Meta e a Evolution devolvem é do CDN delas e EXPIRA (a do
 * Instagram carrega `oe=<unix hex>`; as duas gravadas em produção
 * venceram em 31/08/2026 e viraram imagem quebrada na lista). Por isso a
 * foto é REGRAVADA no nosso Storage e o que vai para o banco é a URL
 * servida pelo admin — mesmo padrão do módulo Conteúdo
 * (`conteudo-perfis.service.ts`), que já tinha batido nesta pedra.
 * Espelho que falha degrada para a URL externa: foto que vence em dias
 * é melhor que iniciais hoje.
 */

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { createEvolutionClient } from "@/lib/whatsapp/evolution-api"
import { getEvolutionRuntimeConfig } from "@/lib/whatsapp/evolution-settings"
import {
  CONVERTIA_IMAGE_BUCKET,
  CONVERTIA_IMAGE_ROUTE,
  convertiaImageUrl,
} from "@/lib/ai/convertia-image-url"
import {
  getInstagramUserProfilePic,
  type InstagramChannelConfig,
} from "@/lib/services/instagram-graph.service"
import { canalPodeEntregarFoto } from "@/lib/crm/avatar-elegibilidade"

const log = logger.child("CrmContactAvatar")

const ATTEMPT_COOLDOWN_MS = 15 * 60 * 1000
const lastAttempt = new Map<string, number>()

interface ThreadForAvatar {
  id: string
  org_id: string
  contact_external_id: string
  contact_avatar_url?: string | null
  /** Só o id é obrigatório — o canal é recarregado com config/external_id. */
  channel?: { id: string } | null
  channel_id?: string | null
}

/**
 * Foto já espelhada por nós? URL de CDN de terceiro é temporária e tem
 * de ser re-buscada; a nossa não expira.
 */
export function isMirroredAvatar(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(CONVERTIA_IMAGE_ROUTE)
}

/**
 * Baixa a foto e regrava no bucket do admin. Devolve a URL servida por
 * nós, ou null quando não deu (a foto externa segue valendo).
 */
async function espelharAvatar(
  admin: SupabaseClient,
  orgId: string,
  threadId: string,
  url: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      log.info("avatar: origem recusou o download", { threadId, status: res.status })
      return null
    }
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(256, 256, { fit: "cover" })
      .png()
      .toBuffer()
    // Path fixo por thread: re-espelhar sobrescreve em vez de acumular.
    const path = `stores/org-${orgId}/email-assets/avatar-thread-${threadId}.png`
    const { error } = await admin.storage
      .from(CONVERTIA_IMAGE_BUCKET)
      .upload(path, png, { contentType: "image/png", upsert: true })
    if (error) {
      log.warn("avatar: upload falhou", { threadId, error: error.message })
      return null
    }
    return convertiaImageUrl(path)
  } catch (err) {
    log.warn("avatar: espelho falhou", {
      threadId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
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

export interface AvatarResult {
  /** URL final (nossa, ou a externa quando o espelho falhou). */
  url: string | null
  /**
   * A origem foi de fato consultada. `false` = não deu para tentar
   * (canal desconectado, sem credencial, cooldown) — o chamador NÃO
   * deve queimar a janela de re-tentativa, senão a foto só apareceria
   * uma semana depois de o canal voltar.
   */
  tentou: boolean
}

const NAO_TENTOU: AvatarResult = { url: null, tentou: false }

/**
 * Busca e persiste a foto do contato quando ainda não existe (ou quando
 * a que existe é de CDN de terceiro e vence).
 */
export async function ensureThreadAvatar(
  admin: SupabaseClient,
  thread: ThreadForAvatar,
): Promise<AvatarResult> {
  // Foto de CDN de terceiro é re-buscada: ela vence. Só a nossa encerra.
  if (isMirroredAvatar(thread.contact_avatar_url)) {
    return { url: thread.contact_avatar_url ?? null, tentou: false }
  }
  const channelId = thread.channel?.id ?? thread.channel_id
  if (!channelId) return NAO_TENTOU
  // O "contato" é a publicação, não uma pessoa — não há foto de perfil.
  if (thread.contact_external_id.startsWith("comment:")) return NAO_TENTOU

  const now = Date.now()
  const prev = lastAttempt.get(thread.id)
  if (prev && now - prev < ATTEMPT_COOLDOWN_MS) return NAO_TENTOU
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
      return NAO_TENTOU
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
      // Instância deslogada não consulta perfil: a foto vem da sessão do
      // WhatsApp. Sair aqui sem gastar a tentativa é o que faz as fotos
      // aparecerem na primeira rodada DEPOIS de religar o número, e não
      // uma semana depois.
      if (!canalPodeEntregarFoto(ch)) {
        log.info("avatar: canal não entrega foto agora", {
          threadId: thread.id,
          estado: (ch.config as Record<string, unknown> | null)?.connection_state,
        })
        return NAO_TENTOU
      }
      const cfg = await getEvolutionRuntimeConfig(admin)
      if (!cfg || !ch.external_id) {
        log.info("avatar: Evolution sem config/instância", { threadId: thread.id })
        return NAO_TENTOU
      }
      const client = createEvolutionClient({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        instanceName: ch.external_id,
      })
      const number = thread.contact_external_id.replace(/\D/g, "")
      if (!number) return NAO_TENTOU
      url = await client.fetchProfilePictureUrl(number)
      if (!url) {
        log.info("avatar: WhatsApp sem foto (privacidade)", { threadId: thread.id })
      }
    } else {
      // WhatsApp Cloud: a Meta não expõe foto de contato. Conta como
      // tentativa — não existe caminho, não adianta voltar amanhã.
      return { url: null, tentou: true }
    }

    if (!url) return { url: null, tentou: true }

    const mirrored = await espelharAvatar(admin, thread.org_id, thread.id, url)
    const finalUrl = mirrored ?? url

    // Escrita evitada = evento de realtime evitado × abas: só grava se
    // mudou (re-espelho devolve sempre o mesmo path).
    if (finalUrl === thread.contact_avatar_url) return { url: finalUrl, tentou: true }

    const { error } = await admin
      .from("crm_threads")
      .update({ contact_avatar_url: finalUrl })
      .eq("id", thread.id)
    if (error) {
      log.warn("avatar: update falhou", { threadId: thread.id, error: error.message })
      return { url: finalUrl, tentou: true } // ainda serve pra resposta atual
    }
    log.info("avatar: preenchido", {
      threadId: thread.id,
      channelType: ch.type,
      espelhado: Boolean(mirrored),
    })
    return { url: finalUrl, tentou: true }
  } catch (err) {
    // Falha de rede/API é transitória: não queima a janela.
    log.warn("avatar: fetch falhou", {
      threadId: thread.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NAO_TENTOU
  }
}
