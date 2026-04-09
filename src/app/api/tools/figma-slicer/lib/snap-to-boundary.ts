import sharp from "sharp"

/**
 * Snap-to-boundary baseado em detecção GLOBAL de gaps de whitespace.
 *
 * Estratégia:
 * 1. Pré-computa estatísticas de cor por linha horizontal da imagem
 *    (média RGB + variância interna + diff com linha anterior)
 * 2. Identifica "gaps": faixas de linhas horizontalmente uniformes
 *    (fundo sólido) que separam duas zonas visualmente distintas
 * 3. Para cada palpite do Claude, faz snap para o centro do gap mais
 *    próximo — mesmo que seja longe (até 20% da altura da imagem)
 *
 * Isso é muito mais preciso que o snap pontual anterior porque:
 * - Vê a imagem inteira, não só ±60px ao redor
 * - Entende que fronteiras em email são ZONAS de pixels uniformes,
 *   não apenas uma linha isolada de transição
 * - Prefere cortar no MEIO de um espaço vazio em vez de na borda
 */

interface RowStats {
  y: number
  avgR: number
  avgG: number
  avgB: number
  variance: number
  diffFromPrev: number
}

interface BoundaryCandidate {
  /** Y central do gap (melhor ponto de corte) */
  centerY: number
  /** Y onde o gap começa (final da seção anterior) */
  startY: number
  /** Y onde o gap termina (início da próxima seção) */
  endY: number
  /** Tamanho vertical do gap em pixels */
  height: number
  /** Score de qualidade do gap (maior = melhor) */
  score: number
}

interface SectionCoords {
  name: string
  y_start: number
  y_end: number
  description?: string
}

/**
 * Extrai estatísticas de cor para cada linha da imagem (downsampling
 * opcional para performance em imagens grandes).
 */
async function extractRowStats(
  imageBuffer: Buffer,
  sampleStep = 1
): Promise<RowStats[]> {
  const { data: pixels, info } = await sharp(imageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height
  const channels = info.channels

  const stats: RowStats[] = []

  for (let y = 0; y < height; y += sampleStep) {
    let sumR = 0
    let sumG = 0
    let sumB = 0

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels
      sumR += pixels[idx]
      sumG += pixels[idx + 1]
      sumB += pixels[idx + 2]
    }

    const avgR = sumR / width
    const avgG = sumG / width
    const avgB = sumB / width

    let variance = 0
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels
      variance += Math.pow(pixels[idx] - avgR, 2)
      variance += Math.pow(pixels[idx + 1] - avgG, 2)
      variance += Math.pow(pixels[idx + 2] - avgB, 2)
    }
    variance = variance / (width * 3)

    let diffFromPrev = 0
    if (stats.length > 0) {
      const prev = stats[stats.length - 1]
      diffFromPrev =
        Math.abs(avgR - prev.avgR) +
        Math.abs(avgG - prev.avgG) +
        Math.abs(avgB - prev.avgB)
    }

    stats.push({ y, avgR, avgG, avgB, variance, diffFromPrev })
  }

  return stats
}

/**
 * Detecta "gaps" na imagem — faixas verticais de pixels horizontalmente
 * uniformes (variância baixa) que representam espaços vazios entre
 * seções visuais.
 *
 * Um gap é considerado válido se:
 * - Tem pelo menos 4 linhas consecutivas uniformes (variância < threshold)
 * - As linhas dentro do gap têm cor similar entre si (diff baixo)
 * - Imediatamente ANTES ou DEPOIS do gap a cor muda significativamente
 *   (indica fronteira real, não apenas uma área lisa no meio de nada)
 */
function detectBoundaryCandidates(
  stats: RowStats[],
  minGapHeight = 4,
  varianceThreshold = 800
): BoundaryCandidate[] {
  const candidates: BoundaryCandidate[] = []

  // Marca cada linha como "uniforme" (baixa variância horizontal)
  const isUniform = stats.map((row) => row.variance < varianceThreshold)

  let gapStart = -1
  let gapStartColor: { r: number; g: number; b: number } | null = null

  for (let i = 0; i < stats.length; i++) {
    if (isUniform[i]) {
      if (gapStart === -1) {
        gapStart = i
        gapStartColor = {
          r: stats[i].avgR,
          g: stats[i].avgG,
          b: stats[i].avgB,
        }
      } else if (gapStartColor) {
        // Verifica se a cor ainda é similar à do início do gap
        const colorDiff =
          Math.abs(stats[i].avgR - gapStartColor.r) +
          Math.abs(stats[i].avgG - gapStartColor.g) +
          Math.abs(stats[i].avgB - gapStartColor.b)
        if (colorDiff > 40) {
          // Cor mudou dentro do gap — fecha o gap anterior e começa novo
          const gapLength = i - gapStart
          if (gapLength >= minGapHeight) {
            const startY = stats[gapStart].y
            const endY = stats[i - 1].y
            candidates.push({
              centerY: Math.round((startY + endY) / 2),
              startY,
              endY,
              height: endY - startY,
              // Score baseado em: tamanho do gap + transição ao redor
              score: gapLength * 10,
            })
          }
          gapStart = i
          gapStartColor = {
            r: stats[i].avgR,
            g: stats[i].avgG,
            b: stats[i].avgB,
          }
        }
      }
    } else {
      // Linha não é uniforme — fecha o gap atual se existir
      if (gapStart !== -1) {
        const gapLength = i - gapStart
        if (gapLength >= minGapHeight) {
          const startY = stats[gapStart].y
          const endY = stats[i - 1].y
          // Score: prioriza gaps maiores + com transição forte ao redor
          const transitionBefore =
            gapStart > 0 ? stats[gapStart].diffFromPrev : 0
          const transitionAfter = i < stats.length ? stats[i].diffFromPrev : 0
          const transitionScore = transitionBefore + transitionAfter
          candidates.push({
            centerY: Math.round((startY + endY) / 2),
            startY,
            endY,
            height: endY - startY,
            score: gapLength * 5 + transitionScore * 2,
          })
        }
        gapStart = -1
        gapStartColor = null
      }
    }
  }

  // Fecha um eventual gap no final
  if (gapStart !== -1) {
    const gapLength = stats.length - gapStart
    if (gapLength >= minGapHeight) {
      const startY = stats[gapStart].y
      const endY = stats[stats.length - 1].y
      candidates.push({
        centerY: Math.round((startY + endY) / 2),
        startY,
        endY,
        height: endY - startY,
        score: gapLength * 5,
      })
    }
  }

  return candidates
}

