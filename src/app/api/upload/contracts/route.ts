import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("UploadContracts")

const BUCKET = "contracts"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"]

let bucketEnsured = false

/**
 * POST /api/upload/contracts
 * Upload a contract document file. Returns the storage path (not a signed URL).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)
    const adminClient = createAdminClient()

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const clientId = formData.get("client_id") as string | null

    if (!file) {
      throw new AppError("Nenhum arquivo enviado", 400)
    }

    if (!clientId) {
      throw new AppError("client_id é obrigatório", 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AppError("Arquivo muito grande. Máximo: 10MB", 400)
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new AppError(`Tipo de arquivo não permitido. Use: ${ALLOWED_EXTENSIONS.join(", ")}`, 400)
    }

    // Verify user has access to this client (RLS enforced)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, org_id")
      .eq("id", clientId)
      .single()

    if (clientError || !client) {
      throw new AppError("Cliente não encontrado ou acesso negado", 404)
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
    const filePath = `${client.org_id}/${clientId}/${timestamp}-${safeName}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      log.error("Failed to upload contract file", uploadError)
      throw new AppError("Erro ao fazer upload do arquivo", 500)
    }

    // Return the storage path — signed URLs are generated on-demand via GET
    return successResponse(request, {
      path: uploadData.path,
      fileName: file.name,
    })
  } catch (error) {
    return errorResponse(request, error, "UploadContracts")
  }
}

/**
 * GET /api/upload/contracts?path=<storagePath>
 * Generate a short-lived signed URL (1 hour) for downloading a contract file.
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

    // Extract client_id from path pattern: org_id/client_id/timestamp-filename
    const pathParts = filePath.split("/")
    if (pathParts.length < 3) {
      throw new AppError("Path inválido", 400)
    }
    const clientId = pathParts[1]

    // Verify user has access to this client (RLS enforced)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .single()

    if (clientError || !client) {
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
    return errorResponse(request, error, "UploadContracts")
  }
}

/**
 * DELETE /api/upload/contracts?path=<storagePath>
 * Delete a contract file from storage (used when user removes file before saving contract).
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
    const clientId = pathParts[1]

    // Verify user has access to this client (RLS enforced)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .single()

    if (clientError || !client) {
      throw new AppError("Acesso negado ao arquivo", 403)
    }

    const adminClient = createAdminClient()
    const { error: deleteError } = await adminClient.storage
      .from(BUCKET)
      .remove([filePath])

    if (deleteError) {
      log.error("Failed to delete contract file", deleteError)
      throw new AppError("Erro ao deletar arquivo", 500)
    }

    return successResponse(request, { deleted: true })
  } catch (error) {
    return errorResponse(request, error, "UploadContracts")
  }
}
