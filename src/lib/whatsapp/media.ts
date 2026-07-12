/**
 * Mídia WhatsApp ↔ Supabase Storage (bucket privado whatsapp-media).
 *
 * - Inbound: baixa a mídia da Meta (URL expira em ~5min, media_id em
 *   ~30d) e persiste no Storage já no processamento do webhook; a UI
 *   consome via signed URL de 1h e usa refresh quando expira.
 * - Outbound: validação de tamanho/MIME espelha os limites do /media
 *   da Meta (rejeitar cedo em vez de deixar a Meta recusar com 131053).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import type { WhatsAppCloudAPI } from "./cloud-api"

const log = logger.child("WhatsAppMedia")

export const MEDIA_BUCKET = "whatsapp-media"
export const SIGNED_URL_EXPIRY = 3600 // 1h

// Limites de tamanho por categoria (enforcement da Meta)
export const MAX_SIZE_BY_TYPE: Record<string, number> = {
  image: 5 * 1024 * 1024, // 5 MB
  video: 16 * 1024 * 1024, // 16 MB
  audio: 16 * 1024 * 1024, // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
}
const FALLBACK_MAX_SIZE = 16 * 1024 * 1024

// MIME aceitos pelo /media da Meta
export const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/3gpp"],
  audio: ["audio/aac", "audio/mpeg", "audio/mp4", "audio/amr", "audio/ogg"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
  ],
}

const DANGEROUS_EXTENSIONS = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".vbs", ".js", ".jar", ".msi"]

export function validateMediaFile(
  file: { name: string; type: string; size: number },
  mediaType: string,
): { valid: true } | { valid: false; error: string } {
  const maxSize = MAX_SIZE_BY_TYPE[mediaType] ?? FALLBACK_MAX_SIZE
  if (file.size > maxSize) {
    const label =
      mediaType === "image" ? "Imagem" : mediaType === "video" ? "Vídeo" : mediaType === "audio" ? "Áudio" : "Documento"
    return { valid: false, error: `${label} muito grande. Máximo: ${maxSize / (1024 * 1024)}MB` }
  }

  if (DANGEROUS_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return { valid: false, error: "Tipo de arquivo não permitido por segurança" }
  }

  const allowedList = ALLOWED_TYPES[mediaType]
  if (allowedList && !allowedList.includes(file.type)) {
    return { valid: false, error: `Tipo de arquivo não aceito pelo WhatsApp para ${mediaType}: ${file.type}` }
  }

  return { valid: true }
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
}

export function extForMime(mime: string | null | undefined): string {
  if (!mime) return "bin"
  const base = mime.split(";")[0].trim()
  return MIME_EXT[base] ?? base.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ?? "bin"
}

export interface PersistedMedia {
  storagePath: string
  signedUrl: string
  mime: string
  size: number
}

/**
 * Baixa a mídia da Meta e persiste no Storage. Retorna null em falha —
 * a mensagem é persistida mesmo assim (metadata.wa_media_id permite
 * retry on-demand via endpoint de refresh).
 */
export async function persistInboundMedia(
  admin: SupabaseClient,
  client: WhatsAppCloudAPI,
  args: { orgId: string; threadId: string; mediaId: string; filename?: string | null },
): Promise<PersistedMedia | null> {
  try {
    const { data, mimeType, fileSize } = await client.downloadMedia(args.mediaId)
    const path = `${args.orgId}/${args.threadId}/${crypto.randomUUID()}.${extForMime(mimeType)}`

    const { error: uploadError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, data, { contentType: mimeType, upsert: false })
    if (uploadError) {
      log.error("storage upload falhou", { mediaId: args.mediaId, message: uploadError.message })
      return null
    }

    const signedUrl = await createSignedUrl(admin, path)
    if (!signedUrl) return null

    return { storagePath: path, signedUrl, mime: mimeType, size: fileSize ?? data.byteLength }
  } catch (error) {
    log.warn("download de mídia inbound falhou (persistindo sem mídia)", {
      mediaId: args.mediaId,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Decodifica base64 de mídia (Evolution entrega no webhook com
 * base64:true). Aceita data-URI ("data:image/png;base64,...") ou base64
 * cru; extrai o MIME do data-URI quando presente. Puro e testável.
 */
export function decodeBase64Media(input: string): { buffer: Uint8Array; mimeFromDataUri: string | null } | null {
  let raw = input.trim()
  let mimeFromDataUri: string | null = null

  const dataUriMatch = raw.match(/^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/)
  if (dataUriMatch) {
    mimeFromDataUri = dataUriMatch[1] ?? null
    raw = dataUriMatch[2]
  }

  if (!raw) return null
  try {
    const buffer = new Uint8Array(Buffer.from(raw, "base64"))
    if (buffer.byteLength === 0) return null
    return { buffer, mimeFromDataUri }
  } catch {
    return null
  }
}

/**
 * Persiste mídia recebida em base64 (fluxo Evolution) no mesmo bucket e
 * shape do fluxo Cloud API. Retorna null em falha — a mensagem persiste
 * sem mídia (metadata.evolution_key permite retry on-demand).
 */
export async function persistBase64Media(
  admin: SupabaseClient,
  args: { orgId: string; threadId: string; base64: string; mime: string | null },
): Promise<PersistedMedia | null> {
  const decoded = decodeBase64Media(args.base64)
  if (!decoded) {
    log.warn("base64 de mídia inválido (persistindo sem mídia)", { threadId: args.threadId })
    return null
  }

  const mime = decoded.mimeFromDataUri ?? args.mime ?? "application/octet-stream"
  const path = `${args.orgId}/${args.threadId}/${crypto.randomUUID()}.${extForMime(mime)}`

  const { error: uploadError } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, decoded.buffer, { contentType: mime, upsert: false })
  if (uploadError) {
    log.error("storage upload (base64) falhou", { threadId: args.threadId, message: uploadError.message })
    return null
  }

  const signedUrl = await createSignedUrl(admin, path)
  if (!signedUrl) return null

  return { storagePath: path, signedUrl, mime, size: decoded.buffer.byteLength }
}

export async function createSignedUrl(admin: SupabaseClient, storagePath: string): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)
  if (error || !data?.signedUrl) {
    log.error("createSignedUrl falhou", { storagePath, message: error?.message })
    return null
  }
  return data.signedUrl
}
