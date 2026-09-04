/**
 * GET /api/public/convertia-asset/<path>?sig=… — asset gerado pela
 * ConvertIA, servido SEM login, para plataformas externas baixarem.
 *
 * O Omnisend (`POST /api/images`), o Klaviyo e o Shopify só aceitam
 * URL pública, estática e sem redirect. A rota autenticada do chat
 * (/api/ai/convertia/imagem) não serve para isso. Aqui a autorização é
 * a assinatura HMAC do path na query — sem ela (ou com ela errada) é
 * 404, sem confirmar que o objeto existe.
 *
 * Cache público e longo de propósito: o objeto é imutável (uuid no
 * nome) e a plataforma pode buscá-lo várias vezes.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { CONVERTIA_IMAGE_BUCKET, isConvertiaImagePath } from "@/lib/ai/convertia-image-url"
import { verifyConvertiaAssetSignature } from "@/lib/ai/convertia-asset-signature"
import { logger } from "@/lib/logger"

const log = logger.child("ConvertiaPublicAsset")

export const dynamic = "force-dynamic"

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
}

const notFound = () => new NextResponse("Not found", { status: 404 })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params
    const path = (segments ?? []).map((s) => decodeURIComponent(s)).join("/")
    if (!isConvertiaImagePath(path)) return notFound()
    if (!verifyConvertiaAssetSignature(path, request.nextUrl.searchParams.get("sig"))) {
      return notFound()
    }

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).download(path)
    if (error || !data) {
      log.warn("objeto indisponível", { path, error: error?.message })
      return notFound()
    }

    const ext = path.split(".").pop()?.toLowerCase() ?? "png"
    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (err) {
    log.error("falha ao servir asset", { error: err instanceof Error ? err.message : String(err) })
    return notFound()
  }
}
