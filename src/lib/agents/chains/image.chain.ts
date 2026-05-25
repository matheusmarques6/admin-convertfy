/**
 * Image Chain — gera imagens para blocos de email via OpenAI GPT Image 2.
 *
 * 1. Gera imagem com openai.images.generate()
 * 2. Faz download do base64/URL retornado
 * 3. Upload pro Supabase Storage (bucket: onboarding-visual-assets)
 * 4. Retorna signed URL
 */

import OpenAI from "openai"
import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ImageChain")

// ── Default prompt template ─────────────────────────────────

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

// ── Main function ───────────────────────────────────────────

export async function generateEmailImage(
  prompt: string,
  storeId: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada")

  const openai = new OpenAI({ apiKey })

  log.info("image.generate.start", { storeId, promptLength: prompt.length })
  const t0 = Date.now()

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1536x1024",
    quality: "low",
  })

  const imageData = response.data?.[0]
  if (!imageData) {
    throw new Error("OpenAI não retornou imagem")
  }

  // Converter b64_json ou URL para buffer
  let imageBuffer: Buffer

  if (imageData.b64_json) {
    imageBuffer = Buffer.from(imageData.b64_json, "base64")
  } else if (imageData.url) {
    const imgRes = await fetch(imageData.url)
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: HTTP ${imgRes.status}`)
    const arrayBuf = await imgRes.arrayBuffer()
    imageBuffer = Buffer.from(arrayBuf)
  } else {
    throw new Error("OpenAI retornou imagem sem dados")
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

  // Gerar signed URL (válida por 1 ano)
  const { data: signedData, error: signErr } = await admin.storage
    .from("onboarding-visual-assets")
    .createSignedUrl(path, 365 * 24 * 60 * 60)

  if (signErr || !signedData?.signedUrl) {
    // Fallback: retorna public URL (pode não funcionar se bucket é privado)
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
