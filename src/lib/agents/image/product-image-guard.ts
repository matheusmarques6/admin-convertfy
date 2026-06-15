/**
 * Guarda da imagem de produto pro modo `product_ref` (multimodal).
 *
 * Antes de enviar a URL da imagem do produto pro OpenRouter como referência
 * visual (img2img), confirma que ela é REALMENTE baixável E é uma imagem.
 * Sem isso, URLs 403/404/HTML — ex.: asset de e-mail removido, CDN restrito,
 * link de marketing reaproveitado — fariam o modelo gerar lixo ou falhar, e o
 * pipeline cairia silenciosamente em imagem genérica. Quando reprova, o caller
 * deve rebaixar pra `text2img` (com a descrição textual do produto).
 *
 * O check roda no servidor (mesma internet aberta do Vercel). NÃO é prova
 * absoluta de que o OpenRouter acessa o host — redes podem diferir — mas pega
 * os casos óbvios (403/404/não-imagem) antes de desperdiçar a chamada cara.
 */

import { logger } from "@/lib/logger"

const log = logger.child("ProductImageGuard")

const DEFAULT_TIMEOUT_MS = 5_000

export interface ProductImageCheck {
  usable: boolean
  reason?: string
  status?: number
  contentType?: string | null
}

export async function isUsableProductImage(
  url: string | null | undefined,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProductImageCheck> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { usable: false, reason: "missing_or_invalid_url" }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // HEAD é barato. Alguns CDNs não suportam HEAD (405/501) → tenta um GET
    // de 1 byte só pra ler os headers sem baixar a imagem inteira.
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: ctrl.signal,
      })
    }

    const contentType = res.headers.get("content-type")
    if (!res.ok) {
      return { usable: false, reason: `http_${res.status}`, status: res.status, contentType }
    }
    if (!contentType || !/^image\//i.test(contentType)) {
      return { usable: false, reason: "not_image", status: res.status, contentType }
    }
    return { usable: true, status: res.status, contentType }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError" ? "timeout" : "fetch_error"
    log.warn("product_image.check_failed", { url, reason })
    return { usable: false, reason }
  } finally {
    clearTimeout(timer)
  }
}
