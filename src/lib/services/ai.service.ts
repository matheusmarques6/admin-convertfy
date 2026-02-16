import OpenAI from "openai"
import { logger } from "@/lib/logger"

const log = logger.child("AIService")

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada")
  }
  return new OpenAI({ apiKey })
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  abandoned_cart: "Carrinho Abandonado",
  welcome: "Boas-vindas",
  promotional: "Promocional",
  newsletter: "Newsletter",
  reactivation: "Reativação",
}

const TONE_LABELS: Record<string, string> = {
  professional: "profissional",
  casual: "casual e descontraído",
  urgent: "urgente e escasso",
  friendly: "amigável e acolhedor",
}

export async function generateEmailSubjects(campaignType: string): Promise<string[]> {
  const openai = getClient()
  const typeLabel = CAMPAIGN_TYPE_LABELS[campaignType] || campaignType

  log.info("Generating email subjects", { campaignType })

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Você é um especialista em email marketing para e-commerce brasileiro. Retorne APENAS as linhas de assunto, uma por linha, sem numeração ou prefixos.",
      },
      {
        role: "user",
        content: `Gere 5 linhas de assunto de email de alta conversão em português brasileiro para uma campanha de "${typeLabel}". Foque em urgência, valor e curiosidade. Máximo 60 caracteres cada.`,
      },
    ],
    temperature: 0.8,
    max_tokens: 300,
  })

  const content = response.choices[0]?.message?.content || ""
  const subjects = content
    .split("\n")
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((line) => line.length > 0)

  log.info("Email subjects generated", { count: subjects.length })
  return subjects
}

export async function generateAdCopy(product: string, tone: string): Promise<string> {
  const openai = getClient()
  const toneLabel = TONE_LABELS[tone] || tone

  log.info("Generating ad copy", { product, tone })

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Você é um copywriter especialista em anúncios para e-commerce brasileiro. Crie copies diretas e persuasivas.",
      },
      {
        role: "user",
        content: `Crie uma copy persuasiva em português brasileiro para anúncio de "${product}" com tom ${toneLabel}. Inclua emojis, bullet points, e call to action. Máximo 150 palavras.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  })

  const copy = response.choices[0]?.message?.content || ""
  log.info("Ad copy generated", { length: copy.length })
  return copy
}
