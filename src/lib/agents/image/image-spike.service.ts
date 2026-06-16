/**
 * Spike do agente de imagem (story AE-13): roda no SERVIDOR, onde existe
 * OPENROUTER_API_KEY e a rede chega no OpenRouter.
 *
 * Faz UMA geração por chamada (sob demanda), em um de dois modos:
 *
 *   product_ref → manda a foto do produto como image_url (multimodal img2img)
 *   text2img    → só o texto (sem imagem)
 *
 * O cliente dispara A e B em requisições SEPARADAS, uma de cada vez. Nada de
 * paralelo: cada geração é cobrada, então o usuário decide quando gastar.
 *
 * Regra dura: NUNCA chamar o modelo quando o gasto é garantidamente inútil.
 * No modo product_ref, se a foto de entrada não é baixável/não é imagem, a
 * geração é ABORTADA antes de tocar no OpenRouter (o modelo falharia igual).
 *
 * Lição do primeiro teste (152s, $0,44, "200 sem imagem"): pra o modelo
 * RETORNAR imagem (e não texto) o chat completions exige `modalities:["image"]`.
 * `response_format:"b64_json"` é do endpoint legado /images/generations e é
 * IGNORADO aqui. A imagem volta em choices[].message.images[].image_url.url.
 * Quando mesmo assim não houver imagem, capturamos o TEXTO que o modelo
 * respondeu — diagnóstico, nunca falha silenciosa.
 */

import { logger } from "@/lib/logger"

const log = logger.child("ImageSpike")

const API = "https://openrouter.ai/api/v1/chat/completions"
const GEN_API = "https://openrouter.ai/api/v1/generation"
const DEFAULT_MODEL = "openai/gpt-5.4-image-2"
// Timeout alinhado com maxDuration=300 da rota. Abortar ANTES disso é o pior
// dos mundos: se o OpenRouter já começou a gerar, abortar paga e joga fora a
// imagem. Damos folga de 30s pro parse/resposta dentro do limite serverless.
const TIMEOUT_MS = 270_000
// OpenRouter reserva créditos pelo TETO de max_tokens. Sem passar, assume o
// máximo do modelo (65536) e dá 402 com saldo baixo — mas uma imagem usa bem
// menos (o base64 não conta como token de saída). 16k é folgado.
const DEFAULT_MAX_TOKENS = 16_384

export type SpikeMode = "product_ref" | "text2img"

type SpikeContent =
  | string
  | Array<
      | { type: "image_url"; image_url: { url: string } }
      | { type: "text"; text: string }
    >
type SpikeMessage = { role: "user"; content: SpikeContent }

export interface SpikeImageResult {
  ok: boolean
  /** data URI (data:image/...;base64,...) OU URL http — usável direto em <img>. */
  image_src?: string
  /** True quando image_src é uma URL http (e não base64 inline). */
  is_remote_url?: boolean
  error?: string
  status?: number
  duration_ms: number
  /** True quando falhou SEM chamar o modelo (gasto evitado). Diferencia um
   *  erro barato (entrada inválida) de um timeout que pode ter sido cobrado. */
  skipped?: boolean
  /** Diagnóstico quando 200 mas sem imagem: o TEXTO que o modelo respondeu
   *  (sinal de que ele "analisou" em vez de gerar) e o finish_reason. */
  assistant_text?: string | null
  finish_reason?: string | null
  /** Custo em USD reportado pelo OpenRouter (usage.cost). null se não veio. */
  cost_usd?: number | null
  total_tokens?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
}

export interface InputCheck {
  ok: boolean
  status?: number
  content_type?: string | null
  error?: string
}

export interface OneGenResponse {
  mode: SpikeMode
  model: string
  /** Presente só no modo product_ref (resultado do gate de entrada). */
  input?: InputCheck
  result: SpikeImageResult
}

/** Extrai a imagem gerada do raw, cobrindo os formatos conhecidos do
 *  OpenRouter, em ordem de preferência. Regex em vez de JSON.parse porque o
 *  raw carrega ~5MB de base64. Retorna a src (data URI ou http) ou null. */
