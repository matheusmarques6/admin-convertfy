import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("UploadStoreFiles")

const BUCKET = "store-files"
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
 * POST /api/upload/store-files
 * Upload a store file (logo, design direction, brand manual).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)
    const adminClient = createAdminClient()

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const storeId = formData.get("store_id") as string | null
    const fileType = formData.get("file_type") as string | null // logo | design | brand_manual

    if (!file) {
      throw new AppError("Nenhum arquivo enviado", 400)
    }

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
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

    // Verify user has access to this store (RLS enforced)
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("id, org_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada ou acesso negado", 404)
    }

    // Ensure bucket exists (once per server instance)
    if (!bucketEnsured) {
      await adminClient.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: ALLOWED_TYPES,
      }).catch(() => {
        // Bucket already exists — ignore
      })
      bucketEnsured = true
    }

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const filePath = `${store.org_id}/${storeId}/${fileType}-${timestamp}-${safeName}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      log.error("Failed to upload store file", uploadError)
      throw new AppError("Erro ao fazer upload do arquivo", 500)
    }

    return successResponse(request, {
      path: uploadData.path,
      fileName: file.name,
    })
  } catch (error) {
    return errorResponse(request, error, "UploadStoreFiles")
  }
}

/**
 * GET /api/upload/store-files?path=<storagePath>
 * Generate a short-lived signed URL (1 hour) for downloading a store file.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get("path")

    if (!filePath) {
      throw new AppError("Parâmetro 'path' é obrigatório", 400)
    }

    // Extract store_id from path pattern: org_id/store_id/type-timestamp-filename
    const pathParts = filePath.split("/")
    if (pathParts.length < 3) {
      throw new AppError("Path inválido", 400)
    }
    const storeId = pathParts[1]

    // Verify user has access to this store (RLS enforced)
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Acesso negado ao arquivo", 403)
    }

    const adminClient = createAdminClient()
    const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 60) // 1 hour

    if (signedUrlError) {
      log.error("Failed to create signed URL", signedUrlError)
      throw new AppError("Erro ao gerar URL do arquivo", 500)
    }

    return successResponse(request, {
      url: signedUrlData.signedUrl,
    })
  } catch (error) {
    return errorResponse(request, error, "UploadStoreFiles")
  }
}

/**
 * DELETE /api/upload/store-files?path=<storagePath>
 * Delete a store file from storage.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get("path")

    if (!filePath) {
      throw new AppError("Parâmetro 'path' é obrigatório", 400)
    }

    const pathParts = filePath.split("/")
    if (pathParts.length < 3) {
      throw new AppError("Path inválido", 400)
    }
    const storeId = pathParts[1]

    // Verify user has access to this store (RLS enforced)
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      throw new AppError("Acesso negado ao arquivo", 403)
    }

    const adminClient = createAdminClient()
    const { error: deleteError } = await adminClient.storage
      .from(BUCKET)
      .remove([filePath])

    if (deleteError) {
      log.error("Failed to delete store file", deleteError)
      throw new AppError("Erro ao deletar arquivo", 500)
    }

    return successResponse(request, { deleted: true })
  } catch (error) {
    return errorResponse(request, error, "UploadStoreFiles")
  }
}
