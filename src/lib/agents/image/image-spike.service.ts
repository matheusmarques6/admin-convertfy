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
const GEN_API = "https://openrouter.ai/api/v1/generation"
const DEFAULT_MODEL = "openai/gpt-5.4-image-2"
const TIMEOUT_MS = 90_000
// OpenRouter reserva créditos pelo TETO de max_tokens. Sem passar, assume o
// máximo do modelo (65536) e dá 402 com saldo baixo — mas uma imagem usa
// bem menos. 16k é folgado pra geração de imagem.
const DEFAULT_MAX_TOKENS = 16_384

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
  /** Custo em USD reportado pelo OpenRouter (usage.cost). null se não veio. */
  cost_usd?: number | null
  total_tokens?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
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

interface UsageInfo {
  cost_usd: number | null
  total_tokens: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
}

/** Extrai usage/custo do raw (a resposta vem com usage:{include:true}).
 *  Regex em vez de JSON.parse porque o raw carrega ~5MB de base64. */
function extractUsage(raw: string): UsageInfo {
  const num = (re: RegExp): number | null => {
    const m = raw.match(re)
    return m ? Number(m[1]) : null
  }
  return {
    cost_usd: num(/"cost"\s*:\s*([0-9.eE+-]+)/),
    total_tokens: num(/"total_tokens"\s*:\s*(\d+)/),
    prompt_tokens: num(/"prompt_tokens"\s*:\s*(\d+)/),
    completion_tokens: num(/"completion_tokens"\s*:\s*(\d+)/),
  }
}

/** Fallback de custo: quando o usage.cost não vem na resposta, consulta o
 *  endpoint /generation pelo id da geração. O custo pode não estar pronto na
 *  hora — tenta algumas vezes com um pequeno intervalo. */
async function fetchGenerationCost(apiKey: string, genId: string): Promise<UsageInfo | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700))
    try {
      const res = await fetch(`${GEN_API}?id=${encodeURIComponent(genId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) continue
      const json = (await res.json()) as { data?: Record<string, unknown> }
      const d = json.data
      if (!d) continue
      const cost = typeof d.total_cost === "number" ? d.total_cost : null
      if (cost == null) continue
      const promptT = typeof d.tokens_prompt === "number" ? d.tokens_prompt : null
      const completionT = typeof d.tokens_completion === "number" ? d.tokens_completion : null
      return {
        cost_usd: cost,
        prompt_tokens: promptT,
        completion_tokens: completionT,
        total_tokens:
          promptT != null || completionT != null ? (promptT ?? 0) + (completionT ?? 0) : null,
      }
    } catch {
      // tenta de novo
    }
  }
  return null
}

async function callImage(
  apiKey: string,
  model: string,
  messages: SpikeMessage[],
  maxTokens: number,
): Promise<SpikeImageResult> {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        response_format: "b64_json",
        max_tokens: maxTokens,
        usage: { include: true },
      }),
      signal: ctrl.signal,
    })
    const raw = await res.text()
    const duration_ms = Date.now() - t0
    if (!res.ok) {
      return { ok: false, error: raw.slice(0, 500), status: res.status, duration_ms }
    }
    let usage = extractUsage(raw)
    if (usage.cost_usd == null) {
      const genId = raw.match(/"id"\s*:\s*"([^"]+)"/)?.[1]
      if (genId) {
        const fromGen = await fetchGenerationCost(apiKey, genId)
        if (fromGen) usage = { ...usage, ...fromGen }
      }
    }
    const dataUri = extractDataUri(raw)
    if (!dataUri) {
      return {
        ok: false,
        error: "200 mas sem imagem na resposta: " + raw.slice(0, 300),
        status: res.status,
        duration_ms,
        ...usage,
      }
    }
    return { ok: true, data_uri: dataUri, status: res.status, duration_ms, ...usage }
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
  maxTokens?: number
}): Promise<ImageSpikeResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não está configurada neste ambiente do servidor.")
  }
  const model = params.model?.trim() || DEFAULT_MODEL
  const maxTokens =
    params.maxTokens && params.maxTokens > 0 ? params.maxTokens : DEFAULT_MAX_TOKENS

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
    callImage(
      apiKey,
      model,
      [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: params.imageUrl } },
            { type: "text", text: params.prompt },
          ],
        },
      ],
      maxTokens,
    ),
    callImage(apiKey, model, [{ role: "user", content: params.prompt }], maxTokens),
  ])

  log.info("spike.done", {
    model,
    inputOk: input.ok,
    productRefOk: productRef.ok,
    text2imgOk: text2img.ok,
  })

  return { model, input, product_ref: productRef, text2img }
}
