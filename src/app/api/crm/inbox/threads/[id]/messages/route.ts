/**
 * POST /api/crm/inbox/threads/[id]/messages
 *
 * Envia uma mensagem via o channel da thread. Cria registro local
 * com status=queued e atualiza pra sent/failed apos resposta da API
 * do provedor.
 *
 * WhatsApp: enforcement da janela de 24h (fora da janela só template),
 * template validado contra crm_whatsapp_templates (status APPROVED +
 * contagem de variáveis), erros da Meta classificados (janela/template
 * pausado/auth) e rate limit por org.
 *
 * Body:
 *   { type: "text" | "image" | "document" | "audio" | "video" | "sticker" | "template", body?, ... }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { assertThreadInOrg } from "@/lib/crm/inbox-thread-guard"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { loadWhatsAppChannel, markChannelAuthError } from "@/lib/whatsapp/channel-config"
import { loadChannelClient, markEvolutionDisconnected } from "@/lib/whatsapp/channel-client"
import { EvolutionAPIError } from "@/lib/whatsapp/evolution-api"
import { WhatsAppCloudError, type SendMessageResult } from "@/lib/whatsapp/cloud-api"
import { validateTemplateVariables, buildTemplateBodyComponents, type TemplateForSend } from "@/lib/whatsapp/templates"
import {
  sendInstagramMessage,
  replyToInstagramComment,
  type InstagramChannelConfig,
} from "@/lib/services/instagram-graph.service"
import { resolveAndHealInstagramChannel } from "@/lib/services/instagram-activity.service"
import { clearCrmThreadNotifications } from "@/lib/services/crm-inbox-notification.service"

const log = logger.child("CrmInboxSend")

export const dynamic = "force-dynamic"

const sendSchema = z.object({
  type: z.enum(["text", "image", "document", "audio", "video", "sticker", "template"]).default("text"),
  body: z.string().min(1).max(4000).optional(),
  image_url: z.string().url().optional(),
  document_url: z.string().url().optional(),
  document_filename: z.string().optional(),
  audio_url: z.string().url().optional(),
  video_url: z.string().url().optional(),
  sticker_url: z.string().url().optional(),
  template_name: z.string().optional(),
  template_language: z.string().optional(),
  template_params: z.array(z.string()).max(20).optional(),
})

type Parsed = z.infer<typeof sendSchema>

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: threadId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = sendSchema.parse(body)

    if (parsed.type === "text" && !parsed.body) {
      throw new AppError("body obrigatorio para mensagens text", 400, "validation")
    }
    if (parsed.type === "template" && !parsed.template_name) {
      throw new AppError("template_name obrigatorio para mensagens template", 400, "validation")
    }

    // Le thread + channel
    type ChannelRow = {
      id: string
      type: string
      provider: string | null
      config: Record<string, unknown> | null
      external_id: string | null
      is_active: boolean
    }
    type ThreadRow = {
      id: string
      org_id: string
      contact_external_id: string
      is_window_open: boolean | null
      window_expires_at: string | null
      channel: ChannelRow | ChannelRow[] | null
    }

    const { data: thread } = await admin
      .from("crm_threads")
      .select(
        "id, org_id, contact_external_id, is_window_open, window_expires_at, channel:crm_channels (id, type, provider, config, external_id, is_active)",
      )
      .eq("id", threadId)
      .single<ThreadRow>()

    if (!thread) {
      throw new AppError("Conversa não encontrada", 404, "not-found")
    }
    assertThreadInOrg(thread.org_id, await resolveOrgId(user.id))

    const channel: ChannelRow | null = Array.isArray(thread.channel)
      ? (thread.channel[0] ?? null)
      : thread.channel
    if (!channel) {
      throw new AppError("Channel da thread nao encontrado", 404, "not-found")
    }
    if (channel.type !== "whatsapp" && channel.type !== "instagram") {
      throw new AppError(
        `Channel ${channel.type} nao suportado pra envio. Use whatsapp ou instagram.`,
        400,
        "channel-unsupported",
      )
    }
    // Conversa amarrada a canal removido (troca de instância): erro
    // acionável em vez do genérico "indisponível" — o operador resolve
    // sozinho com a importação, sem precisar de logs.
    if (!channel.is_active) {
      throw new AppError(
        "Esta conversa pertence a um canal DESATIVADO. Vá em Comercial → Canais e clique em \"Importar conversas antigas\" no canal ativo para migrá-la.",
        422,
        "channel-inactive",
      )
    }

    type SendResult = {
      success: boolean
      message_id?: string
      remote_jid?: string | null
      error?: { code: string; message: string }
    }
    let result: SendResult
    let localMsgId: string

    if (channel.type === "whatsapp" && channel.provider === "evolution") {
      // ── Evolution (Baileys, não-oficial) ─────────────────────────
      // Sem janela de 24h e sem templates Meta; throttle anti-ban por
      // CANAL (número), bem mais apertado que o da Cloud API.
      const limited = await checkRateLimit(request, `evo-send:${channel.id}`, {
        limit: 8,
        windowSeconds: 60,
      })
      if (limited) return limited

      if (parsed.type === "template") {
        throw new AppError(
          "Canal via QR (não-oficial) não usa templates Meta — envie texto livre.",
          422,
          "TEMPLATE_UNSUPPORTED",
        )
      }
      if (parsed.type === "sticker") {
        throw new AppError("Sticker não suportado no canal via QR.", 422, "unsupported_type")
      }

      const loaded = await loadChannelClient(admin, { channelId: channel.id })
      if (!loaded || loaded.provider !== "evolution") {
        throw new AppError(
          "Canal Evolution indisponível — verifique a configuração do servidor.",
          422,
          "channel-config",
        )
      }

      // Config diz que não está open → revalida live antes de recusar
      // (o webhook de connection.update pode ter se perdido).
      if (loaded.connectionState !== "open") {
        const live = await loaded.client.connectionState().catch(() => "unknown" as const)
        if (live !== "open") {
          throw new AppError(
            "Instância do WhatsApp desconectada — reconecte pelo QR em Canais.",
            422,
            "INSTANCE_DISCONNECTED",
          )
        }
      }

      localMsgId = await createLocalMessage(admin, { threadId, thread, parsed, userId: user.id })

      result = await sendEvolution(admin, {
        loaded,
        to: thread.contact_external_id,
        parsed,
      })
    } else if (channel.type === "whatsapp") {
      // Rate limit por org (80/s = limite de throughput da Cloud API).
      // Fail-open sem Redis configurado.
      const limited = await checkRateLimit(request, `wa-send:${thread.org_id}`, {
        limit: 80,
        windowSeconds: 1,
      })
      if (limited) return limited

      // Gate da janela de 24h ANTES de criar a mensagem local: fora da
      // janela a Meta rejeita free-form (131047) — só template inicia.
      if (parsed.type !== "template" && !isWindowOpen(thread)) {
        throw new AppError(
          "Janela de 24h expirada — envie um template aprovado pra reabrir a conversa.",
          422,
          "WINDOW_EXPIRED",
        )
      }

      const loaded = await loadWhatsAppChannel(admin, { channelId: channel.id })
      if (!loaded) {
        throw new AppError("Canal WhatsApp sem credenciais configuradas", 422, "channel-config")
      }

      // Template: valida contra a tabela sincronizada (aprovação + variáveis)
      let templateComponents: unknown[] = []
      let templateRow: TemplateForSend | null = null
      if (parsed.type === "template") {
        const { data: tpl } = await admin
          .from("crm_whatsapp_templates")
          .select("id, name, language, status, category, body_text, body_variables")
          .eq("channel_id", channel.id)
          .eq("name", parsed.template_name!)
          .eq("language", parsed.template_language || "pt_BR")
          .maybeSingle<TemplateForSend>()

        if (!tpl) {
          throw new AppError(
            `Template "${parsed.template_name}" não encontrado — sincronize os templates do canal.`,
            422,
            "template-not-found",
          )
        }
        if (tpl.status !== "APPROVED") {
          throw new AppError(
            `Template "${tpl.name}" não está aprovado na Meta (status: ${tpl.status})`,
            422,
            "template-not-approved",
          )
        }
        const validation = validateTemplateVariables(tpl, parsed.template_params ?? [])
        if (!validation.valid) {
          throw new AppError(validation.error, 422, "template-params")
        }
        templateComponents = buildTemplateBodyComponents(parsed.template_params ?? [])
        templateRow = tpl
      }

      // Cria mensagem local primeiro (status=queued)
      localMsgId = await createLocalMessage(admin, { threadId, thread, parsed, userId: user.id })

      result = await sendWhatsApp(admin, {
        loaded,
        channel,
        to: thread.contact_external_id,
        parsed,
        templateComponents,
      })

      // Uso do template (contador informal pra UI ordenar por mais usados)
      if (result.success && templateRow) {
        await admin
          .from("crm_whatsapp_templates")
          .update({ use_count: (await currentUseCount(admin, templateRow.id)) + 1, last_used_at: new Date().toISOString() })
          .eq("id", templateRow.id)
      }
    } else {
      // ── Instagram ────────────────────────────────────────────────
      // Quem serve mensagem no login por Facebook é a PÁGINA, com token
      // DE PÁGINA. A leitura (importação de conversas) já tinha migrado
      // pra esse caminho; o envio ficou no IG User + token do canal e
      // por isso a Meta recusava — 190 "must be called with a Page
      // Access Token" ou #3. Aqui o config carrega os dois caminhos e o
      // cliente tenta Página primeiro, IG User de fallback.
      localMsgId = await createLocalMessage(admin, { threadId, thread, parsed, userId: user.id })

      const igConfig = await resolveInstagramSendConfig(admin, channel)
      const isCommentThread = thread.contact_external_id.startsWith("comment:")
      if (isCommentThread) {
        // Reply de comment: precisa do comment_id do parent. Buscamos
        // o ultimo comment inbound da thread e respondemos a ele.
        const { data: lastInbound } = await admin
          .from("crm_messages")
          .select("metadata")
          .eq("thread_id", threadId)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        const commentId =
          (lastInbound?.metadata as { comment_id?: string } | null)?.comment_id
        if (!commentId) {
          result = {
            success: false,
            error: {
              code: "no_parent_comment",
              message: "Nao encontrei comentario pai pra responder",
            },
          }
        } else if (parsed.type !== "text" || !parsed.body) {
          result = {
            success: false,
            error: {
              code: "invalid_payload",
              message: "Replies de comment so suportam texto",
            },
          }
        } else {
          result = await replyToInstagramComment(igConfig, commentId, parsed.body)
        }
      } else if (parsed.type === "text" && parsed.body) {
        result = await sendInstagramMessage(igConfig, {
          to: thread.contact_external_id,
          type: "text",
          text: { body: parsed.body },
        })
      } else if (parsed.type === "image" && parsed.image_url) {
        result = await sendInstagramMessage(igConfig, {
          to: thread.contact_external_id,
          type: "image",
          image: { url: parsed.image_url },
        })
      } else {
        result = {
          success: false,
          error: {
            code: "invalid_payload",
            message: "Instagram suporta text e image apenas",
          },
        }
      }
    }

    if (result.success) {
      await admin
        .from("crm_messages")
        .update({
          external_id: result.message_id,
          status: "sent",
          status_updated_at: new Date().toISOString(),
          // Evolution: guarda a key pro markAsRead e reconciliação de JID
          ...(result.remote_jid
            ? { metadata: { evolution_key: { id: result.message_id, remoteJid: result.remote_jid } } }
            : {}),
        })
        .eq("id", localMsgId)
    } else {
      await admin
        .from("crm_messages")
        .update({
          status: "failed",
          error_code: result.error?.code,
          error_message: result.error?.message,
        })
        .eq("id", localMsgId)
      log.error(`[Inbox] ${channel.type} send failed`, result.error)
    }

    // Reseta unread (agente respondeu) + limpa notificações do sino
    await admin.from("crm_threads").update({ unread_count: 0 }).eq("id", threadId)
    await clearCrmThreadNotifications(admin, threadId)

    // Falha do provedor tem de sair como ERRO HTTP. Enquanto isso saía
    // como 200 com `sent: false`, nenhum cliente lia o campo: o
    // composer limpava a caixa e o atendente só descobria a rejeição
    // (token expirado, número inválido, instância caída, janela do
    // Instagram) quando a bolha vermelha aparecia no refresh seguinte —
    // se estivesse olhando. A mensagem local já ficou gravada como
    // `failed` acima, então o histórico continua íntegro e o botão
    // Reenviar aparece normalmente.
    if (!result.success) {
      throw new AppError(
        result.error?.message || "O provedor recusou o envio da mensagem.",
        502,
        result.error?.code || "send-failed",
      )
    }

    return successResponse(request, {
      message_id: localMsgId,
      sent: true,
    })
  } catch (error) {
    log.error("Inbox send error:", error)
    return errorResponse(request, error, "crm-inbox-send")
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Config de envio do Instagram, com auto-cura do vínculo da Página.
 *
 * Canal conectado antes da migração para o caminho da Página não tem
 * `facebook_page_token` no config. Em vez de falhar (e mandar o operador
 * reconectar a conta), descobrimos a Página pelo próprio token e
 * persistimos — a mesma rotina que a importação de conversas usa. Roda
 * só quando o token de Página falta: envio é caminho quente e não pode
 * pagar duas chamadas à Graph API por mensagem.
 */
