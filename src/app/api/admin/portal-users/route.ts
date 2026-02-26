import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  ConflictError,
  AppError,
} from "@/lib/api/errors"
import { portalUserCreateSchema } from "@/lib/schemas/common"
import { logger } from "@/lib/logger"

const log = logger.child("PortalUsers")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List all portal users
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const clientId = request.nextUrl.searchParams.get("client_id")

    let query = supabase
      .from("client_portal_users")
      .select(`
        *,
        client:clients(id, name, company, email)
      `)
      .order("created_at", { ascending: false })

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    const { data: portalUsers, error } = await query

    if (error) {
      log.error("Error fetching portal users", { error: error.message })
      throw error
    }

    return successResponse(request, { portalUsers: portalUsers || [] })
  } catch (error) {
    return errorResponse(request, error, "PortalUsers GET")
  }
}

// POST - Create new portal user
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await parseAndValidate(request, portalUserCreateSchema)

    // Check if email already exists
    const { data: existing } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("email", body.email)
      .single()

    if (existing) {
      throw new ConflictError("Este email já está cadastrado")
    }

    const adminClient = createAdminClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const redirectTo = `${appUrl}/portal/auth/callback`

    // Helper: delete all auth users with this email (paginated search)
    async function deleteAuthUsersByEmail(email: string) {
      let page = 1
      const perPage = 50
      while (true) {
        const { data: usersPage } = await adminClient.auth.admin.listUsers({ page, perPage })
        if (!usersPage?.users?.length) break
        for (const u of usersPage.users) {
          if (u.email === email) {
            log.info("Deleting existing auth user", { email, authId: u.id })
            await adminClient.auth.admin.deleteUser(u.id)
          }
        }
        if (usersPage.users.length < perPage) break
        page++
      }
    }

    // Delete any existing auth users with this email
    await deleteAuthUsersByEmail(body.email)

    // Create auth user via invite (sends email automatically)
    let { data: authUser, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      body.email,
      {
        redirectTo,
        data: {
          name: body.name,
          is_portal_user: true,
          client_id: body.client_id,
        },
      }
    )

    // Retry once if still fails
    if (inviteError?.message?.includes("already been registered")) {
      log.warn("Invite failed after delete, retrying...", { email: body.email })
      await new Promise(r => setTimeout(r, 1000))
      await deleteAuthUsersByEmail(body.email)
      const retry = await adminClient.auth.admin.inviteUserByEmail(
        body.email,
        {
          redirectTo,
          data: { name: body.name, is_portal_user: true, client_id: body.client_id },
        }
      )
      authUser = retry.data
      inviteError = retry.error
    }

    if (inviteError) {
      log.error("Invite user failed", { error: inviteError.message })
      throw new AppError("Erro ao criar conta: " + inviteError.message, 500)
    }

    const authUserId = authUser!.user!.id

    // Create portal user record
    const defaultPermissions = {
      view_reports: true,
      view_invoices: true,
      view_campaigns: true,
      edit_profile: true,
      manage_stores: false,
      ...body.permissions,
    }

    const { data: portalUser, error: insertError } = await adminClient
      .from("client_portal_users")
      .insert({
        client_id: body.client_id,
        auth_user_id: authUserId,
        email: body.email,
        name: body.name,
        phone: body.phone || null,
        is_primary: body.is_primary,
        is_active: true,
        permissions: defaultPermissions,
        invited_by: user.id,
        email_verified_at: new Date().toISOString(),
        must_change_password: true,
      })
      .select(`
        *,
        client:clients(id, name, company)
      `)
      .single()

    if (insertError) {
      log.error("Portal user insert failed, rolling back auth user", { error: insertError.message })
      await adminClient.auth.admin.deleteUser(authUserId)
      throw new AppError("Erro ao criar usuário do portal", 500)
    }

    return successResponse(request, {
      portalUser,
    }, { status: 201, message: "Usuário criado e convite enviado por email!" })
  } catch (error) {
    return errorResponse(request, error, "PortalUsers POST")
  }
}
