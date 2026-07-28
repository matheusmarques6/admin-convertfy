/**
 * POST /api/admin/image-studio/upload
 *
 * Upload da imagem-base (referência visual) de um lote do estúdio.
 * Grava no bucket onboarding-visual-assets (pasta image-studio/{org})
 * e devolve a URL assinada (365d). Espelha o upload da campanha.
 *
 * FormData: file (PNG/JPG/WEBP, máx 10MB) + batch_id opcional.
 */

import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("ImageStudioUpload")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"]

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const batchId = (formData.get("batch_id") as string | null) || "geral"
    if (!file) throw new AppError("Arquivo obrigatório (field: file)", 400)
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new AppError(
        `Tipo ${file.type} não permitido. Use: ${ALLOWED_MIME.join(", ")}`,
        400,
      )
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new AppError("Arquivo maior que 10MB", 400)
    }

    const admin = createAdminClient()
    const ts = Date.now()
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const safeBatch = batchId.replace(/[^a-zA-Z0-9-]/g, "")
    const path = `image-studio/${orgId}/${safeBatch}/${ts}-${safeFilename}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from("onboarding-visual-assets")
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
      log.error("upload.failed", { path, error: uploadErr.message })
      throw new AppError(`Erro no upload: ${uploadErr.message}`, 500)
    }

    const { data: signed } = await admin.storage
      .from("onboarding-visual-assets")
      .createSignedUrl(path, 365 * 24 * 60 * 60)

    let url = signed?.signedUrl ?? null
    if (!url) {
      const { data: pub } = admin.storage
        .from("onboarding-visual-assets")
        .getPublicUrl(path)
      url = pub.publicUrl
    }

    return successResponse(request, {
      url,
      path,
      size: file.size,
      filename: file.name,
      mime_type: file.type,
    })
  } catch (error) {
    return errorResponse(request, error, "ImageStudioUpload")
  }
}
