import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
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

const log = logger.child("PortalAvatarUpload")

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
      .select("id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const permissions = portalUser.permissions as { edit_profile?: boolean }
    if (!permissions?.edit_profile) {
      throw new AppError("Sem permissão", 403)
    }

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

    const ext = getExtension(file.type)
    const path = avatarPath(user.id, ext, "portal")

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

    // A limpeza vem DEPOIS do update, e só dentro do escopo do portal
    // (`<uid>/portal/`). Antes ela vinha primeiro e usava o mesmo caminho
    // do admin: apagava o arquivo que `profiles.avatar_url` apontava, numa
    // rota que nem escreve nessa tabela.
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(avatarPathsToClean(user.id, ext, "portal"))
    if (removeError) {
      log.warn("Failed to remove old avatar files:", removeError)
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
      .select("id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const permissions = portalUser.permissions as { edit_profile?: boolean }
    if (!permissions?.edit_profile) {
      throw new AppError("Sem permissão", 403)
    }

    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(avatarPathsAll(user.id, "portal"))
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
