import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import JSZip from "jszip"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.SliceBatch")

export const runtime = "nodejs"
export const maxDuration = 120

const TARGET_WIDTH = 600

interface EmailSliceRequest {
  emailName: string
  imageBase64: string
  sections: Array<{
    name: string
    y_start: number
    y_end: number
  }>
}

/**
 * Sanitiza strings para uso seguro em filesystem/zip. Preserva case,
 * underscores e hífens.
 */
function sanitizeFsName(input: string, fallback: string): string {
  const cleaned = input
    .replace(/[^A-Za-z0-9_\-\s]+/g, "")
    .replace(/\s+/g, "_")
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

    const body = (await request.json()) as {
      funnelName?: string
      emails?: EmailSliceRequest[]
    }
    const { funnelName, emails } = body

    if (
      !funnelName ||
      typeof funnelName !== "string" ||
      !Array.isArray(emails) ||
      emails.length === 0
    ) {
      return NextResponse.json(
        { error: "Campos 'funnelName' e 'emails' são obrigatórios." },
        { status: 400 }
      )
    }

    // Valida cada email
    for (let i = 0; i < emails.length; i++) {
      const e = emails[i]
      if (!e || typeof e !== "object") {
        return NextResponse.json(
          { error: `Email ${i + 1} inválido` },
          { status: 400 }
        )
      }
      if (typeof e.emailName !== "string" || e.emailName.length === 0) {
        return NextResponse.json(
          { error: `Email ${i + 1}: emailName ausente` },
          { status: 400 }
        )
      }
      if (typeof e.imageBase64 !== "string" || e.imageBase64.length === 0) {
        return NextResponse.json(
          { error: `Email "${e.emailName}": imageBase64 ausente` },
          { status: 400 }
        )
      }
      if (!Array.isArray(e.sections) || e.sections.length === 0) {
        return NextResponse.json(
          { error: `Email "${e.emailName}": sem seções` },
          { status: 400 }
        )
      }
      for (const s of e.sections) {
        if (
          typeof s.y_start !== "number" ||
          typeof s.y_end !== "number" ||
          s.y_end <= s.y_start
        ) {
          return NextResponse.json(
            {
              error: `Email "${e.emailName}": seção "${s.name}" tem coordenadas inválidas`,
            },
            { status: 400 }
          )
        }
      }
    }

    const zip = new JSZip()
    const safeFunnelName = sanitizeFsName(funnelName, "funnel")

    let totalSlices = 0

    for (const email of emails) {
      const safeEmailName = sanitizeFsName(email.emailName, "email")
      const folderPath = `${safeFunnelName}/${safeEmailName}`

      const sourceBuffer = Buffer.from(email.imageBase64, "base64")
      const meta = await sharp(sourceBuffer).metadata()
      const origWidth = meta.width ?? 0
      const origHeight = meta.height ?? 0
      if (!origWidth || !origHeight) {
        log.warn("Skipping email with invalid dimensions", {
          emailName: email.emailName,
        })
        continue
      }

      // Normaliza para 600px
      let imgBuffer: Buffer = sourceBuffer
      let imgHeight = origHeight
      if (origWidth !== TARGET_WIDTH) {
        imgHeight = Math.round((origHeight / origWidth) * TARGET_WIDTH)
        imgBuffer = Buffer.from(
          await sharp(sourceBuffer)
            .resize(TARGET_WIDTH, imgHeight, { fit: "fill" })
            .png()
            .toBuffer()
        )
      }

      for (const section of email.sections) {
        const yStart = Math.max(0, Math.round(section.y_start))
        const yEnd = Math.min(imgHeight, Math.round(section.y_end))
        const sliceHeight = yEnd - yStart
        if (sliceHeight <= 0) continue

        try {
          const sliceBuffer = await sharp(imgBuffer)
            .extract({
              left: 0,
              top: yStart,
              width: TARGET_WIDTH,
              height: sliceHeight,
            })
            .png()
            .toBuffer()

          const safeSliceName = sanitizeFsName(section.name, "parte")
          zip.file(`${folderPath}/${safeSliceName}.png`, sliceBuffer)
          totalSlices++
        } catch (sliceError) {
          log.error("Failed to cut section", {
            email: email.emailName,
            section: section.name,
            error:
              sliceError instanceof Error
                ? sliceError.message
                : String(sliceError),
          })
        }
      }
    }

    if (totalSlices === 0) {
      return NextResponse.json(
        { error: "Nenhuma fatia pôde ser gerada." },
        { status: 422 }
      )
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })

    // Log best-effort no Supabase (um registro por batch)
    try {
      await supabase.from("slicer_export_logs").insert({
        user_id: user.id,
        original_filename: `${funnelName}-batch`,
        original_width: TARGET_WIDTH,
        original_height: 0,
        slices_count: totalSlices,
        slice_data: emails.map((e) => ({
          email: e.emailName,
          sections: e.sections,
        })),
        analysis_method: "pixel_analysis",
      })
    } catch (logError) {
      log.warn("Failed to insert export log", {
        error: logError instanceof Error ? logError.message : String(logError),
      })
    }

    log.info("Batch slice completed", {
      funnel: funnelName,
      emailsCount: emails.length,
      totalSlices,
      zipKB: Math.round(zipBuffer.length / 1024),
    })

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFunnelName}-slices.zip"`,
        "Content-Length": String(zipBuffer.length),
      },
    })
  } catch (error: unknown) {
    log.error("Batch slice failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : "Erro ao gerar ZIP"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
