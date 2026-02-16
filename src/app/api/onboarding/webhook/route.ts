import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingWebhook")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Webhook endpoint for n8n to send store analysis results
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret (will be configured later)
    const webhookSecret = request.headers.get("X-Webhook-Secret")
    const expectedSecret = process.env.ONBOARDING_WEBHOOK_SECRET

    // For now, if no secret is configured, allow requests (dev mode)
    if (expectedSecret && webhookSecret !== expectedSecret) {
      throw new AppError("Unauthorized", 401)
    }

    const body = await request.json()

    // Expected payload from n8n:
    // {
    //   onboarding_id: "uuid",
    //   type: "store_analysis" | "copies_generated",
    //   data: { ... }
    // }

    if (!body.onboarding_id || !body.type || !body.data) {
      throw new AppError("Campos obrigatórios: onboarding_id, type, data", 400)
    }

    const adminClient = createAdminClient()

    if (body.type === "store_analysis") {
      // Update store_analysis field
      const { error } = await adminClient
        .from("client_onboardings")
        .update({ store_analysis: body.data })
        .eq("id", body.onboarding_id)

      if (error) {
        log.error("[Webhook] Update error:", error)
        throw new AppError("Erro ao salvar análise", 500)
      }

      // If there's a step for "Análise da Loja", mark it as completed
      await adminClient
        .from("client_onboarding_steps")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          notes: "Análise concluída via n8n",
        })
        .eq("onboarding_id", body.onboarding_id)
        .ilike("name", "%Análise da Loja%")

      return successResponse(request, {
        success: true,
        message: "Análise da loja salva com sucesso",
      })
    }

    if (body.type === "copies_generated") {
      // Update generated_copies field
      const { error } = await adminClient
        .from("client_onboardings")
        .update({ generated_copies: body.data })
        .eq("id", body.onboarding_id)

      if (error) {
        log.error("[Webhook] Update error:", error)
        throw new AppError("Erro ao salvar copies", 500)
      }

      return successResponse(request, {
        success: true,
        message: "Copies geradas e salvas com sucesso",
      })
    }

    throw new AppError("Tipo de webhook não suportado", 400)
  } catch (error) {
    return errorResponse(request, error, "OnboardingWebhook")
  }
}
