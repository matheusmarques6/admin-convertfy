import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingVisualAssetsUpload")

export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/onboardings/[id]/visual-assets/upload
 *
 * Upload de imagem (logo principal, logo mono, ou produto) pro bucket
 * onboarding-visual-assets do Supabase Storage. Retorna URL pública
 * temporária pra exibição + path interno pra persistir em visual_assets.
 *
 * FormData esperada:
 *   - file: File (PNG/JPEG/SVG/WebP, máx 10MB)
 *   - slot: "logo_main" | "logo_mono" | "product_image"
 *   - product_index?: number (apenas para slot=product_image)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const slot = formData.get("slot") as string | null

    if (!file) throw new AppError("Arquivo obrigatório (field: file)", 400)
    if (!slot || !["logo_main", "logo_mono", "product_image"].includes(slot)) {
      throw new AppError("slot inválido (logo_main | logo_mono | product_image)", 400)
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new AppError("Arquivo maior que 10MB", 400)
    }
    const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      throw new AppError(`Tipo ${file.type} não permitido. Use PNG, JPEG, SVG ou WebP.`, 400)
    }

    const admin = createAdminClient()

    // Verifica onboarding existe
    const { data: onb } = await admin
      .from("onboardings")
      .select("id, org_id")
      .eq("id", id)
      .maybeSingle()
    if (!onb) throw new AppError("Onboarding não encontrado", 404)

    // Path: <onboarding_id>/<slot>-<timestamp>-<filename>
    const ts = Date.now()
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const path = `${id}/${slot}-${ts}-${safeFilename}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from("onboarding-visual-assets")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      log.error("[Upload] erro Supabase Storage", uploadErr)
      throw new AppError(`Erro no upload: ${uploadErr.message}`, 500)
    }

    // URL assinada (válida 7 dias — bucket privado)
    const { data: signed } = await admin.storage
      .from("onboarding-visual-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 7)

    return successResponse(request, {
      slot,
      path,
      url: signed?.signedUrl ?? null,
      size: file.size,
      filename: file.name,
      mime_type: file.type,
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingVisualAssetsUpload")
  }
}
