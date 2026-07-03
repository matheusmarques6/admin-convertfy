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
import { logger } from "@/lib/logger"
import { loadWhatsAppChannel } from "@/lib/whatsapp/channel-config"
import { WhatsAppCloudError, type SendMessageResult } from "@/lib/whatsapp/cloud-api"
import {
  MEDIA_BUCKET,
  createSignedUrl,
  extForMime,
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
  channel: { id: string; type: string } | Array<{ id: string; type: string }> | null
}

async function getWhatsAppThread(
  admin: ReturnType<typeof createAdminClient>,
  threadId: string,
): Promise<ThreadWithChannel> {
  const { data: thread } = await admin
    .from("crm_threads")
    .select(
      "id, org_id, contact_external_id, is_window_open, window_expires_at, channel_id, channel:crm_channels (id, type)",
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

    // Mídia é sempre free-form → precisa de janela aberta
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
    await requireAuth(sb)
    const admin = createAdminClient()

    const messageId = request.nextUrl.searchParams.get("message_id")
    if (!messageId) throw new AppError("message_id obrigatório", 400, "validation")

    const { data: message } = await admin
      .from("crm_messages")
      .select("id, org_id, thread_id, media_url, media_storage_path, media_filename, metadata")
      .eq("id", messageId)
      .eq("thread_id", threadId)
      .maybeSingle()

    if (!message) throw new AppError("Mensagem nao encontrada", 404, "not-found")

    // Caminho feliz: já tem storage_path → só renova a signed URL
    if (message.media_storage_path) {
      const signedUrl = await createSignedUrl(admin, message.media_storage_path)
      if (!signedUrl) throw new AppError("Falha ao gerar URL", 500, "signed-url")
      await admin.from("crm_messages").update({ media_url: signedUrl }).eq("id", message.id)
      return successResponse(request, { media_url: signedUrl })
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
