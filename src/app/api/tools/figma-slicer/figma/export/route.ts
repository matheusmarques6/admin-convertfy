import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.FigmaExport")

export const runtime = "nodejs"
export const maxDuration = 60

// Largura padrão do output — padrão email marketing (Klaviyo/Omnisend)
const TARGET_WIDTH = 600

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

    const figmaToken = process.env.FIGMA_PERSONAL_TOKEN
    if (!figmaToken) {
      return NextResponse.json(
        {
          success: false,
          error: "FIGMA_PERSONAL_TOKEN não configurado no servidor.",
        },
        { status: 503 }
      )
    }

    const { fileKey, nodeId } = (await request.json()) as {
      fileKey?: string
      nodeId?: string
    }

    if (!fileKey || !nodeId) {
      return NextResponse.json(
        { success: false, error: "Campos 'fileKey' e 'nodeId' são obrigatórios." },
        { status: 400 }
      )
    }

    // 1. Pede o export do node para o Figma (scale=2 = alta resolução)
    const exportRes = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(
        nodeId
      )}&format=png&scale=2`,
      {
        headers: { "X-Figma-Token": figmaToken },
      }
    )

    if (!exportRes.ok) {
      const errorText = await exportRes.text().catch(() => "")
      log.error("Figma export endpoint error", {
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

    const imageUrl = exportData.images?.[nodeId]
    if (!imageUrl) {
      throw new Error("Figma não retornou uma URL para a imagem exportada.")
    }

    // 2. Baixa a imagem do CDN do Figma
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) {
      throw new Error(
        `Falha ao baixar a imagem do Figma (status ${imgRes.status})`
      )
    }

    const originalBuffer = Buffer.from(await imgRes.arrayBuffer())
    const originalMeta = await sharp(originalBuffer).metadata()
    const origWidth = originalMeta.width ?? 0
    const origHeight = originalMeta.height ?? 0

    if (!origWidth || !origHeight) {
      throw new Error("Não foi possível ler as dimensões da imagem exportada.")
    }

    // 3. Redimensiona para 600px de largura (padrão email marketing)
    // preservando proporção.
    const targetHeight = Math.round((origHeight / origWidth) * TARGET_WIDTH)

    const resizedBuffer = await sharp(originalBuffer)
      .resize(TARGET_WIDTH, targetHeight, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toBuffer()

    const base64 = resizedBuffer.toString("base64")

    log.info("Figma email exported", {
      fileKey,
      nodeId,
      originalSize: `${origWidth}x${origHeight}`,
      targetSize: `${TARGET_WIDTH}x${targetHeight}`,
      payloadKB: Math.round(resizedBuffer.length / 1024),
    })

    return NextResponse.json({
      success: true,
      imageBase64: base64,
      dimensions: { width: TARGET_WIDTH, height: targetHeight },
      originalDimensions: { width: origWidth, height: origHeight },
    })
  } catch (error: unknown) {
    log.error("Figma export failed", {
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
