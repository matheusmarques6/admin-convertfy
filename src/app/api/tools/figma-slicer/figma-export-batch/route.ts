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
// Scale=4 (2400px) causava timeout no Vercel porque o download de 8
// imagens de 2400px do CDN do Figma levava >120s. Scale=2 é o sweet
// spot: 2x a resolução final (600px), rápido pra baixar, e os slices
// ficam nítidos porque cropamos em 1200px e resizamos pra 600px.
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
    // Chama Figma /v1/images em CHUNKS (use_absolute_bounds=true).
    //
    // POR QUE CHUNKS:
    //   Quando mandávamos 28 IDs de uma vez, o URL ficava gigante
    //   (~500+ caracteres só de IDs encoded) e o Figma retornava 400.
    //   Chunks de 8 evitam esse problema.
    //
    // use_absolute_bounds=true é CRÍTICO: sem isso, conteúdo que extrapola
    // o bounding box visível do frame é CORTADO no export.
    //
    // scale=2 garante qualidade de sobra — depois reduzimos pra 600px no
    // resize final com sharp (mais preciso que o resize da Figma API).
    // ========================================================================
    const allImageUrls: Record<string, string | null> = {}

    const chunks: string[][] = []
    for (let i = 0; i < nodeIds.length; i += FIGMA_CHUNK_SIZE) {
      chunks.push(nodeIds.slice(i, i + FIGMA_CHUNK_SIZE))
    }

    log.info("Starting Figma batch export", {
      totalIds: nodeIds.length,
      chunks: chunks.length,
      chunkSize: FIGMA_CHUNK_SIZE,
    })

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx]
      const idsParam = chunk.map((id) => encodeURIComponent(id)).join(",")
      const figmaExportUrl =
        `https://api.figma.com/v1/images/${fileKey}` +
        `?ids=${idsParam}` +
        `&format=png` +
        `&scale=${FIGMA_EXPORT_SCALE}` +
        `&use_absolute_bounds=true`

      let exportRes: Response | null = null
      let exportErrorBody = ""

      // Retry da chamada pra Figma API
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          exportRes = await fetch(figmaExportUrl, {
            headers: { "X-Figma-Token": token },
          })
          if (exportRes.ok) break
          // Tenta ler o body do erro pra log (pode ser HTML ou JSON)
          try {
            exportErrorBody = (await exportRes.clone().text()).slice(0, 500)
          } catch {
            // ignora
          }
          log.warn("Figma chunk export failed", {
            chunkIdx,
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
        log.error("Figma chunk failed after all retries, skipping", {
          chunkIdx,
          bodyPreview: exportErrorBody,
          idsInChunk: chunk.length,
        })
        // Marca todos os IDs do chunk como null, mas continua com os outros
        for (const id of chunk) {
          allImageUrls[id] = null
        }
        continue
      }

      let exportData: {
        err?: string | null
        images?: Record<string, string | null>
      }
      try {
        exportData = await exportRes.json()
      } catch (err) {
        log.error("Failed to parse Figma chunk response as JSON", {
          chunkIdx,
          error: err instanceof Error ? err.message : String(err),
        })
        for (const id of chunk) {
          allImageUrls[id] = null
        }
        continue
      }

      if (exportData.err) {
        log.error("Figma returned error for chunk", {
          chunkIdx,
          error: exportData.err,
        })
        for (const id of chunk) {
          allImageUrls[id] = null
        }
        continue
      }

      // Adiciona as URLs do chunk ao mapa geral
      if (exportData.images) {
        for (const [id, url] of Object.entries(exportData.images)) {
          allImageUrls[id] = url
        }
      }
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
      const imageUrl = allImageUrls[nodeId]
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

        // Mantém a resolução alta (scale=2 = 1200px) mas converte pra
        // JPEG com quality alta pra reduzir o tamanho do payload.
        // PNG de 1200×7000 pode ser 8-10MB → JPEG q90 fica ~1-2MB.
        // Isso evita estourar o body limit quando o frontend envia
        // pro analyze-pixels e mantém qualidade visual excelente.
        const optimizedBuffer = await sharp(origBuffer)
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer()

        results[nodeId] = {
          base64: optimizedBuffer.toString("base64"),
          width: origWidth,
          height: origHeight,
          originalWidth: origWidth,
          originalHeight: origHeight,
        }

        log.info("Exported email (high-res)", {
          nodeId,
          size: `${origWidth}x${origHeight}`,
          payloadKB: Math.round(optimizedBuffer.length / 1024),
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
