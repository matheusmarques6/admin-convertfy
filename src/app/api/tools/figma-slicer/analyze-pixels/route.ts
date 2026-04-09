import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaSlicer.AnalyzePixels")

export const runtime = "nodejs"
export const maxDuration = 30

// ============================================================================
// CONSTANTES DO ALGORITMO
// ============================================================================

const TARGET_WIDTH = 600 // largura fixa de análise (= largura de output)
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

// Passo 1 — scan grosso
const SCAN_INTERVAL = 10 // escaneia 1 linha a cada N (rápido)
const X_SAMPLE = 3 // amostra 1 pixel a cada N horizontalmente

// Passo 2 — detecção de transição
const RAW_DIST_THRESHOLD = 20 // distância RGB mínima para considerar transição
const RAW_DIST_CLASS_CHANGE = 10 // mínimo se a classe mudou (transição fraca mas real)

// Passo 3 — refinamento fino
const REFINE_RADIUS = 20 // ± N pixels ao redor da sugestão
const REFINE_STEP = 2
const REFINE_X_SAMPLE = 5

// Passo 4 — filtros finais
const MIN_SECTION_HEIGHT = 80 // mínimo entre cortes
const MIN_CUT_SCORE = 8 // score mínimo pra um corte ser válido
const MAX_SECTIONS = 8 // máximo de seções (= 7 cortes)
const MIN_FINAL_HEIGHT = 40 // seções menores que isso são fundidas

// ============================================================================
// UTILS
// ============================================================================

/**
 * Classifica uma cor média em uma categoria. Usado pra detectar mudanças
 * bruscas de tom de fundo entre seções (ex: hero escuro → corpo branco).
 */
function classifyBrightness(r: number, g: number, b: number): string {
  const avg = (r + g + b) / 3
  if (avg > 240) return "WHITE"
  if (avg > 200) return "LIGHT"
  if (avg < 30) return "BLACK"
  if (avg < 80) return "DARK"
  return "MID"
}

interface RowSummary {
  y: number
  avgR: number
  avgG: number
  avgB: number
  classification: string
}

interface RawTransition {
  y: number
  from: string
  to: string
  colorDist: number
}

interface RefinedCut {
  y: number
  score: number
}

