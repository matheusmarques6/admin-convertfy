import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("PortalUsers")

// POST - Create a new portal user
export async function POST(request: NextRequest) {
  try {
    // Verify the requesting user is authenticated and authorized
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user has permission (admin, manager, or cs)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      throw new AppError("Profile not found", 403)
    }

    if (!["admin", "manager", "coo", "cs"].includes(profile.role)) {
      throw new AppError("Access denied. You don't have permission to create portal users.", 403)
    }

    // Parse request body
    const body = await request.json()
    const {
      client_id,
      email,
      name,
      phone,
      is_primary_contact = false,
      permissions = {
        view_reports: true,
        view_invoices: true,
        view_campaigns: true,
        edit_profile: true,
      },
    } = body

    // Validate required fields
    if (!client_id || !email || !name) {
      throw new AppError("client_id, email, and name are required", 400)
    }

    // Verify the client exists
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .single()

    if (clientError || !client) {
      throw new AppError("Client not found", 404)
    }

    // Use admin client to create auth user
    const adminClient = createAdminClient()

    // Check if email already exists as a portal user for this client
    const { data: existingPortalUser } = await adminClient
      .from("client_portal_users")
      .select("id")
      .eq("client_id", client_id)
      .eq("email", email)
      .single()

    if (existingPortalUser) {
      return NextResponse.json(
        { error: "A portal user with this email already exists for this client" },
        { status: 409 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const redirectTo = `${appUrl}/portal/auth/callback`

    // Check if email already exists in auth.users - delete and re-invite to send email
    const { data: existingAuthUsers } = await adminClient.auth.admin.listUsers()
    const existingAuthUser = existingAuthUsers?.users?.find(u => u.email === email)

    if (existingAuthUser) {
      log.info("Auth user already exists, deleting to re-invite", { email })
      await adminClient.auth.admin.deleteUser(existingAuthUser.id)
    }

    // Create auth user via invite (sends email automatically)
    const { data: newAuthUser, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          name,
          is_portal_user: true,
          client_id,
        },
      }
    )

    if (inviteError || !newAuthUser.user) {
      log.error("Error inviting user:", inviteError)
      return NextResponse.json(
        { error: "Failed to invite user: " + (inviteError?.message || "Unknown error") },
        { status: 500 }
      )
    }

    const authUserId = newAuthUser.user.id

    // Create portal user record
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .insert({
        client_id,
        auth_user_id: authUserId,
        email,
        name,
        phone,
        is_primary_contact,
        must_change_password: true,
        permissions,
        is_active: true,
      })
      .select()
      .single()

    if (portalError) {
      log.error("Error creating portal user:", portalError)
      await adminClient.auth.admin.deleteUser(authUserId)
      return NextResponse.json(
        { error: "Failed to create portal user: " + portalError.message },
        { status: 500 }
      )
    }

    // Create activity log
    await supabase.from("activities").insert({
      client_id,
      user_id: user.id,
      type: "portal_user_created",
      description: `Usuário do portal "${name}" (${email}) foi criado`,
      metadata: {
        portal_user_id: portalUser.id,
        portal_user_email: email,
        portal_user_name: name,
      },
    })

    return NextResponse.json({
      success: true,
      data: portalUser,
      message: "Portal user created. Invite email sent.",
    })
  } catch (error) {
    return errorResponse(request, error, "PortalUsers")
  }
}

// GET - List portal users for a client
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    // Get client_id from query params
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get("client_id")

    if (!clientId) {
      throw new AppError("client_id is required", 400)
    }

    const { data: portalUsers, error } = await supabase
      .from("client_portal_users")
      .select("*")
      .eq("client_id", clientId)
      .order("is_primary_contact", { ascending: false })
      .order("created_at", { ascending: true })

    if (error) {
      throw new AppError("Failed to fetch portal users", 500)
    }

    return NextResponse.json({ data: portalUsers })
  } catch (error) {
    return errorResponse(request, error, "PortalUsers")
  }
}

// DELETE - Delete a portal user
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user has permission
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "coo", "cs"].includes(profile.role)) {
      throw new AppError("Access denied", 403)
    }

    const { searchParams } = new URL(request.url)
    const portalUserId = searchParams.get("id")

    if (!portalUserId) {
      throw new AppError("Portal user ID is required", 400)
    }

    // Get portal user info before deleting
    const adminClient = createAdminClient()
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("*")
      .eq("id", portalUserId)
      .single()

    if (!portalUser) {
      throw new AppError("Portal user not found", 404)
    }

    // Delete portal user record (auth user remains for potential other uses)
    const { error: deleteError } = await adminClient
      .from("client_portal_users")
      .delete()
      .eq("id", portalUserId)

    if (deleteError) {
      throw new AppError("Failed to delete portal user", 500)
    }

    // Create activity log
    await supabase.from("activities").insert({
      client_id: portalUser.client_id,
      user_id: user.id,
      type: "portal_user_deleted",
      description: `Usuário do portal "${portalUser.name}" (${portalUser.email}) foi removido`,
      metadata: {
        portal_user_id: portalUser.id,
        portal_user_email: portalUser.email,
        portal_user_name: portalUser.name,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(request, error, "PortalUsers")
  }
}

// PATCH - Update a portal user
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user has permission
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "coo", "cs"].includes(profile.role)) {
      throw new AppError("Access denied", 403)
    }

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      throw new AppError("Portal user ID is required", 400)
    }

    const adminClient = createAdminClient()

    const { data: updatedUser, error: updateError } = await adminClient
      .from("client_portal_users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      throw new AppError("Failed to update portal user", 500)
    }

    // Create activity log
    await supabase.from("activities").insert({
      client_id: updatedUser.client_id,
      user_id: user.id,
      type: "portal_user_updated",
      description: `Usuário do portal "${updatedUser.name}" foi atualizado`,
      metadata: {
        portal_user_id: updatedUser.id,
        updated_fields: Object.keys(updateData),
      },
    })

    return NextResponse.json({ success: true, data: updatedUser })
  } catch (error) {
    return errorResponse(request, error, "PortalUsers")
  }
}
