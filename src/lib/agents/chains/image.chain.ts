/**
 * Image Chain — gera imagens para blocos de email via OpenRouter.
 *
 * OpenRouter expõe modelos de imagem via chat completions, não via
 * /images/generations. Usamos fetch direto no endpoint de chat.
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  getAspectDimensions,
  type AspectKey,
} from "../image/aspect-ratio"

const log = logger.child("ImageChain")

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `Create a hero banner for an email marketing campaign.

Brand: {brand_name}
Niche: {nicho}
Brand persona: {persona}
Brand differentiator: {diferencial}
Tone: {tom_voz}, positioning: {posicionamento}
Brand colors: {primary_colors}
Secondary colors: {secondary_colors}

Top products of the store: {top_products}

Email context: {block_purpose}

Requirements:
- Clean, modern e-commerce aesthetic that reflects the brand persona
- Show or evoke the niche/products (visual cues, lifestyle, product hints)
- No text in the image (text is overlaid in HTML)
- Landscape aspect ratio (600x300)
- Product/lifestyle photography style aligned with brand tone`

export function renderImagePrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "")
}

const OPENROUTER_IMAGE_MODEL = "openai/gpt-5.4-image-2"

/**
 * Heuristica pra detectar erro "modelo nao suporta multimodal" no body
 * de uma resposta 4xx do OpenRouter. Conservadora: so dispara retry
 * em casos claros pra evitar loop com erros nao relacionados.
 */
function isMultimodalUnsupportedError(body: string): boolean {
  const lower = body.toLowerCase()
  return (
    lower.includes("image input not supported") ||
    lower.includes("image_url not supported") ||
    lower.includes("does not support image") ||
    lower.includes("multimodal not supported")
  )
}

/**
 * Heuristica pra detectar erro "modelo nao aceita role=system" no body
 * de uma resposta 4xx do OpenRouter. Quando dispara, a chain retry uma
 * vez concatenando system_prompt + "\n\n" + user prompt no mesmo user
 * message — sem perda de instrução, só perda da separação de roles.
 */
function isSystemRoleUnsupportedError(body: string): boolean {
  const lower = body.toLowerCase()
  return (
    lower.includes("system role not supported") ||
    lower.includes("system message not supported") ||
    lower.includes("unsupported role") ||
    lower.includes("role 'system'") ||
    lower.includes('role "system"')
  )
}

type UserMessage =
  | { role: "user"; content: string }
  | {
      role: "user"
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >
    }
type SystemMessage = { role: "system"; content: string }
type ChatMessage = UserMessage | SystemMessage

function buildUserMessage(
  prompt: string,
  referenceImageUrl?: string,
): UserMessage {
  if (referenceImageUrl) {
    return {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: referenceImageUrl } },
        { type: "text", text: prompt },
      ],
    }
  }
  return { role: "user", content: prompt }
}

function buildMessages(
  prompt: string,
  referenceImageUrl?: string,
  systemPrompt?: string,
): ChatMessage[] {
  const userMsg = buildUserMessage(prompt, referenceImageUrl)
  if (systemPrompt && systemPrompt.trim()) {
    return [{ role: "system", content: systemPrompt }, userMsg]
  }
  return [userMsg]
}

async function callOpenRouterImage(
  apiKey: string,
  prompt: string,
  referenceImageUrl?: string,
  systemPrompt?: string,
): Promise<Response> {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_IMAGE_MODEL,
      messages: buildMessages(prompt, referenceImageUrl, systemPrompt),
      response_format: "b64_json",
    }),
  })
}

