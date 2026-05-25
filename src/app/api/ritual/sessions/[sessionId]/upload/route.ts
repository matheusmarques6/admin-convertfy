import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("RitualUpload")

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/ritual/sessions/[sessionId]/upload
 *
 * Upload da gravação Fathom para Supabase Storage.
 * Aceita multipart/form-data com campo "file".
 * Salva em bucket 'ritual-recordings' e atualiza ritual_sessions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    const { data: session } = await admin
      .from("ritual_sessions")
      .select("id, org_id")
      .eq("id", sessionId)
      .maybeSingle()
    if (!session) throw new AppError("Sessão não encontrada", 404)
    if (session.org_id !== (member as { org_id: string }).org_id) throw new AppError("Sem permissão", 403)

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) throw new AppError("Campo 'file' obrigatório", 400)

    const ALLOWED = [".mp4", ".mp3", ".m4a", ".wav"]
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    if (!ALLOWED.includes(ext)) {
      throw new AppError(`Tipo de arquivo não aceito: ${ext}. Use ${ALLOWED.join(", ")}`, 400)
    }

    const MAX_SIZE = 2 * 1024 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      throw new AppError("Arquivo excede limite de 2GB", 400)
    }

    const fileName = `${sessionId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await admin.storage
      .from("ritual-recordings")
      .upload(fileName, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      log.error("Upload falhou", { sessionId, error: uploadError.message })
      throw new AppError(`Upload falhou: ${uploadError.message}`, 500)
    }

    await admin
      .from("ritual_sessions")
      .update({
        recording_url: fileName,
        recording_filename: file.name,
        recording_uploaded_at: new Date().toISOString(),
        transcript_status: "pending",
      })
      .eq("id", sessionId)

    log.info("[RitualUpload] upload concluido", {
      sessionId,
      fileName: file.name,
      size: file.size,
      storagePath: fileName,
    })

    return successResponse(request, {
      uploaded: true,
      storage_path: fileName,
      file_name: file.name,
      file_size: file.size,
    })
  } catch (error) {
    return errorResponse(request, error, "RitualUpload")
  }
}
