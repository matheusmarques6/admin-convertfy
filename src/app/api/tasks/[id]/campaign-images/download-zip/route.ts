/**
 * GET /api/tasks/[id]/campaign-images/download-zip?batch_id=<uuid>
 *
 * Baixa TODAS as imagens prontas de um lote (status ready/adjustment) num único
 * .zip montado em memória. Acesso é o da própria task de campanha
 * (requireTaskAccess read). Espelha /api/admin/stores/[id]/brand-identity/download-zip.
 */

import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { getBatchDownloadItems } from "@/lib/services/campaign-central/campaign-image-generation.service"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignImageZip")

export const dynamic = "force-dynamic"
// Faz N fetches de imagem + zipa em memória — pode passar de 60s num lote grande.
export const maxDuration = 300

const MAX_TOTAL_BYTES = 60 * 1024 * 1024 // 60 MB

const querySchema = z.object({ batch_id: z.string().uuid() })

/** Normaliza nome pra filename seguro (sem acento/espaço). */
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

/** Extensão do path da URL (ignora query string); default png. */
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
    const ctx = await requireTaskAccess(user.id, id, "read")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    const parsed = querySchema.safeParse({
      batch_id: request.nextUrl.searchParams.get("batch_id"),
    })
    if (!parsed.success) {
      throw new AppError("batch_id inválido", 400)
    }

    const { batchName, format, items } = await getBatchDownloadItems(
      parsed.data.batch_id,
      ctx.member.orgId,
    )
    if (items.length === 0) {
      throw new AppError("Nenhuma imagem pronta pra baixar", 404)
    }

    // Fetch em paralelo; falha individual é pulada (best-effort).
    const fetched = await Promise.allSettled(
      items.map(async (it) => {
        const r = await fetch(it.imageUrl)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return {
          storeName: it.storeName,
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
      const { storeName, url, buf } = res.value
      totalBytes += buf.length
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new AppError("Imagens combinadas excedem 60MB", 413)
      }
      // Nome único: {loja}_{formato}.{ext}, com sufixo -N se colidir.
      const ext = extFromUrl(url)
      const base = `${sanitize(storeName)}_${format}`
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
    log.error("campaign image zip error", error)
    return errorResponse(request, error, "tasks:campaign-images:download-zip")
  }
}
