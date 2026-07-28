/**
 * GET /api/admin/image-studio/batches/[id]/download-zip
 *
 * Baixa TODAS as imagens prontas do lote (ready/adjustment) num .zip em
 * memória, nomeadas `{loja}_{formato}_v{n}.{ext}`. Espelha o ZIP da campanha.
 */

import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getBatchDownloadItems } from "@/lib/services/image-studio.service"
import { logger } from "@/lib/logger"

const log = logger.child("ImageStudioZip")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_TOTAL_BYTES = 60 * 1024 * 1024 // 60 MB

function sanitize(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "imagem"
  )
}

function extFromUrl(url: string): string {
  const path = url.split("?")[0] ?? ""
  const m = path.match(/\.([a-z0-9]{3,4})$/i)
  return m ? m[1].toLowerCase() : "png"
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)

    const { batchName, format, items } = await getBatchDownloadItems(id, orgId)
    if (items.length === 0) {
      throw new AppError("Nenhuma imagem pronta pra baixar", 404)
    }

    const fetched = await Promise.allSettled(
      items.map(async (it) => {
        const r = await fetch(it.imageUrl)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return {
          storeName: it.storeName,
          variationIndex: it.variationIndex,
          url: it.imageUrl,
          buf: Buffer.from(await r.arrayBuffer()),
        }
      }),
    )

    const zip = new JSZip()
    let totalBytes = 0
    const usedNames = new Set<string>()
    for (const res of fetched) {
      if (res.status !== "fulfilled") {
        log.warn("image fetch failed", { reason: String(res.reason) })
        continue
      }
      const { storeName, variationIndex, url, buf } = res.value
      totalBytes += buf.length
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new AppError("Imagens combinadas excedem 60MB", 413)
      }
      const ext = extFromUrl(url)
      const base = `${sanitize(storeName)}_${format}_v${variationIndex + 1}`
      let filename = `${base}.${ext}`
      let n = 2
      while (usedNames.has(filename)) {
        filename = `${base}-${n}.${ext}`
        n++
      }
      usedNames.add(filename)
      zip.file(filename, buf)
    }

    if (Object.keys(zip.files).length === 0) {
      throw new AppError("Falha ao baixar as imagens", 502)
    }

    const arr = await zip.generateAsync({ type: "uint8array" })
    const ab = arr.buffer.slice(
      arr.byteOffset,
      arr.byteOffset + arr.byteLength,
    ) as ArrayBuffer
    const filename = `${sanitize(batchName)}-imagens.zip`

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
    log.error("image studio zip error", error)
    return errorResponse(request, error, "ImageStudioZip")
  }
}
