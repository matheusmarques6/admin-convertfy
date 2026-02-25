import { createAdminClient } from "@/lib/supabase/server"
import { n8nTriggerService } from "@/lib/services/n8n-trigger.service"
import { logger } from "@/lib/logger"

const log = logger.child("PortalAccount")

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  const specials = "!@#$%"
  let password = ""
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  // Add a special character and a digit for strength
  password += specials.charAt(Math.floor(Math.random() * specials.length))
  password += Math.floor(Math.random() * 10)
  return password
}

export class PortalAccountService {
  /**
   * Create a portal account for a new client after form submission
   */
  async createPortalAccount(params: {
    clientId: string
    email: string
    name: string
    password?: string
  }): Promise<{
    userId: string
    portalUserId: string
    tempPassword?: string
    mustChangePassword: boolean
  }> {
    const adminClient = createAdminClient()
    const useTempPassword = !params.password
    const password = params.password || generateTempPassword()

    // 1. Create Supabase Auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: params.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: params.name,
        is_portal_user: true,
      },
    })

    if (authError || !authData.user) {
      log.error("Failed to create auth user", authError)
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
        must_change_password: useTempPassword,
      })
      .select("id")
      .single()

    if (portalError || !portalUser) {
      // Rollback: delete auth user if portal user creation fails
      log.error("Failed to create portal user, rolling back auth user", portalError)
      await adminClient.auth.admin.deleteUser(userId)
      throw new Error("Erro ao criar usuário do portal")
    }

    log.info("Portal account created", {
      userId,
      portalUserId: portalUser.id,
      clientId: params.clientId,
    })

    return {
      userId,
      portalUserId: portalUser.id,
      tempPassword: useTempPassword ? password : undefined,
      mustChangePassword: useTempPassword,
    }
  }

  /**
   * Send welcome email with credentials via N8N
   */
  async sendWelcomeEmail(params: {
    email: string
    name: string
    tempPassword?: string
  }): Promise<void> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const loginUrl = `${appUrl}/portal/login`

    await n8nTriggerService.triggerWelcomeEmail({
      email: params.email,
      name: params.name,
      temp_password: params.tempPassword,
      login_url: loginUrl,
    })
  }
}

export const portalAccountService = new PortalAccountService()
