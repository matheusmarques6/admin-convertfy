import sharp from "sharp"

/**
 * Converte um buffer de PDF em UM único buffer PNG. PDFs de uma página
 * são usados diretamente; PDFs multi-página são concatenados verticalmente
 * (um caso raro para emails, mas possível).
 */
export async function pdfBufferToPngBuffer(
  pdfBuffer: Buffer,
  scale = 2
): Promise<Buffer> {
  // Import dinâmico — pdf-to-img é pesado e só deve carregar quando usado
  const { pdf } = await import("pdf-to-img")

  // pdf-to-img aceita Buffer no runtime Node
  const document = await pdf(pdfBuffer, { scale })
  const pages: Buffer[] = []

  for await (const page of document) {
    pages.push(Buffer.from(page))
  }

  if (pages.length === 0) {
    throw new Error("PDF sem páginas")
  }

  if (pages.length === 1) {
    return pages[0]
  }

  // Juntar páginas verticalmente com sharp
  const metas = await Promise.all(pages.map((p) => sharp(p).metadata()))
  const totalHeight = metas.reduce((sum, m) => sum + (m.height ?? 0), 0)
  const maxWidth = Math.max(...metas.map((m) => m.width ?? 0))

  let yOffset = 0
  const compositeInputs = pages.map((page, i) => {
    const input = { input: page, top: yOffset, left: 0 }
    yOffset += metas[i].height ?? 0
    return input
  })

  const combined = await sharp({
    create: {
      width: maxWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer()

  return combined
}
