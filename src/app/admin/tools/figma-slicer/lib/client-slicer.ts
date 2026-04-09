"use client"

/**
 * Corte de imagens 100% no cliente usando Canvas + JSZip.
 *
 * Motivação: enviar as imagens base64 pra API via fetch tem problemas:
 * 1. JSON payload de um funil inteiro (~8 emails × 3MB) passa de 20MB,
 *    estourando o limite default do Next.js (1MB) e do Vercel (4.5MB).
 * 2. Round-trip de base64 é lento e desperdiça banda.
 *
 * Fazer no cliente é mais simples, mais rápido e não tem limites de
 * body size. Canvas é nativo do browser, jszip também roda nativamente.
 */

import JSZip from "jszip"

export interface ClientSliceInput {
  emailName: string
  imageBase64: string // sem prefixo data:
  width: number
  height: number
  sections: Array<{
    name: string
    y_start: number
    y_end: number
  }>
}

export interface ClientSliceBatchInput {
  funnelName: string
  emails: ClientSliceInput[]
}

/**
 * Sanitiza nome para uso em filesystem/zip. Preserva case, `_` e `-`.
 */
export function sanitizeFsName(input: string, fallback = "untitled"): string {
  const cleaned = input
    .replace(/[^A-Za-z0-9_\-\s]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned || fallback
}

/**
 * Carrega uma imagem a partir de uma URL (data URL ou blob URL).
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Falha ao carregar imagem"))
    img.src = src
  })
}

/**
 * Corta uma faixa horizontal da imagem usando canvas e retorna o blob PNG.
 */
async function cropToPngBlob(
  img: HTMLImageElement,
  yStart: number,
  yEnd: number,
  width: number
): Promise<Blob> {
  const height = yEnd - yStart
  if (height <= 0 || width <= 0) {
    throw new Error(`Dimensões inválidas do corte: ${width}×${height}`)
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context indisponível")

  // drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
  // — recorta a faixa [yStart..yEnd] da imagem e desenha em 0,0
  ctx.drawImage(
    img,
    0,
    yStart,
    img.naturalWidth,
    height,
    0,
    0,
    width,
    height
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Falha ao gerar PNG do canvas"))
    }, "image/png")
  })
}

/**
 * Gera um ZIP completo de um funil, cortando todas as seções de todos
 * os emails no cliente. Retorna o Blob do ZIP pronto pra download.
 */
export async function buildFunnelZipClientSide(
  input: ClientSliceBatchInput
): Promise<{ blob: Blob; totalSlices: number }> {
  const zip = new JSZip()
  const safeFunnel = sanitizeFsName(input.funnelName, "funnel")

  let totalSlices = 0

  for (const email of input.emails) {
    // Valida input do email
    if (!email.imageBase64 || !email.sections.length) continue

    const safeEmail = sanitizeFsName(email.emailName, "email")
    const folder = `${safeFunnel}/${safeEmail}`
    const imgSrc = `data:image/png;base64,${email.imageBase64}`

    let img: HTMLImageElement
    try {
      img = await loadImage(imgSrc)
    } catch {
      // Pula esse email, continua os outros
      continue
    }

    for (const section of email.sections) {
      const yStart = Math.max(
        0,
        Math.min(Math.round(section.y_start), img.naturalHeight)
      )
      const yEnd = Math.max(
        0,
        Math.min(Math.round(section.y_end), img.naturalHeight)
      )
      if (yEnd <= yStart) continue

      try {
        const blob = await cropToPngBlob(img, yStart, yEnd, img.naturalWidth)
        const arrayBuffer = await blob.arrayBuffer()
        const safeSliceName = sanitizeFsName(section.name, "parte")
        zip.file(`${folder}/${safeSliceName}.png`, arrayBuffer)
        totalSlices++
      } catch {
        // Pula essa seção, continua as outras
      }
    }
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  return { blob: zipBlob, totalSlices }
}

/**
 * Helper: faz o download de um blob como arquivo nomeado.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Libera a memória depois do tick
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Normaliza um File de imagem para 600px de largura PNG usando canvas.
 * Retorna base64 (sem prefixo data:), largura e altura.
 *
 * Por que: o analyze-pixels + slice usam sempre 600px como escala.
 * Normalizando no cliente ANTES de qualquer coisa, garantimos que as
 * coordenadas Y retornadas pelo servidor batem com o base64 que a
 * gente guarda e depois usa no corte client-side.
 */
export async function normalizeFileTo600pxBase64(
  file: File
): Promise<{ base64: string; width: number; height: number }> {
  // 1. Lê o File como dataURL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () =>
      reject(reader.error || new Error("Falha ao ler o arquivo"))
    reader.readAsDataURL(file)
  })

  // 2. Carrega num <img> pra obter dimensões naturais
  const img = await loadImage(dataUrl)

  // 3. Canvas 600 × H (proporcional)
  const targetWidth = 600
  const targetHeight = Math.round(
    (img.naturalHeight / img.naturalWidth) * targetWidth
  )
  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context indisponível")

  // Desenha redimensionando
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  // 4. Extrai base64 PNG sem prefixo
  const outDataUrl = canvas.toDataURL("image/png")
  const commaIdx = outDataUrl.indexOf(",")
  if (commaIdx === -1) throw new Error("Falha ao gerar base64 do canvas")
  const base64 = outDataUrl.slice(commaIdx + 1)

  return { base64, width: targetWidth, height: targetHeight }
}
