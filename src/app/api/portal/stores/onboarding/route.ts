import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { onboardingPhaseService } from "@/lib/services/onboarding-phase.service"
import { logger } from "@/lib/logger"

const log = logger.child("PortalStoreOnboarding")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/portal/stores/onboarding
 * Existing client creates a new store (or replaces existing) + new onboarding for COO approval.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new AppError("Não autorizado", 401)

    const adminClient = createAdminClient()

    // Get portal user
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) throw new AppError("Não autorizado", 401)

    const clientId = portalUser.client_id
    const body = await request.json()

    // Validate required fields
    if (!body.store_name?.trim()) throw new AppError("Nome da loja é obrigatório", 400)
    if (!body.store_url?.trim()) throw new AppError("URL da loja é obrigatória", 400)
    if (!body.platform) throw new AppError("Plataforma é obrigatória", 400)
    if (!body.country) throw new AppError("País é obrigatório", 400)
    if (!body.language) throw new AppError("Idioma é obrigatório", 400)

    let storeId: string

    if (body.replace_store_id) {
      // Replace existing store - update its data
      const { data: existingStore } = await adminClient
        .from("client_stores")
        .select("id")
        .eq("id", body.replace_store_id)
        .eq("client_id", clientId)
        .single()

      if (!existingStore) throw new AppError("Loja não encontrada", 404)

      const { error: updateError } = await adminClient
        .from("client_stores")
        .update({
          store_name: body.store_name,
          store_url: body.store_url,
          platform: body.platform,
          niche: body.niche || null,
          country: body.country,
          language: body.language,
          target_audience: body.target_audience || null,
          free_shipping_type: body.free_shipping_type || null,
          shopify_collaborator_code: body.shopify_collaborator_code || null,
        })
        .eq("id", body.replace_store_id)

      if (updateError) {
        log.error("Failed to update store", updateError)
        throw new AppError("Erro ao atualizar loja", 500)
      }

      storeId = body.replace_store_id
    } else {
      // Create new store
      const { data: store, error: storeError } = await adminClient
        .from("client_stores")
        .insert({
          client_id: clientId,
          store_name: body.store_name,
          store_url: body.store_url,
          platform: body.platform,
          niche: body.niche || null,
          country: body.country,
          language: body.language,
          target_audience: body.target_audience || null,
          free_shipping_type: body.free_shipping_type || null,
          shopify_collaborator_code: body.shopify_collaborator_code || null,
        })
        .select("id")
        .single()

      if (storeError || !store) {
        log.error("Failed to create store", storeError)
        throw new AppError("Erro ao criar loja", 500)
      }

      storeId = store.id
    }

    // Save design/onboarding data if provided
    if (body.price_sensitivity || body.logo_url || body.design_direction_text || body.brand_manual_url || body.additional_notes) {
      const { data: defaultOrg } = await adminClient
        .from("organizations")
        .select("id")
        .limit(1)
        .single()

      if (defaultOrg?.id) {
        // Upsert - update if exists, create if not
        const { data: existing } = await adminClient
          .from("store_onboarding_data")
          .select("id")
          .eq("store_id", storeId)
          .maybeSingle()

        if (existing) {
          await adminClient.from("store_onboarding_data").update({
            price_sensitivity: body.price_sensitivity || null,
            additional_notes: body.additional_notes || null,
            logo_url: body.logo_url || null,
            design_direction_text: body.design_direction_text || null,
            design_direction_file_url: body.design_direction_file_url || null,
            brand_manual_url: body.brand_manual_url || null,
            filled_at: new Date().toISOString(),
            is_complete: true,
          }).eq("id", existing.id)
        } else {
          await adminClient.from("store_onboarding_data").insert({
            store_id: storeId,
            client_id: clientId,
            org_id: defaultOrg.id,
            price_sensitivity: body.price_sensitivity || null,
            additional_notes: body.additional_notes || null,
            logo_url: body.logo_url || null,
            design_direction_text: body.design_direction_text || null,
            design_direction_file_url: body.design_direction_file_url || null,
            brand_manual_url: body.brand_manual_url || null,
            filled_at: new Date().toISOString(),
            is_complete: true,
          })
        }
      }
    }

    // Create new onboarding with pending_approval
    const { data: template } = await adminClient
      .from("onboarding_templates")
      .select("*, steps:onboarding_template_steps(*)")
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + (template?.estimated_days || 14))

    const { data: onboarding, error: onbError } = await adminClient
      .from("client_onboardings")
      .insert({
        client_id: clientId,
        store_id: storeId,
        template_id: template?.id || null,
        status: "not_started",
        current_phase: "not_started",
        submitted_at: new Date().toISOString(),
        target_completion_date: targetDate.toISOString(),
      })
      .select("id")
      .single()

    if (onbError || !onboarding) {
      log.error("Failed to create onboarding", onbError)
      throw new AppError("Erro ao criar onboarding", 500)
    }

    // Create steps from template
    if (template?.steps?.length) {
      interface TStep { id: string; name: string; description?: string; category: string; position: number; metadata: Record<string, unknown> }
      const steps = (template.steps as TStep[])
        .sort((a, b) => a.position - b.position)
        .map((step) => ({
          onboarding_id: onboarding.id,
          template_step_id: step.id,
          name: step.name,
          description: step.description,
          category: step.category,
          position: step.position,
          status: "pending",
          metadata: step.metadata || {},
        }))

      await adminClient.from("client_onboarding_steps").insert(steps)
    }

    // Transition not_started → pending_approval (triggers notifyApprovers + notifyClient)
    try {
      await onboardingPhaseService.transition({
        onboardingId: onboarding.id,
        toPhase: "pending_approval",
        triggeredBy: "form_submission",
      })
    } catch {
      // Non-blocking — side effects are best-effort
    }

    log.info("Portal store onboarding submitted", {
      clientId,
      storeId,
      onboardingId: onboarding.id,
      isReplacement: !!body.replace_store_id,
    })

    return successResponse(
      request,
      {
        message: "Loja cadastrada com sucesso! Aguardando aprovação.",
        store_id: storeId,
        onboarding_id: onboarding.id,
      },
      { status: 201 }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalStoreOnboarding")
  }
}
