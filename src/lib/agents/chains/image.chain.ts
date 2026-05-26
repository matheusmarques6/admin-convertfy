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
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json()

  // Log completo para debug (truncado)
  log.info("image.raw_response", {
    storeId,
    keys: Object.keys(data),
    hasChoices: !!data.choices,
    hasData: !!data.data,
    choiceContent: data.choices?.[0]?.message?.content === null ? "null" : typeof data.choices?.[0]?.message?.content,
    dataLength: data.data?.length,
    firstDataKeys: data.data?.[0] ? Object.keys(data.data[0]) : [],
  })

  let imageBuffer: Buffer | null = null

  // Formato 1: OpenAI images API (data[].b64_json ou data[].url)
  if (data.data?.[0]) {
    const imgData = data.data[0]
    if (imgData.b64_json) {
      imageBuffer = Buffer.from(imgData.b64_json, "base64")
    } else if (imgData.url) {
      const dl = await fetch(imgData.url)
      if (dl.ok) imageBuffer = Buffer.from(await dl.arrayBuffer())
    }
  }

  // Formato 2: Chat completions com content array (image_url parts)
  if (!imageBuffer) {
    const content = data.choices?.[0]?.message?.content
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          const url = part.image_url.url
          if (url.startsWith("data:")) {
            const b64 = url.split(",")[1]
            if (b64) imageBuffer = Buffer.from(b64, "base64")
          } else {
            const dl = await fetch(url)
            if (dl.ok) imageBuffer = Buffer.from(await dl.arrayBuffer())
          }
          break
        }
      }
    } else if (typeof content === "string") {
      // Pode conter URL ou base64 inline
      const urlMatch = content.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/i)
      if (urlMatch) {
        const dl = await fetch(urlMatch[0])
        if (dl.ok) imageBuffer = Buffer.from(await dl.arrayBuffer())
      }
    }
  }

  // Formato 3: output na resposta (alguns modelos OpenRouter)
  if (!imageBuffer && data.choices?.[0]?.message?.output) {
    const output = data.choices[0].message.output
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item.type === "image" && item.data) {
          imageBuffer = Buffer.from(item.data, "base64")
          break
        }
      }
    }
  }

  if (!imageBuffer) {
    log.error("image.parse_failed", { storeId, response: JSON.stringify(data).slice(0, 1000) })
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
