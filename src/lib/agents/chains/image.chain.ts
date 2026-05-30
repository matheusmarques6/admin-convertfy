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
  },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada")

  log.info("image.generate.start", {
    storeId,
    promptLength: prompt.length,
    aspect: options?.aspect,
    overlayReserveBottom: options?.overlayReserveBottom,
  })
  const t0 = Date.now()

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.4-image-2",
      messages: [{ role: "user", content: prompt }],
      response_format: "b64_json",
    }),
  })

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
