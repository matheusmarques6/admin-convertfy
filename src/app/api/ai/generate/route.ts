import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { generateEmailSubjects, generateAdCopy } from "@/lib/services/ai.service"
import { logger } from "@/lib/logger"

const log = logger.child("AIGenerate")

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const { type } = body

    if (!type) {
      throw new AppError("Tipo de geração é obrigatório", 400)
    }

    switch (type) {
      case "email_subjects": {
        const { campaignType } = body
        if (!campaignType) {
          throw new AppError("campaignType é obrigatório", 400)
        }
        const subjects = await generateEmailSubjects(campaignType)
        return successResponse(request, { subjects })
      }

      case "ad_copy": {
        const { product, tone } = body
        if (!product) {
          throw new AppError("product é obrigatório", 400)
        }
        const copy = await generateAdCopy(product, tone || "professional")
        return successResponse(request, { copy })
      }

      default:
        throw new AppError(`Tipo "${type}" não suportado`, 400)
    }
  } catch (error) {
    if (error instanceof Error && error.message === "OPENAI_API_KEY não configurada") {
      log.warn("OpenAI API key not configured")
      return errorResponse(request, new AppError("API de IA não configurada. Configure a OPENAI_API_KEY nas variáveis de ambiente.", 503), "AIGenerate")
    }
    return errorResponse(request, error, "AIGenerate")
  }
}
