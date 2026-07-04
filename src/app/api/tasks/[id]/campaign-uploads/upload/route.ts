/**
 * POST /api/tasks/[id]/campaign-uploads/upload
 *
 * Upload manual da imagem do email de UMA loja (modo massa da Tela 2
 * chama esta rota N vezes com pool no client). FormData: file
 * (PNG/JPG/WEBP, máx 10MB) + store_id.
 *
 * Diferente do upload do cut-map: path FIXO por loja
 * (store-emails/{store_id}.png, upsert) — substituir imagem não acumula
 * arquivos; dimensões medidas server-side com sharp (fonte da verdade).
 */

import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { saveManualStoreEmail } from "@/lib/services/campaign-central/campaign-store-email.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"]
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    const storeId = formData.get("store_id")
    if (!file) throw new AppError("Arquivo obrigatório (field: file)", 400)
    if (typeof storeId !== "string" || !UUID_RE.test(storeId)) {
      throw new AppError("store_id inválido", 400)
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new AppError(
        `Tipo ${file.type} não permitido. Use: ${ALLOWED_MIME.join(", ")}`,
        400,
      )
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new AppError("Arquivo maior que 10MB", 400)
    }

    const email = await saveManualStoreEmail({
      suggestionId: source_id,
      orgId: ctx.member.orgId,
      storeId,
      userId: user.id,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      filename: file.name || "email.png",
    })

    return successResponse(request, { email })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-uploads:upload")
  }
}
