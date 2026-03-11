import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email/email.service"
import { logger } from "@/lib/logger"

const log = logger.child("PortalAccount")

export class PortalAccountService {
  /**
   * Create a portal account for a new client after form submission.
   * Creates auth user with temp password and sends welcome email via Resend.
   * The user logs in at /client/login and is prompted to change password.
   */
  async createPortalAccount(params: {
    clientId: string
    email: string
    name: string
  }): Promise<{
    userId: string
    portalUserId: string
  }> {
    const adminClient = createAdminClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // 1. Generate temp password and create Supabase Auth user
    const tempPassword = crypto.randomBytes(6).toString("base64url")

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: params.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: params.name,
        is_portal_user: true,
      },
    })

    if (authError || !authData.user) {
      log.error("Failed to create user", authError)
      throw new Error(`Erro ao criar conta: ${authError?.message || "Erro desconhecido"}`)
    }

    const userId = authData.user.id

    // 2. Create client_portal_users record
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .insert({
        auth_user_id: userId,
        client_id: params.clientId,
        name: params.name,
        email: params.email,
        role: "owner",
        is_active: true,
        must_change_password: true,
        email_verified_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (portalError || !portalUser) {
      log.error("Failed to create portal user, rolling back auth user", portalError)
      await adminClient.auth.admin.deleteUser(userId)
      throw new Error("Erro ao criar usuário do portal")
    }

    // 3. Send welcome email via Resend with portal login link
    try {
      await emailService.sendWelcomeWithPassword({
        to: params.email,
        name: params.name,
        email: params.email,
        tempPassword,
        loginUrl: `${appUrl}/client/login`,
      })
    } catch (emailErr) {
      log.warn("Failed to send welcome email, account created anyway", {
        error: (emailErr as Error).message,
      })
    }

    log.info("Portal account created", {
      userId,
      portalUserId: portalUser.id,
      clientId: params.clientId,
    })

    return {
      userId,
      portalUserId: portalUser.id,
    }
  }
}

export const portalAccountService = new PortalAccountService()
