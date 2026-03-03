import { NextRequest } from "next/server"
import crypto from "crypto"
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
import { emailService } from "@/lib/email/email.service"
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

    // Check if user is admin/manager
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "coo"].includes(profile.role)) {
      throw new AppError("Acesso negado", 403)
    }

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

    // Delete any existing auth user with this email using SQL function (reliable, no pagination)
    const { error: rpcError } = await adminClient.rpc("delete_auth_user_by_email", {
      target_email: body.email,
    })
    if (rpcError) {
      log.warn("RPC delete_auth_user_by_email failed", { error: rpcError.message })
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(6).toString("base64url")

    // Create auth user with temp password (email pre-confirmed)
    const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
      email: body.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: body.name,
        is_portal_user: true,
        client_id: body.client_id,
      },
    })

    if (createError || !authUser?.user) {
      log.error("Create user failed", { error: createError?.message })
      throw new AppError("Erro ao criar conta: " + (createError?.message || "Erro desconhecido"), 500)
    }

    const authUserId = authUser.user.id

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

    // Send welcome email via Resend with portal login link
    try {
      await emailService.sendWelcomeWithPassword({
        to: body.email,
        name: body.name,
        email: body.email,
        tempPassword,
        loginUrl: `${appUrl}/portal/login`,
      })
    } catch (emailErr) {
      log.warn("Failed to send welcome email, user created anyway", {
        error: (emailErr as Error).message,
      })
    }

    return successResponse(request, {
      portalUser,
    }, { status: 201, message: "Usuário criado e convite enviado por email!" })
  } catch (error) {
    return errorResponse(request, error, "PortalUsers POST")
  }
}
