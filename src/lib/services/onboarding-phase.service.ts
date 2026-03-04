import { createAdminClient } from "@/lib/supabase/server"
import { notificationService } from "@/lib/services/notification.service"
import { n8nTriggerService } from "@/lib/services/n8n-trigger.service"
import { logger } from "@/lib/logger"
import type { ClientOnboarding, PhaseTransitionTrigger } from "@/types/onboarding"

const log = logger.child("OnboardingPhase")

// Valid phase transitions (from → to[])
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_approval: ["generating_copies", "cancelled"],
  generating_copies: ["design", "pending_approval"],
  design: ["implementation", "generating_copies"],
  implementation: ["completed", "design"],
  completed: [],
  cancelled: ["pending_approval"],
  // Legacy compatibility
  not_started: ["pending_approval", "in_progress", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
}

// Phase labels for notifications
const PHASE_LABELS: Record<string, string> = {
  pending_approval: "Aguardando Aprovação",
  generating_copies: "Gerando Copies",
  design: "Design",
  implementation: "Implementação",
  completed: "Concluído",
  cancelled: "Cancelado",
  not_started: "Não Iniciado",
  in_progress: "Em Andamento",
  paused: "Pausado",
}

export class OnboardingPhaseService {
  /**
   * Transition an onboarding to a new phase
   * Validates the transition, executes side effects, and notifies
   */
  async transition(params: {
    onboardingId: string
    toPhase: string
    triggeredBy: PhaseTransitionTrigger
    triggeredByUserId?: string
    metadata?: Record<string, unknown>
  }): Promise<{ success: boolean; onboarding?: ClientOnboarding; error?: string }> {
    const adminClient = createAdminClient()

    // 1. Fetch current onboarding
    const { data: onboarding, error: fetchError } = await adminClient
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company, email),
        store:client_stores(id, store_name, store_url, platform, niche, target_audience)
      `)
      .eq("id", params.onboardingId)
      .single()

    if (fetchError || !onboarding) {
      log.error("Onboarding not found", { id: params.onboardingId })
      return { success: false, error: "Onboarding não encontrado" }
    }

    const fromPhase = onboarding.current_phase || onboarding.status || "not_started"

    // 2. Validate transition
    const validTargets = VALID_TRANSITIONS[fromPhase] || []
    if (!validTargets.includes(params.toPhase)) {
      log.warn(`Invalid transition: ${fromPhase} → ${params.toPhase}`, { id: params.onboardingId })
      return {
        success: false,
        error: `Transição inválida: ${PHASE_LABELS[fromPhase]} → ${PHASE_LABELS[params.toPhase]}`,
      }
    }

    // 3. Build update data
    const updateData: Record<string, unknown> = {
      current_phase: params.toPhase,
      status: params.toPhase,
      updated_at: new Date().toISOString(),
    }

    // Phase-specific timestamps
    switch (params.toPhase) {
      case "generating_copies":
        updateData.approved_at = new Date().toISOString()
        updateData.approved_by = params.triggeredByUserId
        break
      case "design":
        updateData.copies_completed_at = new Date().toISOString()
        break
      case "implementation":
        updateData.design_completed_at = new Date().toISOString()
        updateData.implementation_started_at = new Date().toISOString()
        break
      case "completed":
        updateData.completed_at = new Date().toISOString()
        break
    }

    // 4. Update onboarding
    const { data: updated, error: updateError } = await adminClient
      .from("client_onboardings")
      .update(updateData)
      .eq("id", params.onboardingId)
      .select()
      .single()

    if (updateError) {
      log.error("Failed to update onboarding phase", updateError)
      return { success: false, error: "Erro ao atualizar fase" }
    }

    // 5. Log the transition
    await adminClient.from("onboarding_phase_transitions").insert({
      onboarding_id: params.onboardingId,
      from_phase: fromPhase,
      to_phase: params.toPhase,
      triggered_by: params.triggeredBy,
      triggered_by_user: params.triggeredByUserId || null,
      metadata: params.metadata || null,
    })

    // 6. Execute side effects (non-blocking, best-effort)
    try {
      await this.executeSideEffects(onboarding, fromPhase, params.toPhase)
    } catch (error) {
      // Side effects should never block the transition
      log.error("Side effect error (non-blocking)", error)
    }

    log.info(`Phase transition: ${fromPhase} → ${params.toPhase}`, {
      onboardingId: params.onboardingId,
      triggeredBy: params.triggeredBy,
    })

    return { success: true, onboarding: updated as ClientOnboarding }
  }

  /**
   * Execute side effects for a phase transition
   */
  private async executeSideEffects(
    onboarding: ClientOnboarding,
    fromPhase: string,
    toPhase: string
  ): Promise<void> {
    const adminClient = createAdminClient()

    switch (toPhase) {
      case "pending_approval": {
        // Notify approvers (users with onboarding_approve feature)
        await this.notifyApprovers(onboarding)
        await this.notifyClient(onboarding, "form_submitted",
          "Seu cadastro foi recebido e está sendo analisado pela nossa equipe.")
        break
      }

      case "generating_copies": {
        // Fetch full client + store + form data for N8N
        const { data: fullClient } = await adminClient
          .from("clients")
          .select("id, name, email, phone, cpf_cnpj, company")
          .eq("id", onboarding.client_id)
          .single()

        const { data: fullStore } = await adminClient
          .from("client_stores")
          .select("id, store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code")
          .eq("id", onboarding.store_id)
          .single()

        const { data: formData } = await adminClient
          .from("store_onboarding_data")
          .select("price_sensitivity, additional_notes, logo_url, design_direction_text, design_direction_file_url, brand_manual_url, visual_reference_url")
          .eq("store_id", onboarding.store_id)
          .maybeSingle()

        // AC 12.1.3 — APP_URL server-side tem prioridade sobre NEXT_PUBLIC_APP_URL
        const appUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000"
        log.info("[CopyGeneration] callback_url configurado", {
          callback_url: `${appUrl}/api/onboarding/webhook`,
        })
        await n8nTriggerService.triggerCopyGeneration({
          onboarding_id: onboarding.id,
          client: {
            name: fullClient?.name || onboarding.client?.name || "",
            email: fullClient?.email || "",
            phone: fullClient?.phone || null,
            cpf_cnpj: fullClient?.cpf_cnpj || null,
            company: fullClient?.company || null,
          },
          store: {
            name: fullStore?.store_name || onboarding.store?.store_name || "",
            url: fullStore?.store_url || onboarding.store?.store_url || "",
            platform: fullStore?.platform || onboarding.store?.platform || "",
            niche: fullStore?.niche || null,
            country: fullStore?.country || null,
            language: fullStore?.language || null,
            target_audience: fullStore?.target_audience || null,
            free_shipping_type: fullStore?.free_shipping_type || null,
            shopify_collaborator_code: fullStore?.shopify_collaborator_code || null,
          },
          form_data: formData ? {
            price_sensitivity: formData.price_sensitivity || null,
            additional_notes: formData.additional_notes || null,
            logo_url: formData.logo_url || null,
            design_direction_text: formData.design_direction_text || null,
            design_direction_file_url: formData.design_direction_file_url || null,
            brand_manual_url: formData.brand_manual_url || null,
            visual_reference_url: formData.visual_reference_url || null,
          } : null,
          callback_url: `${appUrl}/api/onboarding/webhook`,
        })

        await this.notifyClient(onboarding, "approved",
          "Seu onboarding foi aprovado! Estamos preparando seus materiais de email.")
        break
      }

      case "design": {
        // Notify designers
        await notificationService.notifyByRole(["designer"], {
          title: `Novo onboarding para design: ${onboarding.client?.company || onboarding.client?.name}`,
          body: `Copies prontas. Iniciar design para ${onboarding.store?.store_name}`,
          type: "info",
          link: `/onboarding?highlight=${onboarding.id}`,
        })

        await this.notifyClient(onboarding, "design_started",
          "Nosso time de design está trabalhando nos materiais visuais da sua loja.")
        break
      }

      case "implementation": {
        // Notify developers
        await notificationService.notifyByRole(["developer"], {
          title: `Novo onboarding para implementação: ${onboarding.client?.company || onboarding.client?.name}`,
          body: `Design finalizado. Implementar para ${onboarding.store?.store_name}`,
          type: "info",
          link: `/onboarding?highlight=${onboarding.id}`,
        })

        await this.notifyClient(onboarding, "implementation_started",
          "Estamos implementando tudo na sua loja. Falta pouco para ficar pronto!")
        break
      }

      case "completed": {
        // Update client status to active
        await adminClient
          .from("clients")
          .update({ status: "active" })
          .eq("id", onboarding.client_id)

        await this.notifyClient(onboarding, "completed",
          "Seu onboarding foi concluído com sucesso! Sua loja está pronta para operar.")

        // Notify COO + Admin
        await notificationService.notifyByRole(["coo", "admin"], {
          title: `Onboarding concluído: ${onboarding.client?.company || onboarding.client?.name}`,
          body: `Onboarding finalizado para ${onboarding.store?.store_name}. Cliente agora ativo.`,
          type: "success",
          link: `/clients/${onboarding.client_id}`,
        })
        break
      }

      case "cancelled": {
        await this.notifyClient(onboarding, "cancelled",
          "Seu processo de onboarding foi cancelado. Entre em contato conosco para mais informações.")
        break
      }
    }
  }

  /**
   * Notify users with onboarding_approve feature
   */
  private async notifyApprovers(onboarding: ClientOnboarding): Promise<void> {
    const adminClient = createAdminClient()

    // Get org members with the onboarding_approve feature
    const { data: approvers } = await adminClient
      .from("org_member_features")
      .select(`
        org_member:org_members(
          id,
          profile_id
        )
      `)
      .eq("feature_key", "onboarding_approve")
      .eq("enabled", true)

    if (!approvers?.length) {
      // Fallback: notify owners, managers, and COOs
      await notificationService.notifyByRole(["owner", "manager", "coo"], {
        title: `Novo formulário de onboarding para aprovação`,
        body: `${onboarding.client?.name} (${onboarding.store?.store_name}) aguarda aprovação`,
        type: "warning",
        link: `/onboarding?tab=approvals`,
      })
      return
    }

    const profileIds = approvers
      .map((a) => (a.org_member as { profile_id?: string })?.profile_id)
      .filter(Boolean) as string[]

    if (profileIds.length > 0) {
      await notificationService.createBulk(profileIds, {
        title: `Novo formulário de onboarding para aprovação`,
        body: `${onboarding.client?.name} (${onboarding.store?.store_name}) aguarda sua aprovação`,
        type: "warning",
        link: `/onboarding?tab=approvals`,
      })
    }
  }

  /**
   * Notify the client via portal notification + email (N8N)
   */
  private async notifyClient(
    onboarding: ClientOnboarding,
    event: string,
    message: string
  ): Promise<void> {
    const adminClient = createAdminClient()

    // 1. Get portal user for this client
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("id, auth_user_id, email, name")
      .eq("client_id", onboarding.client_id)
      .eq("is_active", true)
      .limit(1)
      .single()

    // 2. Create portal notification if portal user exists
    if (portalUser?.auth_user_id) {
      await notificationService.create({
        user_id: portalUser.auth_user_id,
        title: "Atualização do Onboarding",
        body: message,
        type: "info",
        link: "/portal/onboarding",
        metadata: { event, onboarding_id: onboarding.id },
      })
    }

    // 3. Send email via N8N
    const email = portalUser?.email || onboarding.client?.email
    const name = portalUser?.name || onboarding.client?.name

    if (email && name) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      await n8nTriggerService.triggerClientNotification({
        email,
        client_name: name,
        phase: event,
        phase_label: PHASE_LABELS[event] || event,
        message,
        portal_url: `${appUrl}/portal/onboarding`,
      })
    }

    // 4. Update last notification timestamp
    await adminClient
      .from("client_onboardings")
      .update({ client_notified_at: new Date().toISOString() })
      .eq("id", onboarding.id)
  }
}

export const onboardingPhaseService = new OnboardingPhaseService()
