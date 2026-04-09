import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.ExportBatch")

export const runtime = "nodejs"
export const maxDuration = 120 // Batch pode demorar pra muitos emails

const TARGET_WIDTH = 600 // padrão Klaviyo/Omnisend
const MAX_BATCH_SIZE = 30 // segurança — não aceita mais que isso por request

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

    // Figma aceita múltiplos ids numa única chamada → 1 chamada pra N emails
    const idsParam = nodeIds.map((id) => encodeURIComponent(id)).join(",")
    const exportRes = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${idsParam}&format=png&scale=2`,
      { headers: { "X-Figma-Token": token } }
    )

    if (!exportRes.ok) {
      const errorText = await exportRes.text().catch(() => "")
      log.error("Figma batch export error", {
        status: exportRes.status,
        body: errorText.slice(0, 300),
      })
      throw new Error(`Figma export retornou ${exportRes.status}`)
    }

    const exportData = (await exportRes.json()) as {
      err?: string | null
      images?: Record<string, string | null>
    }

    if (exportData.err) {
      throw new Error(`Figma: ${exportData.err}`)
    }

    // Baixa cada imagem em paralelo e redimensiona pra 600px.
    // Usa Promise.allSettled pra tolerar falhas individuais.
    const results: Record<
      string,
      { base64: string; width: number; height: number } | null
    > = {}

    const downloadPromises = nodeIds.map(async (nodeId) => {
      const imageUrl = exportData.images?.[nodeId]
      if (!imageUrl) {
        results[nodeId] = null
        return
      }

      try {
        const imgRes = await fetch(imageUrl)
        if (!imgRes.ok) {
          log.warn("Failed to download image from Figma CDN", {
            nodeId,
            status: imgRes.status,
          })
          results[nodeId] = null
          return
        }

        const origBuffer = Buffer.from(await imgRes.arrayBuffer())
        const meta = await sharp(origBuffer).metadata()
        const origWidth = meta.width ?? 0
        const origHeight = meta.height ?? 0

        if (!origWidth || !origHeight) {
          results[nodeId] = null
          return
        }

        // Redimensiona para 600px de largura preservando aspect ratio
        const targetHeight = Math.round((origHeight / origWidth) * TARGET_WIDTH)

        const resizedBuffer = await sharp(origBuffer)
          .resize(TARGET_WIDTH, targetHeight, { fit: "fill" })
          .png({ compressionLevel: 9 })
          .toBuffer()

        results[nodeId] = {
          base64: resizedBuffer.toString("base64"),
          width: TARGET_WIDTH,
          height: targetHeight,
        }
      } catch (downloadError) {
        log.warn("Failed to process image", {
          nodeId,
          error:
            downloadError instanceof Error
              ? downloadError.message
              : String(downloadError),
        })
        results[nodeId] = null
      }
    })

    await Promise.allSettled(downloadPromises)

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