/**
 * Dado uma sugestão de corte e uma lista de candidatos (gaps), retorna
 * o melhor candidato dentro de um raio razoável, ou a sugestão original
 * se nenhum candidato for bom o suficiente.
 */
function snapToBestCandidate(
  suggestedY: number,
  candidates: BoundaryCandidate[],
  maxDistance: number,
  imageHeight: number
): number {
  if (candidates.length === 0) return suggestedY

  // Protege topo e base — não queremos que o corte entre duas seções
  // caia na borda extrema da imagem
  if (suggestedY <= 4 || suggestedY >= imageHeight - 4) {
    return suggestedY
  }

  // Encontra o candidato que minimiza: distância penalizada pelo score
  // Score efetivo = score_gap * (1 - distance/maxDistance)
  let bestCandidate: BoundaryCandidate | null = null
  let bestEffective = 0

  for (const c of candidates) {
    const distance = Math.abs(c.centerY - suggestedY)
    if (distance > maxDistance) continue

    const distanceFactor = 1 - distance / maxDistance
    const effective = c.score * distanceFactor

    if (effective > bestEffective) {
      bestEffective = effective
      bestCandidate = c
    }
  }

  // Threshold mínimo de qualidade do gap — abaixo disso, mantém sugestão
  if (!bestCandidate || bestEffective < 20) {
    return suggestedY
  }

  return bestCandidate.centerY
}

/**
 * Refina TODAS as fronteiras de corte de uma vez.
 *
 * Para imagens muito altas (> 3000px), pode usar sampleStep > 1 para
 * performance. Para imagens menores, usa 1 (precisão máxima).
 */
export async function snapAllBoundaries(
  imageBuffer: Buffer,
  sections: SectionCoords[],
  _searchRadius = 60 // kept for backwards-compat, ignored
): Promise<SectionCoords[]> {
  void _searchRadius
  const metadata = await sharp(imageBuffer).metadata()
  const imageHeight = metadata.height
  if (!imageHeight || imageHeight < 100) return sections

  // Downsample rows se a imagem é muito alta (economiza memória/tempo)
  const sampleStep = imageHeight > 4000 ? 2 : 1

  const stats = await extractRowStats(imageBuffer, sampleStep)
  const candidates = detectBoundaryCandidates(stats)

  // Raio máximo de snap: 15% da altura da imagem, mínimo de 100px
  const maxDistance = Math.max(100, Math.round(imageHeight * 0.15))

  const refined = sections.map((s) => ({ ...s }))

  // Refina apenas os cortes intermediários (não o topo nem a base da imagem)
  for (let i = 0; i < refined.length - 1; i++) {
    const suggestedCut = refined[i].y_end
    const snappedCut = snapToBestCandidate(
      suggestedCut,
      candidates,
      maxDistance,
      imageHeight
    )

    refined[i].y_end = snappedCut
    refined[i + 1].y_start = snappedCut
  }

  // Garantir extremos
  refined[0].y_start = 0
  refined[refined.length - 1].y_end = imageHeight

  // Filtrar seções degeneradas (altura <= 0)
  return refined.filter((s) => s.y_end - s.y_start > 0)
}

/**
 * Função legada mantida para compatibilidade. Hoje delega para
 * snapAllBoundaries com uma lista de apenas 2 "seções" formando
 * um único corte em suggestedY.
 */
export async function snapToBoundary(
  imageBuffer: Buffer,
  suggestedY: number,
  _searchRadius = 60
): Promise<number> {
  void _searchRadius
  const metadata = await sharp(imageBuffer).metadata()
  const imageHeight = metadata.height
  if (!imageHeight) return suggestedY

  const stats = await extractRowStats(imageBuffer, imageHeight > 4000 ? 2 : 1)
  const candidates = detectBoundaryCandidates(stats)
  const maxDistance = Math.max(100, Math.round(imageHeight * 0.15))

  return snapToBestCandidate(suggestedY, candidates, maxDistance, imageHeight)
}
