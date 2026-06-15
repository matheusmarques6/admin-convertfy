/**
 * Spike do agente de imagem (story AE-13): roda no SERVIDOR, onde existe
 * OPENROUTER_API_KEY e a rede chega no OpenRouter. Gera a MESMA imagem em
 * dois modos pra provar se o modelo recebe e usa a imagem do produto:
 *
 *   product_ref → manda a imagem como image_url (multimodal img2img)
 *   text2img    → só o texto (sem imagem)
 *
 * Retorna data URIs (base64) — sem upload pro storage, é só comparação.
 */

import { logger } from "@/lib/logger"

const log = logger.child("ImageSpike")

const API = "https://openrouter.ai/api/v1/chat/completions"
const DEFAULT_MODEL = "openai/gpt-5.4-image-2"
const TIMEOUT_MS = 90_000

type SpikeContent =
  | string
  | Array<
      | { type: "image_url"; image_url: { url: string } }
      | { type: "text"; text: string }
    >
type SpikeMessage = { role: "user"; content: SpikeContent }

export interface SpikeImageResult {
  ok: boolean
  data_uri?: string
  error?: string
  status?: number
  duration_ms: number
}

export interface ImageSpikeResponse {
  model: string
  input: { ok: boolean; status?: number; content_type?: string | null; error?: string }
  product_ref: SpikeImageResult
  text2img: SpikeImageResult
}

function extractDataUri(raw: string): string | null {
  const direct = raw.match(/data:image\/[^;"]+;base64,[A-Za-z0-9+/]+=*/)
  if (direct?.[0]) return direct[0]
  const b64 = raw.match(/"b64_json"\s*:\s*"([A-Za-z0-9+/]+=*)"/)
  if (b64?.[1]) return `data:image/png;base64,${b64[1]}`
  return null
}

async function callImage(
  apiKey: string,
  model: string,
  messages: SpikeMessage[],
): Promise<SpikeImageResult> {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, response_format: "b64_json" }),
      signal: ctrl.signal,
    })
    const raw = await res.text()
    const duration_ms = Date.now() - t0
    if (!res.ok) {
      return { ok: false, error: raw.slice(0, 500), status: res.status, duration_ms }
    }
    const dataUri = extractDataUri(raw)
    if (!dataUri) {
      return {
        ok: false,
        error: "200 mas sem imagem na resposta: " + raw.slice(0, 300),
        status: res.status,
        duration_ms,
      }
    }
    return { ok: true, data_uri: dataUri, status: res.status, duration_ms }
  } catch (err) {
    const duration_ms = Date.now() - t0
    const isAbort = err instanceof Error && err.name === "AbortError"
    return {
      ok: false,
      error: isAbort ? `timeout (${TIMEOUT_MS / 1000}s)` : err instanceof Error ? err.message : String(err),
      duration_ms,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function runImageSpike(params: {
  imageUrl: string
  prompt: string
  model?: string
}): Promise<ImageSpikeResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não está configurada neste ambiente do servidor.")
  }
  const model = params.model?.trim() || DEFAULT_MODEL

  // 1. Confirma que a URL de entrada é baixável E é imagem (o que o modelo
  //    precisaria fazer no modo product_ref).
  let input: ImageSpikeResponse["input"]
  try {
    const r = await fetch(params.imageUrl, { method: "GET", headers: { Range: "bytes=0-0" } })
    const ct = r.headers.get("content-type")
    input = { ok: r.ok && !!ct && /^image\//i.test(ct), status: r.status, content_type: ct }
  } catch (err) {
    input = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // 2. Gera A (multimodal) e B (text2img) em paralelo.
  const [productRef, text2img] = await Promise.all([
    callImage(apiKey, model, [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: params.imageUrl } },
          { type: "text", text: params.prompt },
        ],
      },
    ]),
    callImage(apiKey, model, [{ role: "user", content: params.prompt }]),
  ])

  log.info("spike.done", {
    model,
    inputOk: input.ok,
    productRefOk: productRef.ok,
    text2imgOk: text2img.ok,
  })

  return { model, input, product_ref: productRef, text2img }
}