async function resolveInstagramSendConfig(
  admin: ReturnType<typeof createAdminClient>,
  channel: { id: string; external_id: string | null; config: Record<string, unknown> | null },
): Promise<InstagramChannelConfig> {
  const raw = (channel.config ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v ? v : null)

  const base: InstagramChannelConfig = {
    instagram_business_account_id:
      channel.external_id || str(raw.instagram_business_account_id) || "",
    access_token: str(raw.access_token) || "",
    facebook_page_id: str(raw.facebook_page_id),
    facebook_page_token: str(raw.facebook_page_token),
  }

  if (base.facebook_page_token || !base.access_token) return base

  try {
    const healed = await resolveAndHealInstagramChannel(
      admin,
      { id: channel.id, external_id: channel.external_id ?? "" },
      raw,
      { instagram_business_account_id: base.instagram_business_account_id, access_token: base.access_token },
    )
    return {
      ...base,
      instagram_business_account_id: healed.config.instagram_business_account_id,
      facebook_page_id: healed.pageId,
      facebook_page_token: healed.pageToken,
    }
  } catch (err) {
    // Cura é oportunista: se a Graph API estiver fora do ar, ainda vale
    // tentar o caminho do IG User com o token do canal.
    log.warn("[Inbox] auto-cura do canal Instagram falhou no envio", {
      channelId: channel.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return base
  }
}

function isWindowOpen(thread: { is_window_open: boolean | null; window_expires_at: string | null }): boolean {
  if (!thread.is_window_open) return false
  if (!thread.window_expires_at) return false
  return new Date(thread.window_expires_at).getTime() > Date.now()
}

async function createLocalMessage(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    threadId: string
    thread: { org_id: string }
    parsed: Parsed
    userId: string
  },
): Promise<string> {
  const { parsed } = args
  const mediaUrl =
    parsed.image_url || parsed.document_url || parsed.audio_url || parsed.video_url || parsed.sticker_url || null

  const { data: localMsg, error: createErr } = await admin
    .from("crm_messages")
    .insert({
      thread_id: args.threadId,
      org_id: args.thread.org_id,
      direction: "outbound",
      content_type: parsed.type,
      body: parsed.body || (parsed.type === "template" ? `[template: ${parsed.template_name}]` : null),
      media_url: mediaUrl,
      sent_by: args.userId,
      sent_by_kind: "agent",
      status: "queued",
    })
    .select("id")
    .single()

  if (createErr || !localMsg) throw createErr || new Error("Falha ao criar mensagem")
  return localMsg.id
}

async function sendWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    loaded: NonNullable<Awaited<ReturnType<typeof loadWhatsAppChannel>>>
    channel: { id: string }
    to: string
    parsed: Parsed
    templateComponents: unknown[]
  },
): Promise<{ success: boolean; message_id?: string; error?: { code: string; message: string } }> {
  const { loaded, to, parsed } = args
  const client = loaded.client

  try {
    let sent: SendMessageResult
    switch (parsed.type) {
      case "text":
        sent = await client.sendText(to, parsed.body!)
        break
      case "image":
        sent = await client.sendImage(to, { link: parsed.image_url! }, parsed.body)
        break
      case "document":
        sent = await client.sendDocument(to, { link: parsed.document_url!, filename: parsed.document_filename }, parsed.body)
        break
      case "audio":
        sent = await client.sendAudio(to, { link: parsed.audio_url! })
        break
      case "video":
        sent = await client.sendVideo(to, { link: parsed.video_url! }, parsed.body)
        break
      case "sticker":
        sent = await client.sendSticker(to, { link: parsed.sticker_url! })
        break
      case "template":
        sent = await client.sendTemplate(
          to,
          parsed.template_name!,
          parsed.template_language || "pt_BR",
          args.templateComponents,
        )
        break
      default:
        return { success: false, error: { code: "unsupported_type", message: `Tipo ${parsed.type} não suportado` } }
    }
    return { success: true, message_id: sent.messages?.[0]?.id }
  } catch (err) {
    if (err instanceof WhatsAppCloudError) {
      // Efeitos colaterais por classe de erro
      if (err.isTemplatePaused() || err.isTemplateDisabled()) {
        await admin
          .from("crm_whatsapp_templates")
          .update({ status: err.isTemplatePaused() ? "PAUSED" : "DISABLED", synced_at: new Date().toISOString() })
          .eq("channel_id", args.channel.id)
          .eq("name", parsed.template_name ?? "")
      }
      if (err.isAuthError()) {
        await markChannelAuthError(admin, loaded.channel, err)
      }
      const friendly = err.isWindowExpired()
        ? "Janela de 24h expirada — envie um template aprovado."
        : err.message
      return { success: false, error: { code: String(err.code), message: friendly } }
    }
    return {
      success: false,
      error: { code: "network_error", message: err instanceof Error ? err.message : "Network error" },
    }
  }
}

