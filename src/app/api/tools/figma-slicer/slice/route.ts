import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import JSZip from "jszip"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.Slice")

export const runtime = "nodejs"
export const maxDuration = 60

interface SliceSectionInput {
  name: string
  y_start: number
  y_end: number
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
const TARGET_WIDTH = 600 // Klaviyo/Omnisend padrão

/**
 * Sanitiza nome de seção. Preserva case, underscore e hífen —
 * necessário para nomes canônicos como "03_In-Klaviyo_Dynamic_Product_Section".
 */
function sanitizeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9_\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned || fallback
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("image") as File | null
    const imageBase64 = formData.get("imageBase64") as string | null
    const sectionsJson = formData.get("sections") as string | null

    if (!sectionsJson) {
      return NextResponse.json(
        { error: "Campo 'sections' é obrigatório" },
        { status: 400 }
      )
    }

    let buffer: Buffer
    let originalFilename = "email"

    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Arquivo muito grande. Máximo 20MB." },
          { status: 400 }
        )
      }
      buffer = Buffer.from(await file.arrayBuffer())
      originalFilename = file.name || "email"
    } else if (imageBase64) {
      buffer = Buffer.from(imageBase64, "base64")
    } else {
      return NextResponse.json(
        { error: "Envie o arquivo no campo 'image' ou 'imageBase64'." },
        { status: 400 }
      )
    }

    let sections: SliceSectionInput[]
    try {
      sections = JSON.parse(sectionsJson) as SliceSectionInput[]
    } catch {
      return NextResponse.json(
        { error: 'Campo "sections" deve ser JSON válido' },
        { status: 400 }
      )
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json(
        { error: "Pelo menos 1 seção é necessária" },
        { status: 400 }
      )
    }

    // =====================================================================
    // VALIDAÇÃO DEFENSIVA DAS SEÇÕES (estrutural, antes de cortar)
    //
    // Rejeita qualquer input que viole invariantes mínimos. Essa é a
    // última barreira antes da imagem ser cortada e baixada pelo cliente.
    // =====================================================================
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]
      if (typeof s !== "object" || s === null) {
        return NextResponse.json(
          { error: `Seção ${i + 1} inválida (não é um objeto)` },
          { status: 400 }
        )
      }
      if (typeof s.name !== "string" || s.name.trim().length === 0) {
        return NextResponse.json(
          { error: `Seção ${i + 1} sem nome válido` },
          { status: 400 }
        )
      }
      if (
        typeof s.y_start !== "number" ||
        typeof s.y_end !== "number" ||
        !Number.isFinite(s.y_start) ||
        !Number.isFinite(s.y_end)
      ) {
        return NextResponse.json(
          { error: `Seção "${s.name}" tem coordenadas Y inválidas` },
          { status: 400 }
        )
      }
      if (s.y_end <= s.y_start) {
        return NextResponse.json(
          {
            error: `Seção "${s.name}" tem altura inválida (y_end deve ser maior que y_start)`,
          },
          { status: 400 }
        )
      }
    }

    // Valida contiguidade: y_end de uma seção = y_start da próxima
    for (let i = 1; i < sections.length; i++) {
      if (Math.abs(sections[i].y_start - sections[i - 1].y_end) > 1) {
        return NextResponse.json(
          {
            error: `Seções não são contíguas entre "${sections[i - 1].name}" e "${sections[i].name}" (gap detectado)`,
          },
          { status: 400 }
        )
      }
    }

    // Normaliza para 600px de largura — MESMA escala usada na analyze,
    // então as coordenadas Y vêm já corretas.
    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) {
      return NextResponse.json(
        { error: "Não foi possível ler as dimensões da imagem" },
        { status: 422 }
      )
    }

    if (meta.width !== TARGET_WIDTH) {
      const newHeight = Math.round((meta.height / meta.width) * TARGET_WIDTH)
      buffer = await sharp(buffer)
        .resize(TARGET_WIDTH, newHeight, { fit: "fill" })
        .png()
        .toBuffer()
    }

    const finalMeta = await sharp(buffer).metadata()
    const imageWidth = finalMeta.width ?? TARGET_WIDTH
    const imageHeight = finalMeta.height ?? 0

    if (!imageHeight) {
      return NextResponse.json(
        { error: "Altura da imagem inválida após normalização" },
        { status: 500 }
      )
    }

    const zip = new JSZip()
    let slicesGenerated = 0

    for (let i = 0; i < sections.length; i++) {
      const raw = sections[i]
      const yStart = Math.max(
        0,
        Math.min(Math.round(raw.y_start), imageHeight)
      )
      const yEnd = Math.max(0, Math.min(Math.round(raw.y_end), imageHeight))
      const sliceHeight = yEnd - yStart

      if (sliceHeight <= 0) continue

      try {
        const sliceBuffer = await sharp(buffer)
          .extract({
            left: 0,
            top: yStart,
            width: imageWidth,
            height: sliceHeight,
          })
          .png()
          .toBuffer()

        // Nome: usa o nome da seção; se não tem prefixo NN_, adiciona
        const rawName = (raw.name || "").trim()
        const hasPrefix = /^\d{2}_/.test(rawName)
        const safeName = hasPrefix
          ? sanitizeName(rawName, `section_${i + 1}`)
          : `${String(i + 1).padStart(2, "0")}_${sanitizeName(
              rawName,
              `section_${i + 1}`
            )}`
        const fileName = `${safeName}.png`

        zip.file(fileName, sliceBuffer)
        slicesGenerated++
      } catch (sliceError) {
        log.error("Failed to slice section", {
          name: raw.name,
          yStart,
          yEnd,
          error:
            sliceError instanceof Error
              ? sliceError.message
              : String(sliceError),
        })
      }
    }

    if (slicesGenerated === 0) {
      return NextResponse.json(
        { error: "Nenhum corte válido foi gerado" },
        { status: 422 }
      )
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })

    // Log best-effort no Supabase
    try {
      await supabase.from("slicer_export_logs").insert({
        user_id: user.id,
        original_filename: originalFilename,
        original_width: imageWidth,
        original_height: imageHeight,
        slices_count: slicesGenerated,
        slice_data: sections,
        analysis_method: "claude_vision",
      })
    } catch (logError) {
      log.warn("Failed to insert export log", {
        error:
          logError instanceof Error ? logError.message : String(logError),
      })
    }

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="email-slices-${Date.now()}.zip"`,
        "Content-Length": String(zipBuffer.length),
      },
    })
  } catch (error: unknown) {
    log.error("Slice generation failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : "Erro ao processar imagem"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
