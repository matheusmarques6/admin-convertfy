/**
 * Upload generico pra arquivos de onboarding (deliverables + tutorial images).
 *
 * POST  /api/upload/onboarding  multipart/form-data
 *   - file: File
 *   - scope: "deliverable" | "tutorial"
 *   - ref_id: id do onboarding (deliverable) ou pageId (tutorial)
 *
 * GET  /api/upload/onboarding?path=...  -> signed url 1h
 * DELETE /api/upload/onboarding?path=...
 *
 * Bucket "onboarding-assets" criado on-demand.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("UploadOnboarding")
const BUCKET = "onboarding-assets"
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB
const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "video/mp4",
  "video/webm",
]

let bucketEnsured = false
async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  if (bucketEnsured) return
  await admin.storage
    .createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: ALLOWED_MIME,
    })
    .catch(() => {
      // existe — ignora
    })
  bucketEnsured = true
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const form = await request.formData()
    const file = form.get("file") as File | null
    const scope = (form.get("scope") as string | null) ?? "deliverable"
    const refId = form.get("ref_id") as string | null

    if (!file) throw new AppError("file obrigatorio", 400)
    if (!refId) throw new AppError("ref_id obrigatorio", 400)
    if (!["deliverable", "tutorial"].includes(scope))
      throw new AppError("scope deve ser deliverable ou tutorial", 400)
    if (file.size > MAX_FILE_SIZE)
      throw new AppError("Arquivo muito grande (max 15MB)", 400)
    if (file.type && !ALLOWED_MIME.includes(file.type))
      throw new AppError(`Tipo nao permitido: ${file.type}`, 400)

    await ensureBucket(admin)

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const ts = Date.now()
    const path = `${orgId}/${scope}/${refId}/${ts}-${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { data, error } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (error) {
      log.error("upload failed", error)
      throw new AppError("Erro no upload", 500)
    }

    // Pra tutorial (imagem/video publica via token), gera URL publica via signed long-lived
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 60 * 60 * 24 * 365) // 1 ano

    return successResponse(request, {
      path: data.path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      url: signed?.signedUrl ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "UploadOnboarding")
  }
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const url = new URL(request.url)
    const path = url.searchParams.get("path")
    if (!path) throw new AppError("path obrigatorio", 400)
    if (!path.startsWith(`${orgId}/`))
      throw new AppError("Acesso negado", 403)
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
    if (error) throw new AppError("Erro ao gerar URL", 500)
    return successResponse(request, { url: data.signedUrl })
  } catch (error) {
    return errorResponse(request, error, "UploadOnboarding")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const url = new URL(request.url)
    const path = url.searchParams.get("path")
    if (!path) throw new AppError("path obrigatorio", 400)
    if (!path.startsWith(`${orgId}/`))
      throw new AppError("Acesso negado", 403)
    const { error } = await admin.storage.from(BUCKET).remove([path])
    if (error) throw new AppError("Erro ao deletar", 500)
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "UploadOnboarding")
  }
}
