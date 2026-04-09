"use client"

/**
 * Converte um File PDF em um File PNG usando pdfjs-dist no browser.
 *
 * - Renderiza cada página em um canvas
 * - Se houver múltiplas páginas, empilha verticalmente
 * - Retorna um File PNG que pode seguir no fluxo normal do slicer
 *
 * pdfjs-dist precisa de um worker. Usamos o worker do pacote via
 * `new URL(..., import.meta.url)` que o Next.js resolve automaticamente.
 */
export async function convertPdfFileToPngFile(
  pdfFile: File,
  scale = 2
): Promise<File> {
  // Importação dinâmica — só carrega o pdfjs-dist quando um PDF é selecionado
  const pdfjs = await import("pdfjs-dist")

  // Configurar o worker. Tentamos usar o worker do pacote (webpack/turbopack
  // resolvem a URL). Se falhar, usamos um CDN como fallback.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString()
    } catch {
      // Fallback: CDN jsdelivr
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    }
  }

  const arrayBuffer = await pdfFile.arrayBuffer()
  const pdfDocument = await pdfjs.getDocument({ data: arrayBuffer }).promise

  const pageCanvases: HTMLCanvasElement[] = []

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement("canvas")
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Não foi possível criar contexto 2D do canvas")

    // Fundo branco (PDFs podem ter transparência)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise

    pageCanvases.push(canvas)
  }

  if (pageCanvases.length === 0) {
    throw new Error("PDF sem páginas renderizáveis")
  }

  // Um único canvas final: se múltiplas páginas, empilhar verticalmente
  let finalCanvas: HTMLCanvasElement
  if (pageCanvases.length === 1) {
    finalCanvas = pageCanvases[0]
  } else {
    const totalHeight = pageCanvases.reduce((sum, c) => sum + c.height, 0)
    const maxWidth = Math.max(...pageCanvases.map((c) => c.width))

    finalCanvas = document.createElement("canvas")
    finalCanvas.width = maxWidth
    finalCanvas.height = totalHeight
    const finalCtx = finalCanvas.getContext("2d")
    if (!finalCtx)
      throw new Error("Não foi possível criar contexto 2D do canvas final")

    finalCtx.fillStyle = "#ffffff"
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)

    let y = 0
    for (const pageCanvas of pageCanvases) {
      finalCtx.drawImage(pageCanvas, 0, y)
      y += pageCanvas.height
    }
  }

  // Extrair PNG blob do canvas final
  const blob = await new Promise<Blob | null>((resolve) => {
    finalCanvas.toBlob((b) => resolve(b), "image/png")
  })

  if (!blob) {
    throw new Error("Falha ao extrair PNG do canvas")
  }

  // Preservar o nome original, mas com extensão .png
  const baseName = pdfFile.name.replace(/\.pdf$/i, "") || "email"
  return new File([blob], `${baseName}.png`, { type: "image/png" })
}
