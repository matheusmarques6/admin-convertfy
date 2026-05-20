import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreBrandIdentityUpload")

export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/admin/stores/[id]/brand-identity/upload
 *
 * Upload de asset de marca (logo principal/alternativa/monograma/reverso em
 * SVG ou PNG, ou manual em PDF) para o bucket onboarding-visual-assets do
 * Supabase Storage. Retorna URL assinada (7d) e path interno.
 *
 * FormData esperada:
 *   - file: File (PNG/SVG/PDF, máx 10MB)
 *   - slot: "logo_main_svg" | "logo_main_png" | "logo_alt_svg" | "logo_alt_png"
 *         | "logo_monogram_svg" | "logo_monogram_png" | "logo_reverse_svg"
 *         | "logo_reverse_png" | "brand_manual"
 */

const VALID_SLOTS = [
  "logo_main_svg",
  "logo_main_png",
  "logo_alt_svg",
  "logo_alt_png",
  "logo_monogram_svg",
  "logo_monogram_png",
  "logo_reverse_svg",
  "logo_reverse_png",
  "brand_manual",
] as const

const SLOT_MIME: Record<string, string[]> = {
  logo_main_svg: ["image/svg+xml"],
  logo_main_png: ["image/png"],
  logo_alt_svg: ["image/svg+xml"],
  logo_alt_png: ["image/png"],
  logo_monogram_svg: ["image/svg+xml"],
  logo_monogram_png: ["image/png"],
  logo_reverse_svg: ["image/svg+xml"],
  logo_reverse_png: ["image/png"],
  brand_manual: ["application/pdf"],
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
    const slot = formData.get("slot") as string | null

    if (!file) throw new AppError("Arquivo obrigatório (field: file)", 400)
    if (!slot || !VALID_SLOTS.includes(slot as (typeof VALID_SLOTS)[number])) {
      throw new AppError(`slot inválido. Use um de: ${VALID_SLOTS.join(", ")}`, 400)
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new AppError("Arquivo maior que 10MB", 400)
    }
    const allowed = SLOT_MIME[slot]
    if (!allowed.includes(file.type)) {
      throw new AppError(`Tipo ${file.type} não permitido para slot ${slot}. Use: ${allowed.join(", ")}`, 400)
    }

    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .maybeSingle()
    if (!store) throw new AppError("Loja não encontrada", 404)

    const ts = Date.now()
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const path = `stores/${storeId}/brand/${slot}-${ts}-${safeFilename}`

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
    return errorResponse(request, error, "StoreBrandIdentityUpload")
  }
}
