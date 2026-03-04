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

// GET - Health check endpoint for N8N to verify webhook accessibility (AC 12.1.3)
export async function GET(request: NextRequest) {
  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"

  return successResponse(request, {
    status: "ok",
    endpoint: `${appUrl}/api/onboarding/webhook`,
    secret_configured: !!process.env.ONBOARDING_WEBHOOK_SECRET,
  })
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

    if (body.type === "briefing_generated") {
      // AC 12.1.4 — Log de confirmação ao receber briefing_generated
      log.info("[Webhook] Recebendo briefing_generated", {
        onboarding_id: body.onboarding_id,
      })

      // AC 12.1.2 — Log da estrutura recebida para debug
      log.warn("[Webhook] briefing_generated payload keys", {
        onboarding_id: body.onboarding_id,
        data_keys: body.data ? Object.keys(body.data) : [],
      })

      // AC 12.1.2 — Validação de campos obrigatórios
      const requiredTopLevelKeys = [
        "dados_loja",
        "foco_campanhas",
        "publico",
        "perfil_marca",
        "materiais_identidade",
        "detalhes_adicionais",
        "codigo_colaborador",
      ]
      const missingKeys = requiredTopLevelKeys.filter(
        (k) => !body.data || !(k in body.data)
      )
      if (missingKeys.length > 0) {
        throw new AppError(
          `briefing_data incompleto. Campos ausentes: ${missingKeys.join(", ")}`,
          400
        )
      }

      // AC 12.1.2 — Adicionar defaults para campos opcionais
      const briefingData = {
        resumo_performance: {},
        analise_anuncios: {},
        ...body.data,
      }

      // N8N generated a briefing via AI — save it to store_briefings
      const { data: onboarding } = await adminClient
        .from("client_onboardings")
        .select("store_id")
        .eq("id", body.onboarding_id)
        .single()

      if (!onboarding?.store_id) {
        throw new AppError("Onboarding ou loja não encontrados", 404)
      }

      const storeId = onboarding.store_id

      // Archive previous briefing
      await adminClient
        .from("store_briefings")
        .update({ status: "archived" })
        .eq("store_id", storeId)
        .eq("status", "current")

      // Get next version
      const { data: lastBriefing } = await adminClient
        .from("store_briefings")
        .select("version")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = (lastBriefing?.version || 0) + 1

      // Insert new briefing from N8N
      const { error: insertError } = await adminClient
        .from("store_briefings")
        .insert({
          store_id: storeId,
          briefing_data: briefingData,
          version: nextVersion,
          generated_at: new Date().toISOString(),
          generated_by: "n8n",
          status: "current",
        })

      if (insertError) {
        log.error("[Webhook] Error saving briefing", insertError)
        throw new AppError("Erro ao salvar briefing", 500)
      }

      // AC 12.1.4 — Log de confirmação após salvar
      log.info("[Webhook] Briefing salvo com sucesso", {
        store_id: storeId,
        version: nextVersion,
        generated_by: "n8n",
      })

      return successResponse(request, {
        success: true,
        message: "Briefing salvo com sucesso",
        store_id: storeId,
        version: nextVersion,
      })
    }

    if (body.type === "drive_folder") {
      // N8N created Google Drive folder with copies — save the link
      const driveUrl = body.data?.folder_url || body.data?.url || body.data?.link

      if (!driveUrl) {
        throw new AppError("folder_url é obrigatório em data", 400)
      }

      // Validate URL format
      try {
        new URL(driveUrl)
      } catch {
        throw new AppError("URL do Drive inválida", 400)
      }

      const { error } = await adminClient
        .from("client_onboardings")
        .update({
          drive_folder_url: driveUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.onboarding_id)

      if (error) {
        log.error("[Webhook] Error saving drive folder", error)
        throw new AppError("Erro ao salvar link do Drive", 500)
      }

      // Also transition to design phase if still in generating_copies
      const { data: currentOnb } = await adminClient
        .from("client_onboardings")
        .select("current_phase")
        .eq("id", body.onboarding_id)
        .single()

      if (currentOnb?.current_phase === "generating_copies") {
        const { onboardingPhaseService } = await import("@/lib/services/onboarding-phase.service")
        await onboardingPhaseService.transition({
          onboardingId: body.onboarding_id,
          toPhase: "design",
          triggeredBy: "n8n_webhook",
          metadata: { drive_folder_url: driveUrl },
        }).catch((err: unknown) => {
          log.warn("[Webhook] Phase transition failed after drive_folder", err)
        })
      }

      log.info(`Drive folder saved for onboarding ${body.onboarding_id}`)

      return successResponse(request, {
        success: true,
        message: "Link do Drive salvo com sucesso",
      })
    }

    throw new AppError("Tipo de webhook não suportado", 400)
  } catch (error) {
    return errorResponse(request, error, "OnboardingWebhook")
  }
}
