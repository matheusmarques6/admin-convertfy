import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.ExportBatch")

export const runtime = "nodejs"
export const maxDuration = 120

const TARGET_WIDTH = 600 // largura de ANÁLISE (coordenadas do Claude)
const MAX_BATCH_SIZE = 30
const FIGMA_CHUNK_SIZE = 8
// Scale=2 gera 1200px de largura (pra um frame de 600px no Figma).
// Scale=2 é o sweet spot: 2x a resolução final (600px), rápido pra baixar.
const FIGMA_EXPORT_SCALE = 2

/**
 * Delay helper para retries.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Baixa uma imagem do CDN do Figma com retry exponencial.
 * Retorna Buffer ou null se todas as tentativas falharem.
 */
async function downloadImageWithRetry(
  imageUrl: string,
  nodeId: string,
  maxRetries = 3
): Promise<Buffer | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const imgRes = await fetch(imageUrl)
      if (imgRes.ok) {
        return Buffer.from(await imgRes.arrayBuffer())
      }
      log.warn("Download attempt failed", {
        nodeId,
        attempt: attempt + 1,
        status: imgRes.status,
      })
    } catch (err) {
      log.warn("Download attempt threw", {
        nodeId,
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (attempt < maxRetries - 1) {
      await sleep(1000 * (attempt + 1))
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      )
    }

    const token = process.env.FIGMA_PERSONAL_TOKEN
    if (!token) {
      return NextResponse.json(
        { success: false, error: "FIGMA_PERSONAL_TOKEN não configurado." },
        { status: 503 }
      )
    }

    const { fileKey, nodeIds } = (await request.json()) as {
      fileKey?: string
      nodeIds?: string[]
    }

    if (!fileKey || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Campos 'fileKey' e 'nodeIds' são obrigatórios.",
        },
        { status: 400 }
      )
    }

    if (nodeIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Máximo de ${MAX_BATCH_SIZE} emails por request (recebido: ${nodeIds.length}).`,
        },
        { status: 400 }
      )
    }

    // ========================================================================
    // DUAL EXPORT: PDF (pro Claude) + PNG (pro preview/corte)
    //
    // Exporta cada email em 2 formatos:
    // - PDF: mandado pro Claude Opus como document block (qualidade vetorial)
    // - PNG: usado pro preview no frontend e pro corte final com sharp
    //
    // São 2 chamadas ao Figma por chunk, mas cada uma é rápida (~2-5s).
    // ========================================================================

    async function fetchFigmaImages(
      ids: string[],
      format: "pdf" | "png",
      scale: number,
    ): Promise<Record<string, string | null>> {
      const idsParam = ids.map((id) => encodeURIComponent(id)).join(",")
      const figmaExportUrl =
        `https://api.figma.com/v1/images/${fileKey}` +
        `?ids=${idsParam}` +
        `&format=${format}` +
        `&scale=${scale}` +
        `&use_absolute_bounds=true`

      let exportRes: Response | null = null
      let exportErrorBody = ""

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          exportRes = await fetch(figmaExportUrl, {
            headers: { "X-Figma-Token": token! },
          })
          if (exportRes.ok) break
          try {
            exportErrorBody = (await exportRes.clone().text()).slice(0, 500)
          } catch { /* ignora */ }
          log.warn(`Figma ${format} export failed`, {
            attempt: attempt + 1,
            status: exportRes.status,
            bodyPreview: exportErrorBody,
          })
        } catch (err) {
          exportErrorBody = err instanceof Error ? err.message : String(err)
        }
        if (attempt < 2) await sleep(1500 * (attempt + 1))
      }

      if (!exportRes || !exportRes.ok) {
        log.error(`Figma ${format} export failed after retries`)
        const result: Record<string, string | null> = {}
        ids.forEach((id) => { result[id] = null })
        return result
      }

      let data: { err?: string | null; images?: Record<string, string | null> }
      try {
        data = await exportRes.json()
      } catch {
        const result: Record<string, string | null> = {}
        ids.forEach((id) => { result[id] = null })
        return result
      }

      return data.images || {}
    }

    // Processa 1 email por vez (já que o frontend manda 1 ID)
    const allPdfUrls: Record<string, string | null> = {}
    const allPngUrls: Record<string, string | null> = {}

    const chunks: string[][] = []
    for (let i = 0; i < nodeIds.length; i += FIGMA_CHUNK_SIZE) {
      chunks.push(nodeIds.slice(i, i + FIGMA_CHUNK_SIZE))
    }

    log.info("Starting Figma dual export (PDF + PNG)", {
      totalIds: nodeIds.length,
      chunks: chunks.length,
    })

    for (const chunk of chunks) {
      // PDF pra Claude (scale não importa pra PDF)
      const pdfResult = await fetchFigmaImages(chunk, "pdf", 1)
      Object.assign(allPdfUrls, pdfResult)

      // PNG pra preview/corte (scale=2 = 1200px)
      const pngResult = await fetchFigmaImages(chunk, "png", FIGMA_EXPORT_SCALE)
      Object.assign(allPngUrls, pngResult)
    }

    // ========================================================================
    // Baixa PDF + PNG de cada email em paralelo
    // ========================================================================
    const results: Record<
      string,
      {
        base64: string         // PNG/JPEG pra preview
        pdfBase64?: string | null  // PDF pra Claude
        width: number
        height: number
        originalWidth: number
        originalHeight: number
      } | null
    > = {}

    const processOne = async (nodeId: string) => {
      const pdfUrl = allPdfUrls[nodeId]
      const pngUrl = allPngUrls[nodeId]

      if (!pdfUrl && !pngUrl) {
        log.warn("Figma returned null URLs for node", { nodeId })
        results[nodeId] = null
        return
      }

      // Baixa PDF (pra Claude)
      let pdfBase64: string | null = null
      if (pdfUrl) {
        const pdfBuf = await downloadImageWithRetry(pdfUrl, nodeId)
        if (pdfBuf) {
          pdfBase64 = pdfBuf.toString("base64")
        }
      }

      // Baixa PNG (pra preview + corte)
      let pngBase64: string | null = null
      let imgWidth = 0
      let imgHeight = 0
      if (pngUrl) {
        const pngBuf = await downloadImageWithRetry(pngUrl, nodeId)
        if (pngBuf) {
          try {
            const meta = await sharp(pngBuf).metadata()
            imgWidth = meta.width ?? 0
            imgHeight = meta.height ?? 0
            // Otimiza com JPEG pra reduzir tamanho do payload
            const optimized = await sharp(pngBuf)
              .jpeg({ quality: 92, mozjpeg: true })
              .toBuffer()
            pngBase64 = optimized.toString("base64")
          } catch {
            // Se sharp falha, usa o PNG raw
            pngBase64 = pngBuf.toString("base64")
          }
        }
      }

      if (!pngBase64 && !pdfBase64) {
        results[nodeId] = null
        return
      }

      try {
        results[nodeId] = {
          base64: pngBase64 || "", // PNG/JPEG pra preview
          pdfBase64: pdfBase64,    // PDF pra Claude
          width: imgWidth,
          height: imgHeight,
          originalWidth: imgWidth,
          originalHeight: imgHeight,
        }

        log.info("Exported email (PDF + PNG)", {
          nodeId,
          pngSize: `${imgWidth}x${imgHeight}`,
          pdfKB: pdfBase64 ? Math.round((pdfBase64.length * 3) / 4 / 1024) : 0,
          pngKB: pngBase64 ? Math.round((pngBase64.length * 3) / 4 / 1024) : 0,
        })
      } catch (err) {
        log.warn("Failed to process", {
          nodeId,
          error: err instanceof Error ? err.message : String(err),
        })
        results[nodeId] = null
      }
    }

    await Promise.allSettled(nodeIds.map(processOne))

    const successCount = Object.values(results).filter((r) => r !== null).length
    log.info("Batch export completed", {
      fileKey,
      requested: nodeIds.length,
      succeeded: successCount,
      failed: nodeIds.length - successCount,
    })

    return NextResponse.json({ success: true, images: results })
  } catch (error: unknown) {
    log.error("Batch export failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : "Erro ao exportar do Figma"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
