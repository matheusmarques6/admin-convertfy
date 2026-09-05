"use client"

/**
 * Imagens no navegador: arquivo → data URL comprimida (o documento vive em
 * localStorage, que tem ~5 MB; uma foto de celular crua estouraria a cota
 * em dois uploads). Também busca URLs remotas como data URL para a
 * exportação (o SVG serializado não pode referenciar recurso externo).
 */

export async function arquivoParaDataUrl(file: File, maxLado = 1350, qualidade = 0.86): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error("Não foi possível ler o arquivo"))
      r.readAsDataURL(file)
    })
  }
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * escala))
  const h = Math.max(1, Math.round(bitmap.height * escala))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas indisponível")
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const temAlpha = /png|webp|gif/i.test(file.type)
  return canvas.toDataURL(temAlpha && file.size < 400_000 ? "image/png" : "image/jpeg", qualidade)
}

export async function arquivosParaDataUrls(files: FileList | File[], maxLado?: number): Promise<string[]> {
  const lista = Array.from(files).filter((f) => f.type.startsWith("image/"))
  return Promise.all(lista.map((f) => arquivoParaDataUrl(f, maxLado)))
}

const cacheRemoto = new Map<string, Promise<string>>()

/** URL remota → data URL (com cache). Devolve a própria URL quando já é data:. */
export function urlParaDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url)
  const hit = cacheRemoto.get(url)
  if (hit) return hit
  const p = (async () => {
    const res = await fetch(url, { mode: "cors" })
    if (!res.ok) throw new Error(`Imagem indisponível (${res.status})`)
    const blob = await res.blob()
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error("Falha ao ler imagem"))
      r.readAsDataURL(blob)
    })
  })()
  cacheRemoto.set(url, p)
  p.catch(() => cacheRemoto.delete(url))
  return p
}