export async function generateEmailImage(
  prompt: string,
  storeId: string,
  options?: {
    aspect?: AspectKey
    /**
     * Informativo apenas — propagado em logs. A instrucao textual no
     * prompt e responsabilidade do caller (phase2-runner).
     */
    overlayReserveBottom?: boolean
    /**
     * AE-13: modo de geracao. Quando `product_ref` + `referenceImageUrl`,
     * envia content array multimodal ao OpenRouter. Em qualquer outro
     * caso usa body legacy (string content). Default: `text2img`.
     */
    mode?: "product_ref" | "text2img"
    /**
     * AE-13: URL da imagem real do produto pra usar como referencia
     * visual quando mode='product_ref'. Sem isso, mode degrada
     * automaticamente pra text2img (caller ja deveria ter resolvido via
     * `resolveImageMode`, mas a chain tambem se defende).
     */
    referenceImageUrl?: string
    /**
     * Master Prompt v2: prompt de sistema do agente de imagem (Part A do
     * `email_agent_configs.system_prompt`). Enviado como `role:"system"` na
     * mensagem inicial. Se o modelo retornar 4xx com sinal de role não
     * suportado, retry UMA vez concatenando `system + "\n\n" + user` no mesmo
     * user message (sem perda de instrução).
     */
    systemPrompt?: string
  },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada")

  const mode = options?.mode ?? "text2img"
  const useMultimodal = mode === "product_ref" && !!options?.referenceImageUrl
  const systemPrompt = options?.systemPrompt?.trim() || undefined

  log.info("image.generate.start", {
    storeId,
    promptLength: prompt.length,
    aspect: options?.aspect,
    overlayReserveBottom: options?.overlayReserveBottom,
    mode,
    useMultimodal,
    hasSystemPrompt: !!systemPrompt,
    systemPromptLength: systemPrompt?.length ?? 0,
  })
  const t0 = Date.now()

  if (useMultimodal) {
    log.info("image.multimodal.attempted", {
      storeId,
      refUrl: options?.referenceImageUrl,
      model: OPENROUTER_IMAGE_MODEL,
    })
  }

  let res = await callOpenRouterImage(
    apiKey,
    prompt,
    useMultimodal ? options?.referenceImageUrl : undefined,
    systemPrompt,
  )

  // Master Prompt v2: se o modelo rejeitou role=system, retry UMA vez
  // concatenando system + user no mesmo user message. Decidido antes do
  // fallback de multimodal pra evitar mascarar drift de role como drift
  // de multimodal (logs ficam mais limpos pra ops).
  if (
    !res.ok &&
    systemPrompt &&
    res.status >= 400 &&
    res.status < 500
  ) {
    const errText = await res.text().catch(() => "")
    if (isSystemRoleUnsupportedError(errText)) {
      log.warn("image.system_prompt.fallback_concatenated", {
        storeId,
        status: res.status,
        errorSnippet: errText.slice(0, 200),
      })
      const concatenated = `${systemPrompt}\n\n${prompt}`
      res = await callOpenRouterImage(
        apiKey,
        concatenated,
        useMultimodal ? options?.referenceImageUrl : undefined,
        undefined,
      )
    } else {
      // Reembrulha pra cair na 4xx genérica abaixo sem perder o body
      // (Response já foi consumida via .text() — recria sintética).
      res = new Response(errText, {
        status: res.status,
        statusText: res.statusText,
      })
    }
  }

  // AE-13: se multimodal foi tentado e o modelo nao aceita, retry
  // UMA vez em modo text2img puro. Apenas pra 4xx; 5xx propaga.
  if (!res.ok && useMultimodal && res.status >= 400 && res.status < 500) {
    const errText = await res.text().catch(() => "")
    if (isMultimodalUnsupportedError(errText)) {
      log.warn("image.multimodal.fallback_text2img", {
        storeId,
        status: res.status,
        errorSnippet: errText.slice(0, 200),
      })
      res = await callOpenRouterImage(apiKey, prompt, undefined, systemPrompt)
    } else {
      // AE-13 review: se o body menciona "image" mas nao casa keywords
      // conhecidas, OpenRouter pode ter mudado a mensagem — logar pra
      // ops detectar drift e atualizar isMultimodalUnsupportedError.
      if (/image/i.test(errText)) {
        log.warn("image.multimodal.4xx_with_image_keyword_no_match", {
          storeId,
          status: res.status,
          errorSnippet: errText.slice(0, 300),
        })
      }
      throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 300)}`)
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
  }

  // A resposta contém base64 gigante (~5MB+) que pode truncar com res.json().
  // Ler como text e extrair o base64 via regex é mais seguro.
  const rawText = await res.text()

  let imageBuffer: Buffer | null = null

  // Extrair data:image/...;base64,XXXX da resposta bruta
  const b64Match = rawText.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/]+=*)/)
  if (b64Match?.[1]) {
    imageBuffer = Buffer.from(b64Match[1], "base64")
  }

  // Fallback: tentar b64_json direto
  if (!imageBuffer) {
    const b64JsonMatch = rawText.match(/"b64_json"\s*:\s*"([A-Za-z0-9+/]+=*)"/)
    if (b64JsonMatch?.[1]) {
      imageBuffer = Buffer.from(b64JsonMatch[1], "base64")
    }
  }

  if (!imageBuffer) {
    log.error("image.parse_failed", { storeId, responseLength: rawText.length, first500: rawText.slice(0, 500) })
    throw new Error("Não foi possível extrair imagem da resposta do OpenRouter")
  }

  // AE-12: resize via sharp pra forcar aspect ratio. Best-effort: se o
  // resize falhar, segue com o buffer original (pipeline nao quebra).
  let finalBuffer: Buffer = imageBuffer
  if (options?.aspect) {
    const dims = getAspectDimensions(options.aspect)
    try {
      finalBuffer = await sharp(imageBuffer)
        .resize(dims.width, dims.height, {
          fit: "cover",
          position: "center",
        })
        .png()
        .toBuffer()
      log.info("image.resize", {
        storeId,
        aspect: options.aspect,
        to: dims,
        bytesOriginal: imageBuffer.length,
        bytesResized: finalBuffer.length,
      })
    } catch (err) {
      log.warn("image.resize_failed", {
        storeId,
        aspect: options.aspect,
        error: err instanceof Error ? err.message : String(err),
      })
      // fallback: mantem buffer original
      finalBuffer = imageBuffer
    }
  }

  // Upload pro Supabase Storage
  const admin = createAdminClient()
  const uuid = crypto.randomUUID()
  const path = `stores/${storeId}/email-assets/${uuid}.png`

  const { error: uploadErr } = await admin.storage
    .from("onboarding-visual-assets")
    .upload(path, finalBuffer, {
      contentType: "image/png",
      upsert: false,
    })

  if (uploadErr) {
    log.error("image.upload.failed", { storeId, path, error: uploadErr.message })
    throw new Error(`Falha ao fazer upload da imagem: ${uploadErr.message}`)
  }

  const { data: signedData, error: signErr } = await admin.storage
    .from("onboarding-visual-assets")
    .createSignedUrl(path, 365 * 24 * 60 * 60)

  if (signErr || !signedData?.signedUrl) {
    const { data: publicData } = admin.storage
      .from("onboarding-visual-assets")
      .getPublicUrl(path)
    log.warn("image.signed_url.fallback_public", { storeId, path })
    return publicData.publicUrl
  }

  const durationMs = Date.now() - t0
  log.info("image.generate.done", { storeId, path, durationMs })

  return signedData.signedUrl
}
