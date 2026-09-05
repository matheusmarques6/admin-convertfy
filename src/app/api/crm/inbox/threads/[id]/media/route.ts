/**
 * Mídia do inbox WhatsApp.
 *
 * POST (multipart: file, media_type, caption?) — valida tamanho/MIME
 * contra os limites da Meta, sobe em paralelo pro Storage (bucket
 * whatsapp-media) e pro /media da Meta, envia por media_id e persiste
 * em crm_messages com signed URL (1h) + storage_path.
 *
 * GET ?message_id= — refresh da signed URL. Trata legado: mensagem sem
 * storage_path mas com metadata.wa_media_id ou media_url "wa-media:{id}"
 * tenta baixar da Meta on-demand (media_id expira ~30d → 410 se foi).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { assertThreadInOrg } from "@/lib/crm/inbox-thread-guard"
import { clearCrmThreadNotifications } from "@/lib/services/crm-inbox-notification.service"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { loadWhatsAppChannel } from "@/lib/whatsapp/channel-config"
import { loadChannelClient, markEvolutionDisconnected } from "@/lib/whatsapp/channel-client"
import { EvolutionAPIError, type EvolutionSendResult } from "@/lib/whatsapp/evolution-api"
import { WhatsAppCloudError, type SendMessageResult } from "@/lib/whatsapp/cloud-api"
import {
  MEDIA_BUCKET,
  createSignedUrl,
  extForMime,
  persistBase64Media,
  persistInboundMedia,
  validateMediaFile,
} from "@/lib/whatsapp/media"

const log = logger.child("CrmInboxMedia")

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

interface ThreadWithChannel {
  id: string
  org_id: string
  contact_external_id: string
  is_window_open: boolean | null
  window_expires_at: string | null
  channel_id: string
  channel:
    | { id: string; type: string; provider: string | null }
    | Array<{ id: string; type: string; provider: string | null }>
    | null
}

async function getWhatsAppThread(
  admin: ReturnType<typeof createAdminClient>,
  threadId: string,
): Promise<ThreadWithChannel> {
  const { data: thread } = await admin
    .from("crm_threads")
    .select(
      "id, org_id, contact_external_id, is_window_open, window_expires_at, channel_id, channel:crm_channels (id, type, provider)",
    )
    .eq("id", threadId)
    .maybeSingle<ThreadWithChannel>()

  if (!thread) throw new AppError("Thread nao encontrada", 404, "not-found")
  const channelType = Array.isArray(thread.channel) ? thread.channel[0]?.type : thread.channel?.type
  if (channelType !== "whatsapp") {
    throw new AppError("Envio de mídia só é suportado em canais WhatsApp", 400, "channel-unsupported")
  }
  return thread
}

function threadChannelProvider(thread: ThreadWithChannel): string | null {
  const channel = Array.isArray(thread.channel) ? thread.channel[0] : thread.channel
  return channel?.provider ?? null
}

// ── POST: upload + envio ────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: threadId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const thread = await getWhatsAppThread(admin, threadId)
    assertThreadInOrg(thread.org_id, await resolveOrgId(user.id))
    const isEvolution = threadChannelProvider(thread) === "evolution"

    // Mídia é sempre free-form → precisa de janela aberta.
    // Evolution (Baileys) não tem janela de 24h — gate só no cloud.
    if (!isEvolution) {
      const windowOpen =
        Boolean(thread.is_window_open) &&
        Boolean(thread.window_expires_at) &&
        new Date(thread.window_expires_at as string).getTime() > Date.now()
      if (!windowOpen) {
        throw new AppError(
          "Janela de 24h expirada — envie um template aprovado pra reabrir a conversa.",
          422,
          "WINDOW_EXPIRED",
        )
      }
    }

    const formData = await request.formData()
    const file = formData.get("file")
    const mediaType = (formData.get("media_type") as string) || "document"
    const caption = (formData.get("caption") as string) || ""

    if (!(file instanceof File)) {
      throw new AppError("file obrigatório (multipart/form-data)", 400, "validation")
    }
    if (!["image", "video", "audio", "document"].includes(mediaType)) {
      throw new AppError("media_type inválido (image|video|audio|document)", 400, "validation")
    }

    const validation = validateMediaFile(file, mediaType)
    if (!validation.valid) {
      throw new AppError(validation.error, 422, "media-validation")
    }

    // ── Evolution: arquivo → base64 → sendMedia/sendAudio ──────────
    if (isEvolution) {
      const limited = await checkRateLimit(request, `evo-send:${thread.channel_id}`, {
        limit: 8,
        windowSeconds: 60,
      })
      if (limited) return limited

      const loadedEvo = await loadChannelClient(admin, { channelId: thread.channel_id })
      if (!loadedEvo || loadedEvo.provider !== "evolution") {
        throw new AppError("Canal Evolution indisponível — verifique a configuração do servidor.", 422, "channel-config")
      }

      const fileData = await file.arrayBuffer()
      const storagePath = `${thread.org_id}/${threadId}/${crypto.randomUUID()}.${extForMime(file.type)}`
      const { error: storageError } = await admin.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, fileData, { contentType: file.type, upsert: false })
      const storageOk = !storageError
      if (!storageOk) {
        log.warn("upload pro Storage falhou (mensagem segue sem histórico local)", {
          threadId,
          error: storageError?.message,
        })
      }

      const base64 = Buffer.from(fileData).toString("base64")
      const to = thread.contact_external_id
      let sent: EvolutionSendResult
      try {
        if (mediaType === "audio") {
          sent = await loadedEvo.client.sendAudio(to, base64)
        } else {
          sent = await loadedEvo.client.sendMedia(to, {
            mediatype: mediaType as "image" | "video" | "document",
            media: base64,
            mimetype: file.type,
            caption: caption || undefined,
            fileName: file.name,
          })
        }
      } catch (err) {
        const isDisconnected =
          err instanceof EvolutionAPIError && (err.isNotConnected() || err.isInstanceNotFound())
        if (isDisconnected) await markEvolutionDisconnected(admin, loadedEvo.channel)
        const message = isDisconnected
          ? "Instância do WhatsApp desconectada — reconecte pelo QR em Canais."
          : err instanceof Error
            ? err.message
            : "Envio falhou"
        await admin.from("crm_messages").insert({
          thread_id: threadId,
          org_id: thread.org_id,
          direction: "outbound",
          content_type: mediaType,
          body: caption || null,
          media_storage_path: storageOk ? storagePath : null,
          media_mime: file.type,
          media_filename: file.name,
          media_size: file.size,
          sent_by: user.id,
          sent_by_kind: "agent",
          status: "failed",
          error_code: isDisconnected ? "INSTANCE_DISCONNECTED" : "evolution_error",
          error_message: message,
        })
        throw new AppError(message, 502, "evolution-send")
      }

      const signedUrl = storageOk ? await createSignedUrl(admin, storagePath) : null

      const { data: localMsg, error: insertError } = await admin
        .from("crm_messages")
        .insert({
          thread_id: threadId,
          org_id: thread.org_id,
          external_id: sent.externalId,
          direction: "outbound",
          content_type: mediaType,
          body: caption || null,
          media_url: signedUrl,
          media_storage_path: storageOk ? storagePath : null,
          media_mime: file.type,
          media_filename: file.name,
          media_size: file.size,
          metadata: { evolution_key: { id: sent.externalId, remoteJid: sent.remoteJid } },
          sent_by: user.id,
          sent_by_kind: "agent",
          status: "sent",
          status_updated_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (insertError) throw insertError

      await admin.from("crm_threads").update({ unread_count: 0 }).eq("id", threadId)
      await clearCrmThreadNotifications(admin, threadId)

      return successResponse(request, {
        message_id: localMsg?.id,
        external_id: sent.externalId,
        media_url: signedUrl,
        sent: true,
      })
    }

    const loaded = await loadWhatsAppChannel(admin, { channelId: thread.channel_id })
    if (!loaded) {
      throw new AppError("Canal WhatsApp sem credenciais configuradas", 422, "channel-config")
    }

    const fileData = await file.arrayBuffer()
    const storagePath = `${thread.org_id}/${threadId}/${crypto.randomUUID()}.${extForMime(file.type)}`

    // Upload paralelo: Storage (histórico do inbox) + Meta /media (envio)
    const [storageResult, metaUpload] = await Promise.allSettled([
      admin.storage.from(MEDIA_BUCKET).upload(storagePath, fileData, { contentType: file.type, upsert: false }),
      loaded.client.uploadMedia(fileData, file.type, file.name),
    ])

    if (metaUpload.status === "rejected") {
      const err = metaUpload.reason
      const message = err instanceof WhatsAppCloudError ? err.message : "Upload pra Meta falhou"
      throw new AppError(message, 502, "meta-upload")
    }
    const mediaId = metaUpload.value.id

    const storageOk =
      storageResult.status === "fulfilled" && !storageResult.value.error
    if (!storageOk) {
      log.warn("upload pro Storage falhou (mensagem segue sem histórico local)", {
        threadId,
        error: storageResult.status === "fulfilled" ? storageResult.value.error?.message : String(storageResult.reason),
      })
    }

    // Envia por media_id
    let sent: SendMessageResult
    const to = thread.contact_external_id
    try {
      if (mediaType === "image") sent = await loaded.client.sendImage(to, { id: mediaId }, caption || undefined)
      else if (mediaType === "video") sent = await loaded.client.sendVideo(to, { id: mediaId }, caption || undefined)
      else if (mediaType === "audio") sent = await loaded.client.sendAudio(to, { id: mediaId })
      else sent = await loaded.client.sendDocument(to, { id: mediaId, filename: file.name }, caption || undefined)
    } catch (err) {
      const message = err instanceof WhatsAppCloudError ? err.message : "Envio falhou"
      const code = err instanceof WhatsAppCloudError ? String(err.code) : "network_error"
      // Persiste a tentativa como failed pro histórico
      await admin.from("crm_messages").insert({
        thread_id: threadId,
        org_id: thread.org_id,
        direction: "outbound",
        content_type: mediaType,
        body: caption || null,
        media_storage_path: storageOk ? storagePath : null,
        media_mime: file.type,
        media_filename: file.name,
        media_size: file.size,
        sent_by: user.id,
        sent_by_kind: "agent",
        status: "failed",
        error_code: code,
        error_message: message,
      })
      throw new AppError(message, 502, "meta-send")
    }

    const signedUrl = storageOk ? await createSignedUrl(admin, storagePath) : null

    const { data: localMsg, error: insertError } = await admin
      .from("crm_messages")
      .insert({
        thread_id: threadId,
        org_id: thread.org_id,
        external_id: sent.messages?.[0]?.id ?? null,
        direction: "outbound",
        content_type: mediaType,
        body: caption || null,
        media_url: signedUrl,
        media_storage_path: storageOk ? storagePath : null,
        media_mime: file.type,
        media_filename: file.name,
        media_size: file.size,
        metadata: { wa_media_id: mediaId },
        sent_by: user.id,
        sent_by_kind: "agent",
        status: "sent",
        status_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (insertError) throw insertError

    await admin.from("crm_threads").update({ unread_count: 0 }).eq("id", threadId)
    await clearCrmThreadNotifications(admin, threadId)

    return successResponse(request, {
      message_id: localMsg?.id,
      external_id: sent.messages?.[0]?.id,
      media_url: signedUrl,
      sent: true,
    })
  } catch (error) {
    log.error("Inbox media send error:", error)
    return errorResponse(request, error, "crm-inbox-media")
  }
}

// ── GET: refresh de signed URL (+ resolução lazy de mídia legada) ──
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: threadId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const messageId = request.nextUrl.searchParams.get("message_id")
    if (!messageId) throw new AppError("message_id obrigatório", 400, "validation")

    const { data: message } = await admin
      .from("crm_messages")
      .select("id, org_id, thread_id, media_url, media_storage_path, media_filename, metadata")
      .eq("id", messageId)
      .eq("thread_id", threadId)
      .maybeSingle()

    if (!message) throw new AppError("Mensagem não encontrada", 404, "not-found")
    assertThreadInOrg(message.org_id, orgId)

    // Caminho feliz: já tem storage_path → só renova a signed URL.
    // NÃO persiste: a URL assinada expira em 1h, então gravá-la só troca
    // uma URL morta por outra — e cada UPDATE em crm_messages vira evento
    // de realtime, que faz o detalhe recarregar em todas as abas com a
    // conversa aberta. O cliente usa a URL da resposta.
    if (message.media_storage_path) {
      const signedUrl = await createSignedUrl(admin, message.media_storage_path)
      if (!signedUrl) throw new AppError("Falha ao gerar URL", 500, "signed-url")
      return successResponse(request, { media_url: signedUrl })
    }

    // Evolution: mídia que falhou no processamento → tenta de novo via
    // getBase64FromMediaMessage (a Evolution guarda a mensagem um tempo).
    const evolutionKey = (message.metadata as { evolution_key?: { id?: string } } | null)?.evolution_key
    if (evolutionKey?.id) {
      const loadedEvo = await loadChannelClient(admin, { channelId: (await getWhatsAppThread(admin, threadId)).channel_id })
      if (!loadedEvo || loadedEvo.provider !== "evolution") {
        throw new AppError("Canal Evolution indisponível", 422, "channel-config")
      }
      const fetched = await loadedEvo.client.getBase64FromMediaMessage({ id: evolutionKey.id })
      if (!fetched) {
        throw new AppError("Mídia indisponível na Evolution (não recuperável)", 410, "media-expired")
      }
      const persisted = await persistBase64Media(admin, {
        orgId: message.org_id,
        threadId,
        base64: fetched.base64,
        mime: fetched.mimetype,
      })
      if (!persisted) throw new AppError("Falha ao persistir mídia", 500, "media-persist")
      await admin
        .from("crm_messages")
        .update({
          media_url: persisted.signedUrl,
          media_storage_path: persisted.storagePath,
          media_mime: persisted.mime,
          media_size: persisted.size,
        })
        .eq("id", message.id)
      return successResponse(request, { media_url: persisted.signedUrl })
    }

    // Legado: wa-media:{id} no media_url ou wa_media_id no metadata →
    // tenta baixar da Meta on-demand (pode já ter expirado: 410)
    const legacyId =
      (message.metadata as { wa_media_id?: string } | null)?.wa_media_id ??
      (typeof message.media_url === "string" && message.media_url.startsWith("wa-media:")
        ? message.media_url.slice("wa-media:".length)
        : null)

    if (!legacyId) throw new AppError("Mensagem sem mídia", 404, "no-media")

    const thread = await getWhatsAppThread(admin, threadId)
    const loaded = await loadWhatsAppChannel(admin, { channelId: thread.channel_id })
    if (!loaded) throw new AppError("Canal WhatsApp sem credenciais", 422, "channel-config")

    const persisted = await persistInboundMedia(admin, loaded.client, {
      orgId: message.org_id,
      threadId,
      mediaId: legacyId,
      filename: message.media_filename,
    })

    if (!persisted) {
      // media_id da Meta expira em ~30 dias — irrecuperável
      throw new AppError("Mídia expirada na Meta (não recuperável)", 410, "media-expired")
    }

    await admin
      .from("crm_messages")
      .update({
        media_url: persisted.signedUrl,
        media_storage_path: persisted.storagePath,
        media_mime: persisted.mime,
        media_size: persisted.size,
      })
      .eq("id", message.id)

    return successResponse(request, { media_url: persisted.signedUrl })
  } catch (error) {
    return errorResponse(request, error, "crm-inbox-media-refresh")
  }
}
