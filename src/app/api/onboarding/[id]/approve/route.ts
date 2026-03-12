import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { onboardingPhaseService } from "@/lib/services/onboarding-phase.service"
import { portalAccountService } from "@/lib/services/portal-account.service"
import { n8nTriggerService } from "@/lib/services/n8n-trigger.service"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingApproval")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// POST - Approve, reject, or request revision for an onboarding
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()

    if (!body.action || !["approved", "rejected", "revision_requested"].includes(body.action)) {
      throw new AppError("action deve ser: approved, rejected ou revision_requested", 400)
    }

    // AC 37.1.1: Comments obrigatório para rejected/revision_requested
    if (body.action === "rejected" || body.action === "revision_requested") {
      if (!body.comments || typeof body.comments !== "string" || !body.comments.trim()) {
        throw new AppError("Comentários são obrigatórios para rejeição ou solicitação de revisão", 400)
      }
    }

    // AC 37.1.3: Limite de 2000 caracteres
    if (body.comments && typeof body.comments === "string" && body.comments.length > 2000) {
      throw new AppError("Comentários não podem exceder 2000 caracteres", 400)
    }

    const adminClient = createAdminClient()

    // Check permission: user must have onboarding_approve feature
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id, role, profile_id, org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      throw new AppError("Membro da organização não encontrado", 403)
    }

    // Check for onboarding_approve feature
    const { data: feature } = await adminClient
      .from("org_member_features")
      .select("id")
      .eq("org_member_id", orgMember.id)
      .eq("feature_key", "onboarding_approve")
      .eq("enabled", true)
      .maybeSingle()

    // Allow owners/managers even without explicit feature
    const hasPermission = !!feature || ["owner", "manager", "coo"].includes(orgMember.role)

    if (!hasPermission) {
      throw new AppError("Você não tem permissão para aprovar onboardings", 403)
    }

    // Verify onboarding is in pending_approval
    const { data: onboarding } = await adminClient
      .from("client_onboardings")
      .select("id, current_phase, status, client_id, store_id")
      .eq("id", id)
      .single()

    if (!onboarding) {
      throw new AppError("Onboarding não encontrado", 404)
    }

    // Verify onboarding belongs to the same org as the authenticated user
    if (onboarding.store_id) {
      const { data: store } = await adminClient
        .from("client_stores")
        .select("org_id")
        .eq("id", onboarding.store_id)
        .single()

      if (store?.org_id && store.org_id !== orgMember.org_id) {
        throw new AppError("Você não tem permissão para este onboarding", 403)
      }
    }

    if (onboarding.current_phase !== "pending_approval" && onboarding.status !== "pending_approval") {
      throw new AppError(
        `Onboarding não está aguardando aprovação (fase atual: ${onboarding.current_phase || onboarding.status})`,
        400
      )
    }

    // Get form data snapshot for audit
    const { data: formData } = await adminClient
      .from("store_onboarding_data")
      .select("*")
      .eq("store_id", onboarding.store_id)
      .maybeSingle()

    // Log the approval action (skip for rejected/revision — records will be deleted)
    if (body.action === "approved") {
      await adminClient.from("onboarding_approvals").insert({
        onboarding_id: id,
        approved_by: orgMember.id,
        action: body.action,
        comments: body.comments || null,
        form_snapshot: formData || null,
      })
    }

    if (body.action === "approved") {
      // Transition to generating_copies
      const result = await onboardingPhaseService.transition({
        onboardingId: id,
        toPhase: "generating_copies",
        triggeredBy: "coo_approval",
        triggeredByUserId: orgMember.id,
        metadata: { comments: body.comments },
      })

      if (!result.success) {
        throw new AppError(result.error || "Erro ao aprovar onboarding", 500)
      }

      // Create portal account for the client (sends invite email)
      const { data: clientData } = await adminClient
        .from("clients")
        .select("id, name, email")
        .eq("id", onboarding.client_id)
        .single()

      if (clientData?.email) {
        // Idempotency: check if portal user already exists
        const { data: existingPortalUser } = await adminClient
          .from("client_portal_users")
          .select("id")
          .eq("client_id", clientData.id)
          .maybeSingle()

        if (!existingPortalUser) {
          try {
            await portalAccountService.createPortalAccount({
              clientId: clientData.id,
              email: clientData.email,
              name: clientData.name,
            })
            log.info(`Portal account created for client ${clientData.id}`)
          } catch (portalError) {
            // Non-blocking: approval continues even if portal account creation fails
            log.error("Failed to create portal account on approval (non-blocking)", portalError)
          }
        }
      }

      // Create copy_pipeline entry (Story 3.5.5)
      // Get org_id from org_member
      const { data: memberOrg } = await adminClient
        .from("org_members")
        .select("org_id")
        .eq("id", orgMember.id)
        .single()

      if (memberOrg) {
        // Get briefing if exists
        const { data: briefing } = await adminClient
          .from("client_briefings")
          .select("id")
          .eq("client_id", onboarding.client_id)
          .maybeSingle()

        await adminClient.from("copy_pipeline").insert({
          org_id: memberOrg.org_id,
          client_id: onboarding.client_id,
          store_id: onboarding.store_id,
          onboarding_id: id,
          briefing_id: briefing?.id || null,
          status: "approved",
          approved_by: orgMember.id,
          approved_at: new Date().toISOString(),
        })

        log.info(`Copy pipeline created for onboarding ${id}`)
      }

      log.info(`Onboarding ${id} approved`, { approvedBy: orgMember.id })

      return successResponse(request, {
        onboarding: result.onboarding,
        message: "Onboarding aprovado! Geração de copies iniciada.",
      })
    }

    if (body.action === "rejected" || body.action === "revision_requested") {
      // Both rejected and revision_requested delete all data so the client
      // can re-submit via the public form. The client has no portal account
      // at this stage, so keeping data would leave them stuck.
      const isRejected = body.action === "rejected"
      const phaseLabel = isRejected ? "Cadastro Rejeitado" : "Revisão Solicitada"

      // Fetch client + store info BEFORE deleting (needed for notification + audit)
      const { data: client } = await adminClient
        .from("clients")
        .select("email, name")
        .eq("id", onboarding.client_id)
        .single()

      const { data: storeData } = await adminClient
        .from("client_stores")
        .select("store_name")
        .eq("id", onboarding.store_id)
        .maybeSingle()

      // Persist audit trail in dedicated table (survives data deletion)
      await adminClient.from("onboarding_rejection_log").insert({
        org_id: orgMember.org_id,
        onboarding_id: id,
        client_email: client?.email || "unknown",
        client_name: client?.name || null,
        store_name: storeData?.store_name || null,
        rejected_by: orgMember.id,
        comments: body.comments || null,
        form_snapshot: formData || null,
      })

      // Also log to application logs for operational visibility
      log.info(`Onboarding ${id} ${body.action} — data will be deleted`, {
        by: orgMember.id,
        clientId: onboarding.client_id,
        storeId: onboarding.store_id,
        clientEmail: client?.email,
        comments: body.comments,
      })

      // Atomic deletion via RPC FIRST (single transaction, validates phase + IDs)
      const { error: rpcError } = await adminClient.rpc("delete_rejected_onboarding", {
        p_onboarding_id: id,
        p_client_id: onboarding.client_id,
        p_store_id: onboarding.store_id,
      })

      if (rpcError) {
        log.error("Failed to delete onboarding data", rpcError)
        throw new AppError("Erro ao remover dados do onboarding", 500)
      }

      // Notify client AFTER successful deletion (non-blocking)
      try {
        if (client) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          const resubmitUrl = `${appUrl}/cliente/onboarding`

          // AC 37.2.1: Sanitizar HTML dos comments
          const sanitizedComments = (body.comments || "").replace(/<[^>]*>/g, "")

          // AC 37.2.4: Subject diferenciado por acao
          const subject = isRejected
            ? "Seu formulário precisa de ajustes"
            : "Revisão solicitada no seu cadastro"

          await n8nTriggerService.triggerClientNotification({
            email: client.email,
            client_name: client.name,
            phase: body.action,
            phase_label: phaseLabel,
            message: sanitizedComments || "Por favor, preencha o formulário novamente com os ajustes necessários.",
            portal_url: resubmitUrl,
            // AC 37.2.2: Campos enriquecidos
            action_type: body.action,
            store_name: storeData?.store_name || undefined,
            rejection_comments: sanitizedComments || undefined,
            resubmit_url: resubmitUrl,
            subject,
          })
        }
      } catch (notifyError) {
        log.error("Failed to notify client (non-blocking)", notifyError)
      }

      const message = isRejected
        ? "Onboarding rejeitado. Dados removidos e cliente notificado para preencher novamente."
        : "Revisão solicitada. Dados removidos e cliente notificado para preencher novamente."

      return successResponse(request, { message })
    }

    throw new AppError("Ação não reconhecida", 400)
  } catch (error) {
    return errorResponse(request, error, "OnboardingApproval")
  }
}
