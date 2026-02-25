import { NextRequest } from "next/server"
import { timingSafeEqual } from "crypto"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingWebhook")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}


// POST - Webhook endpoint for n8n to send store analysis results
export async function POST(request: NextRequest) {
  // Rate limiting
  const limited = checkRateLimit(request, "webhook:onboarding", RATE_LIMITS.webhook)
  if (limited) return limited

  try {
    // Verify webhook secret - REQUIRED in production
    const webhookSecret = request.headers.get("X-Webhook-Secret")
    const expectedSecret = process.env.ONBOARDING_WEBHOOK_SECRET

    if (!expectedSecret) {
      log.error("ONBOARDING_WEBHOOK_SECRET not configured")
      throw new AppError("Webhook secret not configured", 500)
    }

    if (!webhookSecret) {
      throw new AppError("Missing X-Webhook-Secret header", 401)
    }

    // Use timing-safe comparison to prevent timing attacks
    try {
      const a = Buffer.from(webhookSecret)
      const b = Buffer.from(expectedSecret)
      if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
        throw new AppError("Unauthorized", 401)
      }
    } catch (e) {
      if (e instanceof AppError) throw e
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
        .update({
          generated_copies: body.data,
          copies_completed_at: new Date().toISOString(),
        })
        .eq("id", body.onboarding_id)

      if (error) {
        log.error("[Webhook] Update error:", error)
        throw new AppError("Erro ao salvar copies", 500)
      }

      // Transition to design phase automatically
      const { onboardingPhaseService } = await import("@/lib/services/onboarding-phase.service")
      const transitionResult = await onboardingPhaseService.transition({
        onboardingId: body.onboarding_id,
        toPhase: "design",
        triggeredBy: "n8n_webhook",
        metadata: { copies_count: Array.isArray(body.data) ? body.data.length : 1 },
      })

      if (!transitionResult.success) {
        log.warn(`[Webhook] Phase transition failed: ${transitionResult.error}`, {
          onboardingId: body.onboarding_id,
        })
      }

      return successResponse(request, {
        success: true,
        message: "Copies salvas e transição para design realizada",
      })
    }

    throw new AppError("Tipo de webhook não suportado", 400)
  } catch (error) {
    return errorResponse(request, error, "OnboardingWebhook")
  }
}
