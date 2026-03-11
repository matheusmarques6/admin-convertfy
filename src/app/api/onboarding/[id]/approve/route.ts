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

    // Log the approval action
    await adminClient.from("onboarding_approvals").insert({
      onboarding_id: id,
      approved_by: orgMember.id,
      action: body.action,
      comments: body.comments || null,
      form_snapshot: formData || null,
    })

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
      // Keep in pending_approval but log the rejection
      // The client will be notified to make adjustments
      const { data: updatedOnboarding } = await adminClient
        .from("client_onboardings")
        .update({
          notes: body.comments ? `Revisão solicitada: ${body.comments}` : "Revisão solicitada",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single()

      // Notify client about rejection
      const { data: client } = await adminClient
        .from("clients")
        .select("email, name")
        .eq("id", onboarding.client_id)
        .single()

      if (client) {
        // Try in-app notification if portal user exists
        const { notificationService } = await import("@/lib/services/notification.service")
        const { data: portalUser } = await adminClient
          .from("client_portal_users")
          .select("auth_user_id")
          .eq("client_id", onboarding.client_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()

        if (portalUser?.auth_user_id) {
          await notificationService.create({
            user_id: portalUser.auth_user_id,
            title: body.action === "rejected" ? "Cadastro precisa de ajustes" : "Revisão solicitada",
            body: body.comments || "Por favor, revise seu cadastro e faça os ajustes necessários.",
            type: "warning",
            link: "/client/onboarding",
          })
        }

        // Always send email via N8N (works even without portal account)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        await n8nTriggerService.triggerClientNotification({
          email: client.email,
          client_name: client.name,
          phase: body.action === "rejected" ? "rejected" : "revision_requested",
          phase_label: body.action === "rejected" ? "Cadastro Rejeitado" : "Revisão Solicitada",
          message: body.comments || "Por favor, revise seu cadastro e faça os ajustes necessários.",
          portal_url: `${appUrl}/portal/onboarding`,
        })
      }

      const actionLabel = body.action === "rejected" ? "rejeitado" : "revisão solicitada"
      log.info(`Onboarding ${id} ${actionLabel}`, { by: orgMember.id })

      return successResponse(request, {
        onboarding: updatedOnboarding,
        message: body.action === "rejected"
          ? "Onboarding rejeitado. Cliente será notificado."
          : "Revisão solicitada. Cliente será notificado.",
      })
    }

    throw new AppError("Ação não reconhecida", 400)
  } catch (error) {
    return errorResponse(request, error, "OnboardingApproval")
  }
}
