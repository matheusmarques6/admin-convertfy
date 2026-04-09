import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.ExportBatch")

export const runtime = "nodejs"
export const maxDuration = 120

const TARGET_WIDTH = 600 // padrão Klaviyo/Omnisend
const MAX_BATCH_SIZE = 30
// Exporta do Figma em 2x para ter qualidade suficiente antes do resize final.
// Se o frame no Figma tem 600px, a imagem exportada vem em 1200px.
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
    // Chama Figma /v1/images com use_absolute_bounds=true
    //
    // use_absolute_bounds=true é CRÍTICO: sem isso, conteúdo que extrapola
    // o bounding box visível do frame é CORTADO no export. Com true, o
    // Figma renderiza a imagem inteira incluindo qualquer overflow.
    //
    // scale=2 garante qualidade de sobra — depois reduzimos pra 600px no
    // resize final com sharp (que é mais preciso que o resize da Figma API).
    // ========================================================================
    const idsParam = nodeIds.map((id) => encodeURIComponent(id)).join(",")
    const figmaExportUrl =
      `https://api.figma.com/v1/images/${fileKey}` +
      `?ids=${idsParam}` +
      `&format=png` +
      `&scale=${FIGMA_EXPORT_SCALE}` +
      `&use_absolute_bounds=true`

    let exportRes: Response | null = null
    let exportError = ""

    // Retry da chamada pra Figma API (pode ser lenta ou falhar)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        exportRes = await fetch(figmaExportUrl, {
          headers: { "X-Figma-Token": token },
        })
        if (exportRes.ok) break
        exportError = `Figma retornou ${exportRes.status}`
        log.warn("Figma batch export attempt failed", {
          attempt: attempt + 1,
          status: exportRes.status,
        })
      } catch (err) {
        exportError = err instanceof Error ? err.message : String(err)
      }
      if (attempt < 2) await sleep(2000 * (attempt + 1))
    }

    if (!exportRes || !exportRes.ok) {
      log.error("Figma batch export failed after retries", { exportError })
      throw new Error(`Figma export: ${exportError}`)
    }

    const exportData = (await exportRes.json()) as {
      err?: string | null
      images?: Record<string, string | null>
    }

    if (exportData.err) {
      throw new Error(`Figma: ${exportData.err}`)
    }

    // ========================================================================
    // Baixa e redimensiona cada imagem em paralelo
    // ========================================================================
    const results: Record<
      string,
      {
        base64: string
        width: number
        height: number
        originalWidth: number
        originalHeight: number
      } | null
    > = {}

    const processOne = async (nodeId: string) => {
      const imageUrl = exportData.images?.[nodeId]
      if (!imageUrl) {
        log.warn("Figma returned null URL for node", { nodeId })
        results[nodeId] = null
        return
      }

      const origBuffer = await downloadImageWithRetry(imageUrl, nodeId)
      if (!origBuffer) {
        results[nodeId] = null
        return
      }

      try {
        const meta = await sharp(origBuffer).metadata()
        const origWidth = meta.width ?? 0
        const origHeight = meta.height ?? 0

        if (!origWidth || !origHeight) {
          log.warn("Invalid dimensions from Figma", { nodeId, origWidth, origHeight })
          results[nodeId] = null
          return
        }

        // Redimensiona para 600px de largura preservando aspect ratio.
        // IMPORTANTE: usa fit: "inside" (não "fill") para NÃO distorcer.
        // O height é calculado automaticamente por sharp.
        const resizedBuffer = await sharp(origBuffer)
          .resize({
            width: TARGET_WIDTH,
            fit: "inside",
            withoutEnlargement: false,
          })
          .png({ compressionLevel: 9 })
          .toBuffer()

        const resizedMeta = await sharp(resizedBuffer).metadata()

        results[nodeId] = {
          base64: resizedBuffer.toString("base64"),
          width: resizedMeta.width ?? TARGET_WIDTH,
          height: resizedMeta.height ?? 0,
          originalWidth: origWidth,
          originalHeight: origHeight,
        }

        log.info("Exported and resized email", {
          nodeId,
          figmaSize: `${origWidth}x${origHeight}`,
          finalSize: `${resizedMeta.width}x${resizedMeta.height}`,
          payloadKB: Math.round(resizedBuffer.length / 1024),
        })
      } catch (err) {
        log.warn("Failed to process image", {
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
