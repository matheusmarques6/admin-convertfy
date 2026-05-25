import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { n8nTriggerService } from "@/lib/services/n8n-trigger.service"

const log = logger.child("OnboardingStoreBriefing")

/**
 * GET /api/onboarding/store-briefing?store_id=X
 * Returns the current briefing for a store
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const storeId = request.nextUrl.searchParams.get("store_id")
    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    const { data: briefing, error } = await adminClient
      .from("store_briefings")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "current")
      .order("version", { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // No briefing found is fine
      return successResponse(request, { briefing: null })
    }

    return successResponse(request, { briefing })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreBriefing")
  }
}

/**
 * PATCH /api/onboarding/store-briefing
 * Update briefing_data (inline editing)
 * Body: { briefing_id, briefing_data }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()

    if (!body.briefing_id || !body.briefing_data) {
      throw new AppError("briefing_id e briefing_data são obrigatórios", 400)
    }

    const adminClient = createAdminClient()

    // Verify user belongs to an org
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id, org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      throw new AppError("Não autorizado", 403)
    }

    // Verify briefing exists and belongs to user's org
    const { data: existing } = await adminClient
      .from("store_briefings")
      .select("id, store_id, version, store:client_stores!inner(org_id)")
      .eq("id", body.briefing_id)
      .eq("status", "current")
      .single()

    if (!existing) {
      throw new AppError("Briefing não encontrado", 404)
    }

    const storeOrg = (existing.store as unknown as { org_id: string })?.org_id
    if (storeOrg && storeOrg !== orgMember.org_id) {
      throw new AppError("Não autorizado para este briefing", 403)
    }

    // Update the briefing_data
    const { error } = await adminClient
      .from("store_briefings")
      .update({
        briefing_data: body.briefing_data,
        generated_by: `edited:${user.id}`,
      })
      .eq("id", body.briefing_id)

    if (error) {
      log.error("Failed to update briefing", error)
      throw new AppError("Erro ao atualizar briefing", 500)
    }

    log.info(`Briefing ${body.briefing_id} updated by ${user.id}`)

    return successResponse(request, {
      success: true,
      message: "Briefing atualizado com sucesso",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreBriefing")
  }
}

/**
 * POST /api/onboarding/store-briefing
 * Generate/regenerate briefing via N8N or create manual briefing
 * Body: { store_id, mode: 'regenerate' | 'manual', briefing_text?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()

    if (!body.store_id) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const mode = body.mode || "regenerate"
    if (!["regenerate", "manual"].includes(mode)) {
      throw new AppError("mode deve ser 'regenerate' ou 'manual'", 400)
    }

    const adminClient = createAdminClient()

    if (mode === "manual") {
      if (!body.briefing_text || typeof body.briefing_text !== "string" || !body.briefing_text.trim()) {
        throw new AppError("briefing_text é obrigatório para modo manual", 400)
      }

      // Archive existing briefing if any
      await adminClient
        .from("store_briefings")
        .update({ status: "archived" })
        .eq("store_id", body.store_id)
        .eq("status", "current")

      // Get current max version
      const { data: latest } = await adminClient
        .from("store_briefings")
        .select("version")
        .eq("store_id", body.store_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = (latest?.version || 0) + 1

      // Fetch store basic info for context
      const { data: store } = await adminClient
        .from("client_stores")
        .select("store_name, store_url")
        .eq("id", body.store_id)
        .single()

      const { data: newBriefing, error: insertError } = await adminClient
        .from("store_briefings")
        .insert({
          store_id: body.store_id,
          version: nextVersion,
          status: "current",
          briefing_data: {
            raw_text: body.briefing_text.trim(),
            dados_loja: {
              nome: store?.store_name || "",
              url: store?.store_url || "",
            },
          },
          generated_by: "manual",
          generated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertError) {
        log.error("Failed to insert manual briefing", insertError)
        throw new AppError("Erro ao salvar briefing manual", 500)
      }

      log.info(`Manual briefing created for store ${body.store_id}, version ${nextVersion}`)

      return successResponse(request, {
        briefing: newBriefing,
        version: nextVersion,
        message: "Briefing manual criado com sucesso",
      })
    }

    // mode === "regenerate": trigger N8N
    const { data: fullStore } = await adminClient
      .from("client_stores")
      .select("store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code")
      .eq("id", body.store_id)
      .single()

    if (!fullStore) {
      throw new AppError("Loja não encontrada", 404)
    }

    const { data: formData } = await adminClient
      .from("store_onboarding_data")
      .select("price_sensitivity, additional_notes, logo_url, design_direction_text, design_direction_file_url, brand_manual_url")
      .eq("store_id", body.store_id)
      .maybeSingle()

    const { data: onboarding } = await adminClient
      .from("client_onboardings")
      .select("id")
      .eq("store_id", body.store_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    const result = await n8nTriggerService.triggerBriefingGeneration({
      onboarding_id: onboarding?.id || body.store_id,
      store: {
        name: fullStore.store_name || "",
        url: fullStore.store_url || "",
        platform: fullStore.platform || "",
        niche: fullStore.niche || null,
        country: fullStore.country || null,
        language: fullStore.language || null,
        target_audience: fullStore.target_audience || null,
        free_shipping_type: fullStore.free_shipping_type || null,
        shopify_collaborator_code: fullStore.shopify_collaborator_code || null,
      },
      form_data: formData ? {
        price_sensitivity: formData.price_sensitivity || null,
        additional_notes: formData.additional_notes || null,
        logo_url: formData.logo_url || null,
        design_direction_text: formData.design_direction_text || null,
        design_direction_file_url: formData.design_direction_file_url || null,
        brand_manual_url: formData.brand_manual_url || null,
      } : null,
      callback_url: `${appUrl}/api/onboarding/webhook`,
    })

    if (!result.success) {
      log.error(`Failed to trigger briefing regeneration for store ${body.store_id}`, { error: result.error })
      throw new AppError(
        `Erro ao disparar webhook N8N: ${result.error || "URL não configurada ou N8N indisponível"}`,
        502,
      )
    }

    log.info(`Briefing regeneration triggered for store ${body.store_id}`)

    return successResponse(request, {
      triggered: true,
      message: "Geração do briefing disparada. Aguarde o resultado.",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingStoreBriefing")
  }
}
