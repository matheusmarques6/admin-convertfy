import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { rasterizeSvgToPng } from "@/lib/brand/rasterize-svg"
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

    const signedUrl = signed?.signedUrl ?? null

    // Persiste a URL no slot correspondente de store_brand_identity. Sem
    // isso, o arquivo fica no Storage mas a UI continua mostrando vazio.
    // Slots de logo viram coluna direta; brand_manual nao tem coluna —
    // soltamos no metadata via cliente (out of scope deste endpoint).
    if (
      slot !== "brand_manual" &&
      VALID_SLOTS.includes(slot as (typeof VALID_SLOTS)[number]) &&
      signedUrl
    ) {
      // Busca a versao mais recente — se nao existir, cria v=1 zerada.
      const { data: current } = await admin
        .from("store_brand_identity")
        .select("*")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = (current?.version ?? 0) + 1
      const merged: Record<string, unknown> = {
        store_id: storeId,
        version: nextVersion,
        source: "edited",
        logo_main_svg: current?.logo_main_svg ?? null,
        logo_main_png: current?.logo_main_png ?? null,
        logo_alt_svg: current?.logo_alt_svg ?? null,
        logo_alt_png: current?.logo_alt_png ?? null,
        logo_monogram_svg: current?.logo_monogram_svg ?? null,
        logo_monogram_png: current?.logo_monogram_png ?? null,
        logo_reverse_svg: current?.logo_reverse_svg ?? null,
        logo_reverse_png: current?.logo_reverse_png ?? null,
        colors_primary: current?.colors_primary ?? [],
        colors_secondary: current?.colors_secondary ?? [],
        font_heading: current?.font_heading ?? null,
        font_heading_weight: current?.font_heading_weight ?? null,
        font_body: current?.font_body ?? null,
        font_body_weight: current?.font_body_weight ?? null,
        voice: current?.voice ?? [],
        trust_icons: current?.trust_icons ?? [],
        top_products: current?.top_products ?? [],
      }
      merged[slot] = signedUrl

      // Auto-PNG: ao subir um logo SVG, gera e persiste também o PNG raster — o
      // agente de imagem não baixa/decodifica SVG (causa 400 "downloading file").
      // Não-destrutivo: só preenche o slot _png se estiver vazio OU se já era
      // auto-gerado (path marcado `-fromsvg-`); nunca sobrescreve um PNG à mão.
      // Best-effort: se a rasterização falhar, loga e segue (SVG já foi salvo).
      if (/^logo_[a-z]+_svg$/.test(slot) && file.type === "image/svg+xml") {
        const pngSlot = slot.replace(/_svg$/, "_png")
        const currentPng = (current as Record<string, unknown> | null)?.[pngSlot] as
          | string
          | null
          | undefined
        if (!currentPng || currentPng.includes("-fromsvg-")) {
          try {
            const pngBuffer = await rasterizeSvgToPng(buffer)
            const pngPath = `stores/${storeId}/brand/${pngSlot}-fromsvg-${ts}.png`
            const { error: pngUploadErr } = await admin.storage
              .from("onboarding-visual-assets")
              .upload(pngPath, pngBuffer, { contentType: "image/png", upsert: false })
            if (pngUploadErr) throw new Error(pngUploadErr.message)
            const { data: pngSigned } = await admin.storage
              .from("onboarding-visual-assets")
              .createSignedUrl(pngPath, 60 * 60 * 24 * 7)
            if (pngSigned?.signedUrl) merged[pngSlot] = pngSigned.signedUrl
          } catch (e) {
            log.warn("[Upload] auto-PNG do SVG falhou (segue só com o SVG)", {
              slot,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        }
      }

      const { error: insErr } = await admin
        .from("store_brand_identity")
        .insert(merged)

      if (insErr) {
        log.error("[Upload] erro ao gravar slot em store_brand_identity", insErr)
        throw new AppError(
          `Upload feito mas falhou ao salvar no banco: ${insErr.message}`,
          500,
        )
      }
    }

    return successResponse(request, {
      slot,
      path,
      url: signedUrl,
      size: file.size,
      filename: file.name,
      mime_type: file.type,
    })
  } catch (error) {
    return errorResponse(request, error, "StoreBrandIdentityUpload")
  }
}
