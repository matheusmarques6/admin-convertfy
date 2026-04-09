import sharp from "sharp"

interface CutLineAnnotation {
  y: number
  label: string
}

/**
 * Desenha linhas horizontais vermelhas sobre a imagem nas coordenadas
 * de corte propostas. Cada linha recebe um label com o número do corte
 * e a coordenada Y absoluta.
 *
 * Usado para a dupla-verificação visual: mandamos a imagem anotada
 * para um segundo modelo revisor (Opus) que avalia se cada linha está
 * no lugar correto e corrige as que estão erradas.
 */
export async function drawCutLinesOverlay(
  imageBuffer: Buffer,
  cutLines: CutLineAnnotation[]
): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height) return imageBuffer

  // Gera SVG com linhas horizontais vermelhas + badges com número do corte
  const lineHeight = Math.max(4, Math.round(height / 800))
  const badgeHeight = Math.max(36, Math.round(height / 80))
  const badgeWidth = Math.max(180, Math.round(width / 5))
  const fontSize = Math.max(18, Math.round(height / 150))

  const svgElements = cutLines
    .map((cut) => {
      const y = Math.max(0, Math.min(cut.y, height))
      const badgeY = Math.max(0, y - badgeHeight - 2)
      return `
        <line x1="0" y1="${y}" x2="${width}" y2="${y}"
              stroke="red" stroke-width="${lineHeight}" />
        <line x1="0" y1="${y}" x2="${width}" y2="${y}"
              stroke="white" stroke-width="${lineHeight / 2}" stroke-dasharray="20,10" />
        <rect x="10" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}"
              fill="red" stroke="white" stroke-width="2" rx="4" />
        <text x="20" y="${badgeY + badgeHeight - 10}"
              font-family="Arial, sans-serif" font-size="${fontSize}"
              font-weight="bold" fill="white">${cut.label}</text>
      `
    })
    .join("")

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgElements}
    </svg>
  `

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}
