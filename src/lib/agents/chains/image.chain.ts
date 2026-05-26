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
      model: "openai/gpt-image-1",
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  if (!choice) throw new Error("OpenRouter não retornou resposta")

  // Extrair URL da imagem da resposta
  const content = choice.message?.content
  let imageUrl: string | null = null

  if (Array.isArray(content)) {
    const imgPart = content.find((p: { type: string }) => p.type === "image_url")
    imageUrl = imgPart?.image_url?.url ?? null
  }

  if (!imageUrl && typeof content === "string") {
    const urlMatch = content.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/i)
    imageUrl = urlMatch?.[0] ?? null
  }

  if (!imageUrl) {
    log.warn("image.no_url_in_response", { storeId, content: JSON.stringify(content).slice(0, 500) })
    throw new Error("OpenRouter não retornou URL de imagem na resposta")
  }

  // Download da imagem
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: HTTP ${imgRes.status}`)
  const arrayBuf = await imgRes.arrayBuffer()
  const imageBuffer = Buffer.from(arrayBuf)

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
