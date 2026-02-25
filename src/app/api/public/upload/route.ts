import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("PublicUpload")

const BUCKET = "onboarding-uploads"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
  "application/pdf",
]
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".pdf"]

let bucketEnsured = false

/**
 * POST /api/public/upload
 * Public file upload for onboarding form (no auth required).
 * Rate limited to prevent abuse.
 */
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "public:upload", RATE_LIMITS.publicUpload)
  if (limited) return limited

  try {
    const adminClient = createAdminClient()

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const fileType = formData.get("file_type") as string | null

    if (!file) {
      throw new AppError("Nenhum arquivo enviado", 400)
    }

    if (!fileType || !["logo", "design", "brand_manual"].includes(fileType)) {
      throw new AppError("file_type deve ser: logo, design ou brand_manual", 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AppError("Arquivo muito grande. Máximo: 10MB", 400)
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new AppError(`Tipo de arquivo não permitido. Use: ${ALLOWED_EXTENSIONS.join(", ")}`, 400)
    }

    // Ensure bucket exists
    if (!bucketEnsured) {
      await adminClient.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: ALLOWED_TYPES,
      }).catch(() => {
        // Bucket already exists
      })
      bucketEnsured = true
    }

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const filePath = `pending/${fileType}-${timestamp}-${safeName}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      log.error("Failed to upload file", uploadError)
      throw new AppError("Erro ao fazer upload do arquivo", 500)
    }

    return successResponse(request, {
      path: uploadData.path,
      fileName: file.name,
    })
  } catch (error) {
    return errorResponse(request, error, "PublicUpload")
  }
}
