"use client"

/**
 * Exportação client-side dos frames: o DOM do frame (renderizado a 1080 de
 * largura, só estilos inline) é serializado em XHTML dentro de um SVG
 * <foreignObject>, com as FONTES e as IMAGENS embutidas em base64, e
 * desenhado num <canvas> 1080×1350 (ou 1080×1920). Sem servidor, sem lib:
 * o mesmo renderer que desenha o canvas desenha o arquivo.
 */

import JSZip from "jszip"
import { urlParaDataUrl } from "../imagens"

export type FormatoExport = "png" | "jpg"

const FONTES: Array<{ family: string; weight: string; url: string; range?: string }> = [
  { family: "Barlow Condensed", weight: "800", url: "/fonts/barlow-condensed-800-latin.woff2" },
  { family: "Barlow Condensed", weight: "800", url: "/fonts/barlow-condensed-800-latin-ext.woff2", range: "U+0100-02BA, U+1E00-1EFF" },
  { family: "Inter Slides", weight: "100 900", url: "/fonts/inter-variable.woff2" },
]

let cssFontesPromise: Promise<string> | null = null

/** @font-face com os arquivos em base64 (uma vez por sessão). */
export function cssFontesEmbutidas(): Promise<string> {
  if (cssFontesPromise) return cssFontesPromise
  cssFontesPromise = (async () => {
    const regras = await Promise.all(
      FONTES.map(async (f) => {
        try {
          const data = await urlParaDataUrl(f.url)
          return `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};src:url("${data}") format("woff2");${f.range ? `unicode-range:${f.range};` : ""}}`
        } catch {
          return ""
        }
      }),
    )
    return regras.join("\n")
  })()
  cssFontesPromise.catch(() => {
    cssFontesPromise = null
  })
  return cssFontesPromise
}

async function inlineImagens(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src")
      if (!src) return
      try {
        img.setAttribute("src", await urlParaDataUrl(src))
      } catch {
        // imagem inacessível (CORS): sai da exportação em vez de derrubar o frame
        img.remove()
      }
      img.removeAttribute("crossorigin")
    }),
  )
}

function escaparXml(s: string): string {
  return s.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
}

/**
 * Renderiza o elemento do frame (já a 1080 de largura) como PNG/JPG.
 * `el` deve estar no DOM (mesmo que fora da tela).
 */
export async function renderFrameParaBlob(el: HTMLElement, largura: number, altura: number, fmt: FormatoExport): Promise<Blob> {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"))
  clone.style.outline = "none"
  await inlineImagens(clone)

  const style = document.createElement("style")
  style.textContent = await cssFontesEmbutidas()
  clone.insertBefore(style, clone.firstChild)
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml")

  const xhtml = escaparXml(new XMLSerializer().serializeToString(clone))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}"><foreignObject x="0" y="0" width="${largura}" height="${altura}">${xhtml}</foreignObject></svg>`
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const img = new Image()
  img.decoding = "sync"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Falha ao rasterizar o frame"))
    img.src = url
  })
  try {
    await img.decode()
  } catch {
    /* alguns navegadores lançam em SVG; o onload já garantiu o carregamento */
  }

  const canvas = document.createElement("canvas")
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas indisponível")
  if (fmt === "jpg") {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, largura, altura)
  }
  // Duas passadas: a primeira aquece as fontes embutidas em alguns motores.
  ctx.drawImage(img, 0, 0, largura, altura)
  await new Promise((r) => setTimeout(r, 30))
  ctx.clearRect(0, 0, largura, altura)
  if (fmt === "jpg") {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, largura, altura)
  }
  ctx.drawImage(img, 0, 0, largura, altura)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar o arquivo"))),
      fmt === "jpg" ? "image/jpeg" : "image/png",
      fmt === "jpg" ? 0.92 : undefined,
    )
  })
}

export function baixarBlob(blob: Blob, nome: string): void {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "carrossel"
}

export async function zipar(arquivos: Array<{ nome: string; blob: Blob }>, legenda?: string): Promise<Blob> {
  const zip = new JSZip()
  for (const a of arquivos) zip.file(a.nome, a.blob)
  if (legenda) zip.file("legenda.txt", legenda)
  return zip.generateAsync({ type: "blob" })
}