function extractImageSrc(raw: string): { src: string; remote: boolean } | null {
  // 1) Formato oficial: choices[].message.images[].image_url.url (data ou http)
  const inImages = raw.match(
    /"images"\s*:\s*\[\s*\{[^]*?"url"\s*:\s*"((?:data:image\/[^"]+)|(?:https?:\/\/[^"]+))"/,
  )
  if (inImages?.[1]) {
    return { src: inImages[1], remote: !inImages[1].startsWith("data:") }
  }
  // 2) Data URI solto em qualquer lugar do corpo
  const direct = raw.match(/data:image\/[^;"]+;base64,[A-Za-z0-9+/]+=*/)
  if (direct?.[0]) return { src: direct[0], remote: false }
  // 3) Campo b64_json cru
  const b64 = raw.match(/"b64_json"\s*:\s*"([A-Za-z0-9+/]+=*)"/)
  if (b64?.[1]) return { src: `data:image/png;base64,${b64[1]}`, remote: false }
  return null
}

/** Quando NÃO veio imagem: captura o texto que o modelo respondeu e o
 *  finish_reason, pra mostrar o que aconteceu em vez de "sem imagem" seco. */
function extractDiagnostics(raw: string): { text: string | null; finish: string | null } {
  const contentMatch = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.){0,800})"/)
  let text: string | null = null
  if (contentMatch?.[1]) {
    try {
      text = JSON.parse(`"${contentMatch[1]}"`)
    } catch {
      text = contentMatch[1]
    }
  }
  const finish = raw.match(/"finish_reason"\s*:\s*"([^"]+)"/)?.[1] ?? null
  return { text: text && text.trim() ? text : null, finish }
}

interface UsageInfo {
  cost_usd: number | null
  total_tokens: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
}

/** Extrai usage/custo do raw (a resposta vem com usage:{include:true}). */
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
        // O que faltava: sem isto o modelo responde TEXTO, não imagem.
        modalities: ["image", "text"],
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
    const img = extractImageSrc(raw)
    if (!img) {
      // 200 mas sem imagem: mostra o que o modelo de fato respondeu.
      const diag = extractDiagnostics(raw)
      return {
        ok: false,
        error: diag.text
          ? "O modelo respondeu TEXTO em vez de gerar imagem (não fez img2img)."
          : "200 mas sem imagem e sem texto reconhecível: " + raw.slice(0, 300),
        status: res.status,
        duration_ms,
        assistant_text: diag.text,
        finish_reason: diag.finish,
        ...usage,
      }
    }
    return {
      ok: true,
      image_src: img.src,
      is_remote_url: img.remote,
      status: res.status,
      duration_ms,
      ...usage,
    }
  } catch (err) {
    const duration_ms = Date.now() - t0
    const isAbort = err instanceof Error && err.name === "AbortError"
    return {
      ok: false,
      error: isAbort
        ? `timeout (${TIMEOUT_MS / 1000}s) — a geração pode ter sido cobrada mesmo abortada`
        : err instanceof Error
          ? err.message
          : String(err),
      duration_ms,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Gate de entrada: confirma que a URL é baixável E é imagem (o que o modelo
 *  precisaria fazer no modo product_ref). Baixa só 1 byte (Range). */
async function validateInputImage(url: string): Promise<InputCheck> {
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } })
    const ct = r.headers.get("content-type")
    return { ok: r.ok && !!ct && /^image\//i.test(ct), status: r.status, content_type: ct }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function runImageGeneration(params: {
  mode: SpikeMode
  imageUrl?: string
  prompt: string
  model?: string
  maxTokens?: number
}): Promise<OneGenResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não está configurada neste ambiente do servidor.")
  }
  const model = params.model?.trim() || DEFAULT_MODEL
  const maxTokens =
    params.maxTokens && params.maxTokens > 0 ? params.maxTokens : DEFAULT_MAX_TOKENS

  if (params.mode === "product_ref") {
    if (!params.imageUrl) {
      throw new Error("Modo product_ref exige imageUrl.")
    }
    // Gate: se a foto não é acessível, NÃO chama o modelo — gastaria à toa.
    const input = await validateInputImage(params.imageUrl)
    if (!input.ok) {
      log.info("spike.skip_unusable_input", { status: input.status, ct: input.content_type })
      return {
        mode: "product_ref",
        model,
        input,
        result: {
          ok: false,
          skipped: true,
          duration_ms: 0,
          error: `Entrada inacessível${input.status ? ` (HTTP ${input.status})` : ""}${
            input.content_type ? ` · ${input.content_type}` : ""
          }. Geração abortada antes de chamar o modelo pra não gastar à toa.`,
        },
      }
    }
    const result = await callImage(
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
    )
    log.info("spike.product_ref.done", {
      ok: result.ok,
      cost: result.cost_usd,
      respondedText: !!result.assistant_text,
    })
    return { mode: "product_ref", model, input, result }
  }

  // text2img — só o texto.
  const result = await callImage(
    apiKey,
    model,
    [{ role: "user", content: params.prompt }],
    maxTokens,
  )
  log.info("spike.text2img.done", { ok: result.ok, cost: result.cost_usd })
  return { mode: "text2img", model, result }
}
