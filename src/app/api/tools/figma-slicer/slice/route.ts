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

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

function sanitizeName(name: string, fallback: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
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
    const sectionsJson = formData.get("sections") as string | null

    if (!file || !sectionsJson) {
      return NextResponse.json(
        { error: 'Campos "image" e "sections" são obrigatórios' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Máximo 10MB." },
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

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const metadata = await sharp(buffer).metadata()
    const imageWidth = metadata.width
    const imageHeight = metadata.height

    if (!imageWidth || !imageHeight) {
      return NextResponse.json(
        { error: "Não foi possível ler as dimensões da imagem" },
        { status: 422 }
      )
    }

    const zip = new JSZip()
    let slicesGenerated = 0

    for (let i = 0; i < sections.length; i++) {
      const raw = sections[i]
      const yStart = Math.max(0, Math.min(Math.round(raw.y_start), imageHeight))
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

        const safeName = sanitizeName(raw.name, `section_${i + 1}`)
        const fileName = `${String(i + 1).padStart(2, "0")}_${safeName}.png`
        zip.file(fileName, sliceBuffer)
        slicesGenerated++
      } catch (sliceError) {
        log.error("Failed to slice section", {
          name: raw.name,
          yStart,
          yEnd,
          error: sliceError instanceof Error ? sliceError.message : String(sliceError),
        })
        // Continuar com as outras seções
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

    // Best-effort log (errors are non-fatal so the user still gets the ZIP)
    try {
      await supabase.from("slicer_export_logs").insert({
        user_id: user.id,
        original_filename: file.name,
        original_width: imageWidth,
        original_height: imageHeight,
        slices_count: slicesGenerated,
        slice_data: sections,
        analysis_method: "claude_vision",
      })
    } catch (logError) {
      log.warn("Failed to insert export log", {
        error: logError instanceof Error ? logError.message : String(logError),
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
    const message = error instanceof Error ? error.message : "Erro ao processar imagem"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
