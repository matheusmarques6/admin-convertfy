import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { ClientPortalUserFormData } from "@/types"
import { generateTempPassword } from "@/lib/utils/generate-password"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List all portal users
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")

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
      console.error("[Portal Users] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar usuários" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    return NextResponse.json({ portalUsers: portalUsers || [] }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    console.error("[Portal Users] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// POST - Create new portal user
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body: ClientPortalUserFormData = await request.json()

    if (!body.client_id || !body.email || !body.name) {
      return NextResponse.json(
        { error: "Campos obrigatórios: client_id, email, name" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("email", body.email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: "Este email já está cadastrado" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Generate temporary password
    const tempPassword = generateTempPassword()

    // Use admin client for auth operations (requires service role key)
    const adminClient = createAdminClient()

    // Create auth user in Supabase
    const { data: authUser, error: signUpError } = await adminClient.auth.admin.createUser({
      email: body.email.toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: body.name,
        is_portal_user: true,
        client_id: body.client_id,
      },
    })

    if (signUpError) {
      console.error("[Portal Users] Auth error:", signUpError)
      return NextResponse.json(
        { error: "Erro ao criar conta: " + signUpError.message },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

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
        auth_user_id: authUser.user.id,
        email: body.email.toLowerCase(),
        name: body.name,
        phone: body.phone || null,
        is_primary: body.is_primary || false,
        is_active: true, // Ensure user is active
        permissions: defaultPermissions,
        invited_by: user.id,
        email_verified_at: new Date().toISOString(),
        must_change_password: true, // Require password change on first login
      })
      .select(`
        *,
        client:clients(id, name, company)
      `)
      .single()

    if (insertError) {
      console.error("[Portal Users] Insert error:", insertError)
      // Try to delete auth user if portal user creation fails
      await adminClient.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json(
        { error: "Erro ao criar usuário do portal" },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Return user with temporary password (only shown once)
    return NextResponse.json(
      {
        portalUser,
        tempPassword,
        message: "Usuário criado com sucesso. Anote a senha temporária!",
      },
      { status: 201, headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    console.error("[Portal Users] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

