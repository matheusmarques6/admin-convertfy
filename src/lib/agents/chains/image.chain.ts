/**
 * Image Chain — gera imagens para blocos de email via OpenRouter.
 *
 * OpenRouter expõe modelos de imagem via chat completions, não via
 * /images/generations. Usamos fetch direto no endpoint de chat.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ImageChain")

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `Create a hero banner for an email marketing campaign.
Brand: {brand_name} ({nicho})
Style: {posicionamento} positioning, {tom_voz} tone
Brand colors: {primary_colors}
Email context: {block_purpose}
Requirements:
- Clean, modern e-commerce aesthetic
- No text in the image (text is overlaid in HTML)
- Landscape aspect ratio (600x300)
- Product/lifestyle photography style`

export function renderImagePrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "")
}

export async function generateEmailImage(
  prompt: string,
  storeId: string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada")

  log.info("image.generate.start", { storeId, promptLength: prompt.length })
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

  const data = await res.json()

  let imageBuffer: Buffer | null = null

  // Formato OpenRouter GPT Image: choices[0].message.images[0].image_url.url (data:image/png;base64,...)
  const images = data.choices?.[0]?.message?.images
  if (Array.isArray(images)) {
    for (const img of images) {
      const url = img?.image_url?.url
      if (url && typeof url === "string" && url.startsWith("data:")) {
        const b64 = url.split(",")[1]
        if (b64) {
          imageBuffer = Buffer.from(b64, "base64")
          break
        }
      }
    }
  }

  // Fallback: data[].b64_json (OpenAI compat)
  if (!imageBuffer && data.data?.[0]?.b64_json) {
    imageBuffer = Buffer.from(data.data[0].b64_json, "base64")
  }

  if (!imageBuffer) {
    const msgKeys = data.choices?.[0]?.message ? Object.keys(data.choices[0].message) : []
    log.error("image.parse_failed", { storeId, messageKeys: msgKeys })
    throw new Error("Não foi possível extrair imagem da resposta do OpenRouter")
  }

  // Upload pro Supabase Storage
  const admin = createAdminClient()
  const uuid = crypto.randomUUID()
  const path = `stores/${storeId}/email-assets/${uuid}.png`

  const { error: uploadErr } = await admin.storage
    .from("onboarding-visual-assets")
    .upload(path, imageBuffer, {
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
