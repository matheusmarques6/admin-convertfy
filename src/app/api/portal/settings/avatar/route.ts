import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalAvatarUpload")

const BUCKET = "avatars"
const MAX_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }> = {
  "image/jpeg": { bytes: [0xff, 0xd8, 0xff] },
  "image/png": { bytes: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { bytes: [0x52, 0x49, 0x46, 0x46] },
}

const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const spec = MAGIC_BYTES[mimeType]
  if (!spec) return false
  const offset = spec.offset ?? 0
  if (buffer.length < offset + spec.bytes.length) return false
  for (let i = 0; i < spec.bytes.length; i++) {
    if (buffer[offset + i] !== spec.bytes[i]) return false
  }
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false
    for (let i = 0; i < WEBP_SIGNATURE.length; i++) {
      if (buffer[8 + i] !== WEBP_SIGNATURE[i]) return false
    }
  }
  return true
}

function getExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg": return "jpg"
    case "image/png": return "png"
    case "image/webp": return "webp"
    default: return "jpg"
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/portal/settings/avatar
 * Upload avatar for portal user. Same bucket, updates client_portal_users.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Verify portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      throw new AppError("Nenhum arquivo enviado", 400)
    }

    if (file.size > MAX_SIZE) {
      throw new AppError("Arquivo muito grande. Máximo 2MB", 400)
    }

    if (!ALLOWED_TYPES.includes(file.type as typeof ALLOWED_TYPES[number])) {
      throw new AppError("Formato não suportado. Use JPG, PNG ou WebP", 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    if (!validateMagicBytes(buffer, file.type)) {
      throw new AppError("Conteúdo do arquivo não corresponde ao tipo declarado", 400)
    }

    const ext = getExtension(file.type)
    const otherExts = ["jpg", "png", "webp"].filter((e) => e !== ext)
    const filesToRemove = otherExts.map((e) => `${user.id}/avatar.${e}`)

    if (filesToRemove.length > 0) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(filesToRemove)
      if (removeError) {
        log.warn("Failed to remove old avatar files:", removeError)
      }
    }

    const path = `${user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      log.error("Portal avatar upload failed:", uploadError)
      throw new AppError("Erro ao fazer upload do avatar", 500)
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)

    // Update client_portal_users.avatar_url
    const { error: updateError } = await supabase
      .from("client_portal_users")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", portalUser.id)

    if (updateError) {
      log.error("Failed to update portal avatar_url:", updateError)
      throw new AppError("Erro ao atualizar perfil", 500)
    }

    return successResponse(request, { avatar_url: `${publicUrl}?t=${Date.now()}` })
  } catch (error) {
    return errorResponse(request, error, "PortalAvatarUpload")
  }
}

/**
 * DELETE /api/portal/settings/avatar
 * Remove avatar from Storage and set client_portal_users.avatar_url to null.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const filesToRemove = ["jpg", "png", "webp"].map(
      (ext) => `${user.id}/avatar.${ext}`
    )

    const { error: removeError } = await supabase.storage.from(BUCKET).remove(filesToRemove)
    if (removeError) {
      log.warn("Failed to remove portal avatar files:", removeError)
    }

    const { error: updateError } = await supabase
      .from("client_portal_users")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", portalUser.id)

    if (updateError) {
      log.error("Failed to clear portal avatar_url:", updateError)
      throw new AppError("Erro ao remover avatar", 500)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PortalAvatarUpload")
  }
}