// ============================================================================
// HANDLER
// ============================================================================

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

    const formData = await request.formData()
    const imageBase64 = formData.get("imageBase64") as string | null
    const file = formData.get("image") as File | null

    let buffer: Buffer
    if (imageBase64) {
      buffer = Buffer.from(imageBase64, "base64")
    } else if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: "Arquivo muito grande (máximo 20MB)." },
          { status: 400 }
        )
      }
      buffer = Buffer.from(await file.arrayBuffer())
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Envie a imagem no campo 'image' ou 'imageBase64'.",
        },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // ========================================================================
    // PASSO 0: normalizar para 600px de largura
    // ========================================================================
    const meta = await sharp(buffer).metadata()
    let width = meta.width ?? 0
    let height = meta.height ?? 0

    if (!width || !height) {
      return NextResponse.json(
        {
          success: false,
          error: "Não foi possível ler as dimensões da imagem.",
        },
        { status: 422 }
      )
    }

    if (width !== TARGET_WIDTH) {
      height = Math.round((height / width) * TARGET_WIDTH)
      width = TARGET_WIDTH
      buffer = await sharp(buffer)
        .resize(TARGET_WIDTH, height, { fit: "fill" })
        .png()
        .toBuffer()
    }

    // ========================================================================
    // PASSO 1: scan grosso — resumo de RGB + classificação por linha
    // ========================================================================
    const { data: pixels, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const ch = info.channels

    const rows: RowSummary[] = []

    for (let y = 0; y < height; y += SCAN_INTERVAL) {
      let sumR = 0
      let sumG = 0
      let sumB = 0
      let samples = 0

      for (let x = 0; x < width; x += X_SAMPLE) {
        const idx = (y * width + x) * ch
        sumR += pixels[idx]
        sumG += pixels[idx + 1]
        sumB += pixels[idx + 2]
        samples++
      }

      const avgR = sumR / samples
      const avgG = sumG / samples
      const avgB = sumB / samples

      rows.push({
        y,
        avgR,
        avgG,
        avgB,
        classification: classifyBrightness(avgR, avgG, avgB),
      })
    }

    // ========================================================================
    // PASSO 2: detectar transições (linhas onde a cor/classe muda)
    // ========================================================================
    const rawTransitions: RawTransition[] = []

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]

      const dist = Math.sqrt(
        Math.pow(prev.avgR - curr.avgR, 2) +
          Math.pow(prev.avgG - curr.avgG, 2) +
          Math.pow(prev.avgB - curr.avgB, 2)
      )

      const classChanged = prev.classification !== curr.classification
      if (
        dist > RAW_DIST_THRESHOLD ||
        (classChanged && dist > RAW_DIST_CLASS_CHANGE)
      ) {
        rawTransitions.push({
          y: curr.y,
          from: prev.classification,
          to: curr.classification,
          colorDist: dist,
        })
      }
    }

    // ========================================================================
    // PASSO 3: refinar cada transição com scan fino ±20px
    // ========================================================================
    const refinedCuts: RefinedCut[] = []

    for (const trans of rawTransitions) {
      const searchMin = Math.max(0, trans.y - REFINE_RADIUS)
      const searchMax = Math.min(height - 2, trans.y + REFINE_RADIUS)

      let bestY = trans.y
      let bestScore = 0

      for (let y = searchMin; y < searchMax; y += REFINE_STEP) {
        let totalDiff = 0
        let samples = 0

        for (let x = 0; x < width; x += REFINE_X_SAMPLE) {
          const idx1 = (y * width + x) * ch
          const idx2 = ((y + 1) * width + x) * ch
          totalDiff += Math.abs(pixels[idx1] - pixels[idx2])
          totalDiff += Math.abs(pixels[idx1 + 1] - pixels[idx2 + 1])
          totalDiff += Math.abs(pixels[idx1 + 2] - pixels[idx2 + 2])
          samples++
        }

        const avgDiff = totalDiff / (samples * 3)
        if (avgDiff > bestScore) {
          bestScore = avgDiff
          bestY = y
        }
      }

      refinedCuts.push({ y: bestY, score: bestScore })
    }

    // ========================================================================
    // PASSO 4: filtros finais
    // ========================================================================

    // 4a. Remove cortes com score muito baixo
    let validCuts = refinedCuts.filter((c) => c.score >= MIN_CUT_SCORE)

    // 4b. Ordena por Y
    validCuts.sort((a, b) => a.y - b.y)

    // 4c. Remove cortes muito próximos (mantém o mais forte)
    const spacedCuts: RefinedCut[] = []
    for (const cut of validCuts) {
      const last = spacedCuts[spacedCuts.length - 1]
      if (!last || cut.y - last.y >= MIN_SECTION_HEIGHT) {
        spacedCuts.push(cut)
      } else if (cut.score > last.score) {
        spacedCuts[spacedCuts.length - 1] = cut
      }
    }

    // 4d. Remove cortes muito perto das bordas (topo/base)
    let finalCuts = spacedCuts.filter(
      (c) => c.y > MIN_SECTION_HEIGHT && c.y < height - MIN_SECTION_HEIGHT
    )

    // 4e. Se ainda tem mais que MAX_SECTIONS-1 cortes, manter os mais fortes
    if (finalCuts.length > MAX_SECTIONS - 1) {
      finalCuts.sort((a, b) => b.score - a.score)
      finalCuts = finalCuts.slice(0, MAX_SECTIONS - 1)
      finalCuts.sort((a, b) => a.y - b.y)
    }

    // ========================================================================
    // PASSO 5: montar seções a partir dos cortes
    // ========================================================================
    const cutPoints = [0, ...finalCuts.map((c) => c.y), height]
    const rawSections: Array<{ name: string; y_start: number; y_end: number }> =
      []

    for (let i = 0; i < cutPoints.length - 1; i++) {
      rawSections.push({
        name: `parte_${i + 1}`,
        y_start: cutPoints[i],
        y_end: cutPoints[i + 1],
      })
    }

    // 5a. Merge de seções minúsculas (<40px) com a vizinha
    const mergedSections: typeof rawSections = []
    for (const s of rawSections) {
      const h = s.y_end - s.y_start
      if (h < MIN_FINAL_HEIGHT && mergedSections.length > 0) {
        // Merge com a anterior
        mergedSections[mergedSections.length - 1].y_end = s.y_end
      } else if (h < MIN_FINAL_HEIGHT && mergedSections.length === 0) {
        // Primeira é pequena demais — guarda e deixa a próxima absorver depois
        mergedSections.push(s)
      } else {
        mergedSections.push(s)
      }
    }

    // 5b. Se a primeira continuar pequena, merge pra frente
    while (
      mergedSections.length > 1 &&
      mergedSections[0].y_end - mergedSections[0].y_start < MIN_FINAL_HEIGHT
    ) {
      mergedSections[1].y_start = mergedSections[0].y_start
      mergedSections.splice(0, 1)
    }

    // 5c. Renumerar
    mergedSections.forEach((s, i) => {
      s.name = `parte_${i + 1}`
    })

    const durationMs = Date.now() - startTime

    log.info("Pixel analysis completed", {
      imageSize: `${width}x${height}`,
      rawTransitionsCount: rawTransitions.length,
      validCutsCount: validCuts.length,
      finalCutsCount: finalCuts.length,
      sectionsCount: mergedSections.length,
      durationMs,
    })

    return NextResponse.json({
      success: true,
      analysis: {
        width,
        height,
        sections: mergedSections,
        cuts_found: finalCuts.length,
      },
      duration_ms: durationMs,
    })
  } catch (error: unknown) {
    log.error("Pixel analysis failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : "Erro na análise"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
