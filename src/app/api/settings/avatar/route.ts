import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  AVATAR_BUCKET as BUCKET,
  AVATAR_MAX_SIZE as MAX_SIZE,
  AVATAR_ALLOWED_TYPES as ALLOWED_TYPES,
  type AvatarMimeType,
  validateMagicBytes,
  getAvatarExtension as getExtension,
  avatarPath,
  avatarPathsToClean,
  avatarPathsAll,
} from "@/lib/avatar-validation"

const log = logger.child("AvatarUpload")

/**
 * POST /api/settings/avatar
 * Upload avatar image. Validates magic bytes, uploads to Storage, updates profile.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      throw new AppError("Nenhum arquivo enviado", 400)
    }

    if (file.size > MAX_SIZE) {
      throw new AppError("Arquivo muito grande. Máximo 2MB", 400)
    }

    if (!ALLOWED_TYPES.includes(file.type as AvatarMimeType)) {
      throw new AppError("Formato não suportado. Use JPG, PNG ou WebP", 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    if (!validateMagicBytes(buffer, file.type)) {
      throw new AppError("Conteúdo do arquivo não corresponde ao tipo declarado", 400)
    }

    // Upload (upsert overwrites previous same-extension file)
    const ext = getExtension(file.type)
    const path = avatarPath(user.id, ext)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      log.error("Avatar upload failed:", uploadError)
      throw new AppError("Erro ao fazer upload do avatar", 500)
    }

    // Get public URL (clean, without cache-bust)
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)

    // Store clean URL in database
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", user.id)

    if (updateError) {
      log.error("Failed to update avatar_url:", updateError)
      throw new AppError("Erro ao atualizar perfil", 500)
    }

    // Só AGORA as extensões antigas saem. A ordem importa: enquanto a
    // limpeza vinha PRIMEIRO, qualquer falha entre ela e o update deixava
    // `profiles.avatar_url` apontando para o arquivo recém-apagado — o
    // Storage responde 400 e o avatar some sem ninguém saber por quê.
    // Arquivo velho sobrando é lixo tolerável; ponteiro para o vazio, não.
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(avatarPathsToClean(user.id, ext))
    if (removeError) {
      log.warn("Failed to remove old avatar files:", removeError)
    }

    // Return URL with cache-bust param for immediate client refresh
    return successResponse(request, { avatar_url: `${publicUrl}?t=${Date.now()}` })
  } catch (error) {
    return errorResponse(request, error, "AvatarUpload")
  }
}

/**
 * DELETE /api/settings/avatar
 * Remove avatar from Storage and set profiles.avatar_url to null.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Remove all possible avatar files
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(avatarPathsAll(user.id))
    if (removeError) {
      log.warn("Failed to remove avatar files from storage:", removeError)
    }

    // Set avatar_url to null
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", user.id)

    if (updateError) {
      log.error("Failed to clear avatar_url:", updateError)
      throw new AppError("Erro ao remover avatar", 500)
    }

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "AvatarUpload")
  }
}
