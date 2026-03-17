import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createAdminClient } from "@/lib/supabase/server"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { publicOnboardingSchema } from "@/lib/schemas/public-onboarding.schema"
import { onboardingPhaseService } from "@/lib/services/onboarding-phase.service"
import { logger } from "@/lib/logger"

const log = logger.child("PublicOnboarding")

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}

export async function POST(request: NextRequest) {
  // Rate limit
  const limited = await checkRateLimit(request, "cliente:onboarding", RATE_LIMITS.clienteForm)
  if (limited) return limited

  try {
    const body = await request.json()

    // Honeypot check
    if (body.website) {
      // Silently reject bot submissions
      return successResponse(request, {
        message: "Formulário enviado com sucesso",
      })
    }

    // Validate input
    const data = publicOnboardingSchema.parse(body)

    const adminClient = createAdminClient()

    // Get default org (needed for client, store, and onboarding data)
    const { data: defaultOrg } = await adminClient
      .from("organizations")
      .select("id")
      .limit(1)
      .single()

    const orgId = defaultOrg?.id
    if (!orgId) {
      log.error("No default organization found")
      throw new AppError("Configuração do sistema incompleta", 500)
    }

    // Check if email already exists
    const { data: existingClient } = await adminClient
      .from("clients")
      .select("id")
      .eq("email", data.email)
      .maybeSingle()

    if (existingClient) {
      throw new AppError("Este email já está cadastrado. Faça login no portal.", 409)
    }

    const { data: existingPortalUser } = await adminClient
      .from("client_portal_users")
      .select("id")
      .eq("email", data.email)
      .maybeSingle()

    if (existingPortalUser) {
      throw new AppError("Este email já está cadastrado. Faça login no portal.", 409)
    }

    // 1. Create client
    const { data: client, error: clientError } = await adminClient
      .from("clients")
      .insert({
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        cpf_cnpj: data.cpf_cnpj || null,
        status: "onboarding",
        org_id: orgId,
      })
      .select("id")
      .single()

    if (clientError || !client) {
      log.error("Failed to create client", { code: clientError?.code, message: clientError?.message, details: clientError?.details, hint: clientError?.hint })
      throw new AppError(`Erro ao criar cadastro: ${clientError?.message || "unknown"}`, 500)
    }

    // 2. Create store
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .insert({
        client_id: client.id,
        org_id: orgId,
        store_name: data.store_name,
        store_url: data.store_url,
        platform: data.platform,
        niche: data.niche || null,
        country: data.country || "BR",
        language: data.language || "pt-BR",
        target_audience: data.target_audience || null,
        free_shipping_type: data.free_shipping_type || null,
        shopify_collaborator_code: data.shopify_collaborator_code || null,
      })
      .select("id")
      .single()

    if (storeError || !store) {
      log.error("Failed to create store", storeError)
      // Rollback client
      await adminClient.from("clients").delete().eq("id", client.id)
      throw new AppError("Erro ao criar loja", 500)
    }

    // 3. Create store onboarding data (design info)
    if (data.price_sensitivity || data.logo_url || data.design_direction_text || data.design_direction_file_url || data.brand_manual_url || data.additional_notes) {
      await adminClient.from("store_onboarding_data").insert({
        store_id: store.id,
        client_id: client.id,
        org_id: orgId,
        price_sensitivity: data.price_sensitivity || null,
        additional_notes: data.additional_notes || null,
        logo_url: data.logo_url || null,
        design_direction_text: data.design_direction_text || null,
        design_direction_file_url: data.design_direction_file_url || null,
        brand_manual_url: data.brand_manual_url || null,
        filled_by: null,
        filled_at: new Date().toISOString(),
        is_complete: true,
      })
    }

    // 4. Create onboarding with pending_approval status
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
        client_id: client.id,
        store_id: store.id,
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

    // Create steps from template — copy all relevant fields
    if (template?.steps?.length) {
      interface TStep {
        id: string; name: string; description?: string; category: string
        position: number; metadata: Record<string, unknown>
        is_required?: boolean; phase?: string
        depends_on?: string; depends_on_steps?: string[]
      }

      const sortedTemplateSteps = (template.steps as TStep[])
        .sort((a, b) => a.position - b.position)

      const steps = sortedTemplateSteps.map((step) => ({
        onboarding_id: onboarding.id,
        template_step_id: step.id,
        name: step.name,
        description: step.description,
        category: step.category,
        position: step.position,
        status: "pending",
        metadata: step.metadata || {},
        is_required: step.is_required ?? true,
        phase: step.phase ?? null,
        org_id: orgId,
      }))

      const { data: insertedSteps } = await adminClient
        .from("client_onboarding_steps")
        .insert(steps)
        .select("id, template_step_id")

      // Resolve depends_on_step_ids from template dependencies
      if (insertedSteps && insertedSteps.length > 0) {
        const templateToClientStep = new Map(
          insertedSteps.map((s: { id: string; template_step_id: string }) => [s.template_step_id, s.id])
        )

        for (const tStep of sortedTemplateSteps) {
          const templateDepIds: string[] = [
            ...(tStep.depends_on_steps || []),
            ...(tStep.depends_on && !(tStep.depends_on_steps || []).includes(tStep.depends_on)
              ? [tStep.depends_on]
              : []),
          ]

          if (templateDepIds.length === 0) continue

          const clientDepIds = templateDepIds
            .map((tid: string) => templateToClientStep.get(tid))
            .filter(Boolean) as string[]

          if (clientDepIds.length > 0) {
            const clientStepId = templateToClientStep.get(tStep.id)
            if (clientStepId) {
              await adminClient
                .from("client_onboarding_steps")
                .update({ depends_on_step_ids: clientDepIds })
                .eq("id", clientStepId)
            }
          }
        }

        // Initialize step statuses (set 'waiting' for steps with unmet deps)
        await adminClient.rpc("initialize_onboarding_step_statuses", {
          p_onboarding_id: onboarding.id,
        })
      }
    }

    // 5. Transition not_started → pending_approval (triggers notifyApprovers + notifyClient)
    try {
      await onboardingPhaseService.transition({
        onboardingId: onboarding.id,
        toPhase: "pending_approval",
        triggeredBy: "form_submission",
      })
    } catch {
      // Non-blocking — side effects are best-effort
    }

    log.info("Public onboarding form submitted successfully", {
      clientId: client.id,
      storeId: store.id,
      onboardingId: onboarding.id,
    })

    return successResponse(
      request,
      { message: "Formulário enviado com sucesso! Sua solicitação está em análise." },
      { status: 201 }
    )
  } catch (error) {
    return errorResponse(request, error, "PublicOnboarding")
  }
}
