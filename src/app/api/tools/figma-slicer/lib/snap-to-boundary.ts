import sharp from "sharp"

/**
 * Dado uma imagem e uma coordenada Y sugerida, encontra a fronteira visual
 * mais próxima analisando a uniformidade das linhas de pixels.
 *
 * Uma "fronteira" é onde a cor média de uma faixa horizontal muda
 * significativamente, ou onde há uma linha de cor uniforme (separador).
 *
 * Procura num raio de ±searchRadius ao redor da sugestão.
 */
export async function snapToBoundary(
  imageBuffer: Buffer,
  suggestedY: number,
  searchRadius = 60
): Promise<number> {
  const metadata = await sharp(imageBuffer).metadata()
  const width = metadata.width
  const height = metadata.height

  if (!width || !height) return suggestedY

  // Clampar a área de busca
  const minY = Math.max(0, suggestedY - searchRadius)
  const maxY = Math.min(height - 1, suggestedY + searchRadius)
  const regionHeight = maxY - minY + 1

  if (regionHeight <= 1) return suggestedY

  // Extrair a faixa de pixels ao redor do ponto sugerido
  const { data: pixels, info } = await sharp(imageBuffer)
    .extract({ left: 0, top: minY, width, height: regionHeight })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels // 3 (RGB) ou 4 (RGBA)

  interface RowStats {
    y: number // Y absoluto na imagem
    avgR: number
    avgG: number
    avgB: number
    variance: number // Quão uniforme é esta linha (0 = perfeitamente uniforme)
    diffFromPrev: number // Quão diferente é da linha anterior
  }

  const rows: RowStats[] = []

  for (let row = 0; row < regionHeight; row++) {
    let sumR = 0
    let sumG = 0
    let sumB = 0

    // Calcular média de cor da linha
    for (let x = 0; x < width; x++) {
      const idx = (row * width + x) * channels
      sumR += pixels[idx]
      sumG += pixels[idx + 1]
      sumB += pixels[idx + 2]
    }

    const avgR = sumR / width
    const avgG = sumG / width
    const avgB = sumB / width

    // Calcular variância (quão uniforme é a linha)
    let variance = 0
    for (let x = 0; x < width; x++) {
      const idx = (row * width + x) * channels
      variance += Math.pow(pixels[idx] - avgR, 2)
      variance += Math.pow(pixels[idx + 1] - avgG, 2)
      variance += Math.pow(pixels[idx + 2] - avgB, 2)
    }
    variance = variance / (width * 3)

    // Calcular diferença com a linha anterior
    let diffFromPrev = 0
    if (rows.length > 0) {
      const prev = rows[rows.length - 1]
      diffFromPrev =
        Math.abs(avgR - prev.avgR) +
        Math.abs(avgG - prev.avgG) +
        Math.abs(avgB - prev.avgB)
    }

    rows.push({
      y: minY + row,
      avgR,
      avgG,
      avgB,
      variance,
      diffFromPrev,
    })
  }

  // ESTRATÉGIA: Encontrar a linha com MAIOR diferença com a anterior
  // (indica transição de cor de fundo = fronteira real)
  let bestY = suggestedY
  let bestScore = 0

  for (const row of rows) {
    // Score = diferença com a linha anterior
    // Bonus: linhas mais uniformes (variância baixa) são melhores candidatas
    // (uma linha uniforme = fundo sólido = borda de seção)
    const uniformityBonus = row.variance < 500 ? 1.5 : 1.0

    // Penalizar distância do ponto sugerido (preferir ajustes menores)
    const distancePenalty =
      1 - (Math.abs(row.y - suggestedY) / searchRadius) * 0.3

    const score = row.diffFromPrev * uniformityBonus * distancePenalty

    if (score > bestScore) {
      bestScore = score
      bestY = row.y
    }
  }

  // Se a melhor fronteira encontrada não é significativamente melhor
  // que a sugestão original, manter a sugestão
  if (bestScore < 30) {
    return suggestedY
  }

  return bestY
}

interface SectionCoords {
  name: string
  y_start: number
  y_end: number
  description?: string
}

/**
 * Refina todas as coordenadas de corte de uma vez.
 */
export async function snapAllBoundaries(
  imageBuffer: Buffer,
  sections: SectionCoords[],
  searchRadius = 60
): Promise<SectionCoords[]> {
  const metadata = await sharp(imageBuffer).metadata()
  const imageHeight = metadata.height
  if (!imageHeight) return sections

  // Primeiro e último y são fixos (0 e height).
  // Só precisamos refinar os pontos intermediários (y_end de cada seção
  // exceto a última).
  const refinedSections = sections.map((s) => ({ ...s }))

  for (let i = 0; i < refinedSections.length - 1; i++) {
    const suggestedCut = refinedSections[i].y_end
    const snappedCut = await snapToBoundary(
      imageBuffer,
      suggestedCut,
      searchRadius
    )

    // Atualizar: y_end desta seção e y_start da próxima
    refinedSections[i].y_end = snappedCut
    refinedSections[i + 1].y_start = snappedCut
  }

  // Garantir extremos
  refinedSections[0].y_start = 0
  refinedSections[refinedSections.length - 1].y_end = imageHeight

  return refinedSections
}
