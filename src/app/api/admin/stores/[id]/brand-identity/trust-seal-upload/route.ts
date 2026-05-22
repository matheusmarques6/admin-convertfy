/**
 * POST /api/admin/stores/[id]/brand-identity/trust-seal-upload
 *
 * Upload de um selo de confianca em PNG. Diferente do upload de logo
 * (que cria nova versao de store_brand_identity), este endpoint apenas
 * sobe o arquivo pro Storage e retorna a signed URL. O frontend adiciona
 * a URL ao brandDraft.trust_icons localmente; a persistencia acontece
 * no Save geral (PATCH /brand-identity).
 *
 * Motivo: trust_icons e ARRAY. Append direto no DB antes do Save
 * desincroniza com o que o usuario esta editando no draft.
 *
 * FormData esperada:
 *   - file: File (PNG obrigatorio, max 2MB)
 */

import { NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TrustSealUpload")

export const maxDuration = 30

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) throw new AppError("Arquivo obrigatorio (field: file)", 400)
    if (file.type !== "image/png") {
      throw new AppError(`Tipo ${file.type} nao permitido. Apenas PNG.`, 400)
    }
    if (file.size > MAX_BYTES) {
      throw new AppError("Arquivo maior que 2MB", 400)
    }

    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .maybeSingle()
    if (!store) throw new AppError("Loja nao encontrada", 404)

    const filename = `${randomUUID()}.png`
    const path = `stores/${storeId}/trust-seals/${filename}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from("onboarding-visual-assets")
      .upload(path, buffer, {
        contentType: "image/png",
        upsert: false,
      })

    if (uploadErr) {
      log.error("[trust-seal-upload] storage error", uploadErr)
      throw new AppError(`Falha no upload: ${uploadErr.message}`, 500)
    }

    const { data: signed } = await admin.storage
      .from("onboarding-visual-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 7)

    return successResponse(request, {
      url: signed?.signedUrl ?? null,
      path,
    })
  } catch (error) {
    return errorResponse(request, error, "TrustSealUpload")
  }
}
