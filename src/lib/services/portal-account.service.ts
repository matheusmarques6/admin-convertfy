import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("PortalAccount")

export class PortalAccountService {
  /**
   * Create a portal account for a new client after form submission.
   * Uses Supabase inviteUserByEmail() to send an invite link automatically.
   * The user clicks the link, gets redirected to /portal/auth/callback,
   * and then sets their password on /portal/change-password.
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
    const redirectTo = `${appUrl}/portal/auth/callback`

    // 1. Create Supabase Auth user via invite (sends email automatically)
    const { data: authData, error: authError } = await adminClient.auth.admin.inviteUserByEmail(
      params.email,
      {
        redirectTo,
        data: {
          name: params.name,
          is_portal_user: true,
        },
      }
    )

    if (authError || !authData.user) {
      log.error("Failed to invite user", authError)
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
      })
      .select("id")
      .single()

    if (portalError || !portalUser) {
      // Rollback: delete auth user if portal user creation fails
      log.error("Failed to create portal user, rolling back auth user", portalError)
      await adminClient.auth.admin.deleteUser(userId)
      throw new Error("Erro ao criar usuário do portal")
    }

    log.info("Portal account created via invite", {
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
