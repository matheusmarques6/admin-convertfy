/**
 * POST /api/tasks/[id]/campaign-cuts/upload
 *
 * Upload da imagem do email finalizado da campanha (mapa de cortes).
 * Grava no bucket onboarding-visual-assets e devolve URL assinada (365d) +
 * path. Espelha /api/tasks/[id]/campaign-images/upload — o upload é
 * "burro": o client em seguida faz o PUT do rascunho com image_* + a
 * porta única inicial.
 *
 * FormData: file (PNG/JPG/WEBP, máx 10MB). Acesso é o da própria task de
 * campanha (requireTaskAccess work).
 */

import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignCutsUpload")

export const dynamic = "force-dynamic"
export const maxDuration = 60

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"]

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
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
    const safeFilename = (file.name || "email.png").replace(/[^a-zA-Z0-9.-]/g, "_")
    const path = `campaigns/${source_id}/cut-map/${ts}-${safeFilename}`
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
      filename: file.name || "email.png",
      mime_type: file.type,
    })
  } catch (error) {
    return errorResponse(request, error, "CampaignCutsUpload")
  }
}
