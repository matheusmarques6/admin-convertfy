import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// Default password for first access
const DEFAULT_PASSWORD = "Convertfy@2024"

// POST - Create a new portal user
export async function POST(request: NextRequest) {
  try {
    // Verify the requesting user is authenticated and authorized
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user has permission (admin, manager, or cs)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 403 }
      )
    }

    if (!["admin", "manager", "cs"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Access denied. You don't have permission to create portal users." },
        { status: 403 }
      )
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
      return NextResponse.json(
        { error: "client_id, email, and name are required" },
        { status: 400 }
      )
    }

    // Verify the client exists
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .single()

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      )
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

    // Check if email already exists in auth.users
    const { data: existingAuthUsers } = await adminClient.auth.admin.listUsers()
    const existingAuthUser = existingAuthUsers?.users?.find(u => u.email === email)

    let authUserId: string

    if (existingAuthUser) {
      // User already exists in auth, just use their ID
      authUserId = existingAuthUser.id
    } else {
      // Create new auth user with default password
      const { data: newAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          name,
          is_portal_user: true,
          client_id,
        },
      })

      if (createAuthError || !newAuthUser.user) {
        console.error("Error creating auth user:", createAuthError)
        return NextResponse.json(
          { error: "Failed to create auth user: " + (createAuthError?.message || "Unknown error") },
          { status: 500 }
        )
      }

      authUserId = newAuthUser.user.id
    }

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
      console.error("Error creating portal user:", portalError)
      // If we created a new auth user, we should delete it
      if (!existingAuthUser) {
        await adminClient.auth.admin.deleteUser(authUserId)
      }
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
      message: `Portal user created successfully. Default password: ${DEFAULT_PASSWORD}`,
      default_password: DEFAULT_PASSWORD,
    })
  } catch (error) {
    console.error("Error in POST /api/portal-users:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// GET - List portal users for a client
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get client_id from query params
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get("client_id")

    if (!clientId) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400 }
      )
    }

    const { data: portalUsers, error } = await supabase
      .from("client_portal_users")
      .select("*")
      .eq("client_id", clientId)
      .order("is_primary_contact", { ascending: false })
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch portal users" },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: portalUsers })
  } catch (error) {
    console.error("Error in GET /api/portal-users:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE - Delete a portal user
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user has permission
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "cs"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const portalUserId = searchParams.get("id")

    if (!portalUserId) {
      return NextResponse.json(
        { error: "Portal user ID is required" },
        { status: 400 }
      )
    }

    // Get portal user info before deleting
    const adminClient = createAdminClient()
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("*")
      .eq("id", portalUserId)
      .single()

    if (!portalUser) {
      return NextResponse.json(
        { error: "Portal user not found" },
        { status: 404 }
      )
    }

    // Delete portal user record (auth user remains for potential other uses)
    const { error: deleteError } = await adminClient
      .from("client_portal_users")
      .delete()
      .eq("id", portalUserId)

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete portal user" },
        { status: 500 }
      )
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
    console.error("Error in DELETE /api/portal-users:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// PATCH - Update a portal user
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user has permission
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "cs"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: "Portal user ID is required" },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    const { data: updatedUser, error: updateError } = await adminClient
      .from("client_portal_users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update portal user" },
        { status: 500 }
      )
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
    console.error("Error in PATCH /api/portal-users:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