async function sendEvolution(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    loaded: Extract<NonNullable<Awaited<ReturnType<typeof loadChannelClient>>>, { provider: "evolution" }>
    to: string
    parsed: Parsed
  },
): Promise<{
  success: boolean
  message_id?: string
  remote_jid?: string | null
  error?: { code: string; message: string }
}> {
  const { loaded, to, parsed } = args
  const client = loaded.client

  try {
    let sent: Awaited<ReturnType<typeof client.sendText>>
    switch (parsed.type) {
      case "text":
        sent = await client.sendText(to, parsed.body!)
        break
      case "image":
        sent = await client.sendMedia(to, {
          mediatype: "image",
          media: parsed.image_url!,
          caption: parsed.body,
        })
        break
      case "video":
        sent = await client.sendMedia(to, {
          mediatype: "video",
          media: parsed.video_url!,
          caption: parsed.body,
        })
        break
      case "document":
        sent = await client.sendMedia(to, {
          mediatype: "document",
          media: parsed.document_url!,
          fileName: parsed.document_filename,
          caption: parsed.body,
        })
        break
      case "audio":
        sent = await client.sendAudio(to, parsed.audio_url!)
        break
      default:
        return { success: false, error: { code: "unsupported_type", message: `Tipo ${parsed.type} não suportado` } }
    }
    return { success: true, message_id: sent.externalId, remote_jid: sent.remoteJid }
  } catch (err) {
    if (err instanceof EvolutionAPIError) {
      if (err.isNotConnected() || err.isInstanceNotFound()) {
        await markEvolutionDisconnected(admin, loaded.channel)
        return {
          success: false,
          error: {
            code: "INSTANCE_DISCONNECTED",
            message: "Instância do WhatsApp desconectada — reconecte pelo QR em Canais.",
          },
        }
      }
      return { success: false, error: { code: String(err.status ?? "evolution_error"), message: err.message } }
    }
    return {
      success: false,
      error: { code: "network_error", message: err instanceof Error ? err.message : "Network error" },
    }
  }
}

async function currentUseCount(
  admin: ReturnType<typeof createAdminClient>,
  templateId: string,
): Promise<number> {
  const { data } = await admin
    .from("crm_whatsapp_templates")
    .select("use_count")
    .eq("id", templateId)
    .maybeSingle()
  return (data?.use_count as number | null) ?? 0
}
