import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("UploadPaymentProof")

const BUCKET = "payment-proofs"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"]
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf"]

let bucketEnsured = false

/**
 * POST /api/upload/payment-proof
 * Recebe o comprovante de pagamento (PNG/JPG/PDF) e devolve o caminho no storage.
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

    // Verifica acesso ao cliente (RLS)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, org_id")
      .eq("id", clientId)
      .single()

    if (clientError || !client) {
      throw new AppError("Cliente não encontrado ou acesso negado", 404)
    }

    // Cria o bucket uma vez por instância (idempotente)
    if (!bucketEnsured) {
      await adminClient.storage
        .createBucket(BUCKET, {
          public: false,
          fileSizeLimit: MAX_FILE_SIZE,
          allowedMimeTypes: ALLOWED_TYPES,
        })
        .catch(() => {
          // Bucket já existe — ignora
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
      log.error("Failed to upload payment proof", uploadError)
      throw new AppError("Erro ao fazer upload do comprovante", 500)
    }

    return successResponse(request, { path: uploadData.path, fileName: file.name })
  } catch (error) {
    return errorResponse(request, error, "UploadPaymentProof")
  }
}

/**
 * GET /api/upload/payment-proof?path=<storagePath>
 * Gera uma URL assinada de curta duração (1h) para visualizar o comprovante.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)
    const adminClient = createAdminClient()

    const filePath = new URL(request.url).searchParams.get("path")
    if (!filePath) {
      throw new AppError("Parâmetro 'path' é obrigatório", 400)
    }

    // Path: org_id/client_id/timestamp-filename → valida acesso ao cliente
    const parts = filePath.split("/")
    if (parts.length < 3) {
      throw new AppError("Path inválido", 400)
    }
    const clientId = parts[1]

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .single()

    if (clientError || !client) {
      throw new AppError("Acesso negado", 403)
    }

    const { data, error } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 60)

    if (error || !data) {
      throw new AppError("Erro ao gerar link do comprovante", 500)
    }

    return successResponse(request, { url: data.signedUrl })
  } catch (error) {
    return errorResponse(request, error, "UploadPaymentProof GET")
  }
}
