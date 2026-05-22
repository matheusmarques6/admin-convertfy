/**
 * GET /api/admin/stores/[id]/brand-identity/download-zip
 *
 * Baixa as 8 versoes do logo (4 cards x SVG+PNG) da identidade visual
 * mais recente, zipa em memoria e retorna 1 download. Substitui o
 * comportamento legado de window.open multiplo (popup-blocker friendly).
 *
 * Limite de memoria: 8MB de assets combinados. Acima disso, retorna 413.
 */

import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("BrandIdentityZip")

export const dynamic = "force-dynamic"

const MAX_TOTAL_BYTES = 8 * 1024 * 1024 // 8 MB

const SLOT_FILENAMES: Array<{
  field: string
  filename: string
}> = [
  { field: "logo_main_svg", filename: "wordmark.svg" },
  { field: "logo_main_png", filename: "wordmark.png" },
  { field: "logo_alt_svg", filename: "wordmark-alt.svg" },
  { field: "logo_alt_png", filename: "wordmark-alt.png" },
  { field: "logo_monogram_svg", filename: "monogram.svg" },
  { field: "logo_monogram_png", filename: "monogram.png" },
  { field: "logo_reverse_svg", filename: "reverse.svg" },
  { field: "logo_reverse_png", filename: "reverse.png" },
]

function sanitizeStoreName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "brand"
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data: store } = await admin
      .from("client_stores")
      .select("store_name")
      .eq("id", storeId)
      .maybeSingle()

    const { data: brand } = await admin
      .from("store_brand_identity")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!brand) {
      throw new AppError("Identidade visual nao capturada ainda", 404)
    }

    const slots = SLOT_FILENAMES.filter(
      (s) => typeof brand[s.field] === "string" && brand[s.field],
    )
    if (slots.length === 0) {
      throw new AppError("Nenhum logo disponivel pra download", 404)
    }

    const zip = new JSZip()
    let totalBytes = 0

    for (const slot of slots) {
      const url = brand[slot.field] as string
      try {
        const r = await fetch(url)
        if (!r.ok) {
          log.warn("slot fetch failed", { slot: slot.field, status: r.status })
          continue
        }
        const buf = Buffer.from(await r.arrayBuffer())
        totalBytes += buf.length
        if (totalBytes > MAX_TOTAL_BYTES) {
          throw new AppError("Assets combinados excedem 8MB", 413)
        }
        zip.file(slot.filename, buf)
      } catch (err) {
        if (err instanceof AppError) throw err
        log.warn("slot fetch threw", { slot: slot.field, err })
      }
    }

    if (Object.keys(zip.files).length === 0) {
      throw new AppError("Falha ao baixar os assets", 502)
    }

    const arr = await zip.generateAsync({ type: "uint8array" })
    const ab = arr.buffer.slice(
      arr.byteOffset,
      arr.byteOffset + arr.byteLength,
    ) as ArrayBuffer
    const safeName = sanitizeStoreName(store?.store_name ?? "brand")
    const filename = `${safeName}-brand-assets.zip`

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(ab.byteLength),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    log.error("brand zip error", error)
    return errorResponse(request, error, "brand-zip")
  }
}
