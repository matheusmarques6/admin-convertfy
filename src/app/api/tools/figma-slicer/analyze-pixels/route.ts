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

// Scan de linha por linha
const X_SAMPLE = 2 // amostra horizontal a cada N pixels (pra calcular variância)

// ------ Detecção de whitespace gaps (fronteiras REAIS entre seções) ------
// Um "gap" é uma faixa de linhas consecutivas com fundo uniforme (baixa
// variância) e cor consistente. Emails marketing tipicamente têm 30-80px
// de espaço vazio entre blocos funcionais (hero → body → grid → footer).
const GAP_VARIANCE_MAX = 400 // linha é "uniforme" se variância horizontal < N
const GAP_COLOR_DRIFT_MAX = 15 // dentro de um gap, a cor média não pode variar mais que N
const GAP_MIN_HEIGHT = 20 // gap precisa ter ≥ N pixels de altura pra ser um corte real

// ------ Detecção de transição forte de fundo dominante ------
// Pra casos onde NÃO há gap (ex: hero azul termina exatamente onde body
// branco começa). Exige uma mudança MUITO grande de cor.
const STRONG_TRANSITION_DIST = 120 // distância RGB pra considerar uma mudança de fundo

// ------ Filtros finais ------
const MIN_SECTION_HEIGHT = 200 // mínimo entre cortes
// MAX_SECTIONS é dinâmico (calculado por altura do email) — veja o handler
const MIN_FINAL_HEIGHT = 150 // seções menores que isso são fundidas

// ============================================================================
// UTILS
// ============================================================================

interface RowStats {
  y: number
  avgR: number
  avgG: number
  avgB: number
  variance: number // variância horizontal (quão "uniforme" é a linha)
}

interface CutCandidate {
  y: number
  score: number
  source: "gap" | "transition" // origem do corte pra debug
}

/**
 * Calcula a distância RGB Euclidiana entre duas cores médias.
 */
function colorDistance(a: RowStats, b: RowStats): number {
  return Math.sqrt(
    Math.pow(a.avgR - b.avgR, 2) +
      Math.pow(a.avgG - b.avgG, 2) +
      Math.pow(a.avgB - b.avgB, 2)
  )
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
    // PASSO 1: calcular estatísticas de CADA linha
    // avgR/G/B + variância horizontal (quão uniforme é a linha)
    // ========================================================================
    const { data: pixels, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const ch = info.channels

    const rows: RowStats[] = new Array(height)

    for (let y = 0; y < height; y++) {
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

      // Variância horizontal: quão "uniforme" é essa linha
      let variance = 0
      for (let x = 0; x < width; x += X_SAMPLE) {
        const idx = (y * width + x) * ch
        variance += Math.pow(pixels[idx] - avgR, 2)
        variance += Math.pow(pixels[idx + 1] - avgG, 2)
        variance += Math.pow(pixels[idx + 2] - avgB, 2)
      }
      variance = variance / (samples * 3)

      rows[y] = { y, avgR, avgG, avgB, variance }
    }

    // ========================================================================
    // PASSO 2A: detectar WHITESPACE GAPS
    // Runs de linhas consecutivas com variância baixa (fundo sólido)
    // e cor consistente entre si. Esses gaps são as fronteiras REAIS
    // entre blocos funcionais do email.
    // ========================================================================
    const gapCandidates: CutCandidate[] = []
    let gapStart = -1
    let gapBaseColor: { r: number; g: number; b: number } | null = null

    const closeGap = (endY: number) => {
      if (gapStart === -1 || !gapBaseColor) return
      const gapHeight = endY - gapStart
      if (gapHeight >= GAP_MIN_HEIGHT) {
        // Centro do gap = ponto ideal de corte
        const centerY = Math.round((gapStart + endY) / 2)
        // Score proporcional ao tamanho do gap (gap maior = corte mais forte)
        const score = gapHeight * 4
        gapCandidates.push({ y: centerY, score, source: "gap" })
      }
      gapStart = -1
      gapBaseColor = null
    }

    for (let y = 0; y < height; y++) {
      const row = rows[y]
      const isUniform = row.variance < GAP_VARIANCE_MAX

      if (isUniform) {
        if (gapStart === -1) {
          // Começa um gap novo
          gapStart = y
          gapBaseColor = { r: row.avgR, g: row.avgG, b: row.avgB }
        } else if (gapBaseColor) {
          // Verifica se a cor ainda é similar à do início do gap
          const drift =
            Math.abs(row.avgR - gapBaseColor.r) +
            Math.abs(row.avgG - gapBaseColor.g) +
            Math.abs(row.avgB - gapBaseColor.b)
          if (drift > GAP_COLOR_DRIFT_MAX * 3) {
            // Cor mudou dentro do gap — fecha o anterior e começa novo
            closeGap(y - 1)
            gapStart = y
            gapBaseColor = { r: row.avgR, g: row.avgG, b: row.avgB }
          }
        }
      } else {
        // Linha com conteúdo — fecha o gap atual se existir
        closeGap(y - 1)
      }
    }
    closeGap(height - 1)

    // ========================================================================
    // PASSO 2B: detectar TRANSIÇÕES FORTES de cor de fundo
    // Pra casos onde NÃO há gap (ex: hero colorido termina exatamente
    // onde body branco começa, sem espaço vazio entre eles).
    // Exige uma distância RGB muito grande entre linhas uniformes vizinhas.
    // ========================================================================
    const transitionCandidates: CutCandidate[] = []

    for (let y = 1; y < height; y++) {
      const prev = rows[y - 1]
      const curr = rows[y]
      const dist = colorDistance(prev, curr)

      if (dist >= STRONG_TRANSITION_DIST) {
        transitionCandidates.push({
          y,
          score: Math.round(dist),
          source: "transition",
        })
      }
    }

    // ========================================================================
    // PASSO 3: unificar candidatos e filtrar
    // ========================================================================
    const allCandidates: CutCandidate[] = [
      ...gapCandidates,
      ...transitionCandidates,
    ]
    allCandidates.sort((a, b) => a.y - b.y)

    // 3a. Remove candidatos muito perto das bordas (topo/base)
    let filtered = allCandidates.filter(
      (c) => c.y > 100 && c.y < height - 100
    )

    // 3b. Consolida candidatos muito próximos (mantém o de maior score)
    const consolidated: CutCandidate[] = []
    for (const cand of filtered) {
      const last = consolidated[consolidated.length - 1]
      if (!last || cand.y - last.y >= MIN_SECTION_HEIGHT) {
        consolidated.push(cand)
      } else if (cand.score > last.score) {
        consolidated[consolidated.length - 1] = cand
      }
    }

    filtered = consolidated

    // 3c. MAX_SECTIONS dinâmico baseado na altura do email
    const MAX_SECTIONS = Math.max(3, Math.min(8, Math.floor(height / 400)))
    let finalCuts = filtered
    if (finalCuts.length > MAX_SECTIONS - 1) {
      finalCuts = [...filtered].sort((a, b) => b.score - a.score)
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
      gapCandidatesCount: gapCandidates.length,
      transitionCandidatesCount: transitionCandidates.length,
      finalCutsCount: finalCuts.length,
      sectionsCount: mergedSections.length,
      maxSections: MAX_SECTIONS,
      durationMs,
      finalCutsDetail: finalCuts.map((c) => ({
        y: c.y,
        score: c.score,
        source: c.source,
      })),
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
