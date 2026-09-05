"use client"

/**
 * Imagens no navegador — só para o que NÃO é persistido.
 *
 * Imagem que entra no carrossel vai para o Storage pelo upload
 * (`data.uploadImagem`): o documento guarda a URL, nunca o base64. Aqui
 * ficam (a) as REFERÊNCIAS visuais que viajam para o modelo como data URL
 * (anexo do chat, inspiração do fluxo Novo) e (b) o download de uma URL
 * como data URL para a exportação, porque o SVG serializado não pode
 * referenciar recurso externo.
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

/**
 * URL remota → data URL (com cache). Devolve a própria URL quando já é data:.
 * Tem TIMEOUT: uma imagem externa que não responde não pode travar a
 * exportação inteira (o frame sai sem ela).
 */
export function urlParaDataUrl(url: string, timeoutMs = 12_000): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url)
  const hit = cacheRemoto.get(url)
  if (hit) return hit
  const p = (async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(url, { mode: "cors", signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }
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
