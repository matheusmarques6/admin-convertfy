import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { OrgMemberFormData } from "@/types"
import { generateTempPassword } from "@/lib/utils/generate-password"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminOrgMembers")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List org members
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Check if user is system admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isSystemAdmin = profile?.role === "admin"

    // Get organizations where user is a member (for read access)
    const { data: userOrgMemberships } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("profile_id", user.id)

    const memberOrgIds = userOrgMemberships?.map((m) => m.org_id) || []

    // If not system admin and not member of any org, deny access
    if (!isSystemAdmin && memberOrgIds.length === 0) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders(request.headers.get("origin")) })
    }

    const searchParams = request.nextUrl.searchParams
    const orgId = searchParams.get("org_id")
    const role = searchParams.get("role")
    const isActive = searchParams.get("is_active")

    // If filtering by org_id, check permission for that specific org (any member can read)
    if (orgId && !isSystemAdmin && !memberOrgIds.includes(orgId)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders(request.headers.get("origin")) })
    }

    let query = supabase
      .from("org_members")
      .select(`
        *,
        organization:organizations(id, name, slug),
        profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url, role)
      `)
      .order("created_at", { ascending: false })

    // System admin can see all, org members can only see their own orgs
    if (!isSystemAdmin) {
      query = query.in("org_id", memberOrgIds)
    }

    if (orgId) {
      query = query.eq("org_id", orgId)
    }

    if (role) {
      query = query.eq("role", role)
    }

    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true")
    }

    const { data: members, error } = await query

    if (error) {
      log.error("[Org Members] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar membros" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // For each member, get their features and store access count
    const membersWithDetails = await Promise.all(
      (members || []).map(async (member) => {
        const [featuresRes, accessRes] = await Promise.all([
          supabase
            .from("org_member_features")
            .select("feature_key, enabled")
            .eq("org_member_id", member.id)
            .eq("enabled", true),
          supabase
            .from("agent_store_access")
            .select("id")
            .eq("org_member_id", member.id)
            .eq("can_view", true),
        ])

        return {
          ...member,
          enabled_features: featuresRes.data?.map((f) => f.feature_key) || [],
          store_access_count: accessRes.data?.length || 0,
        }
      })
    )

    return NextResponse.json({ members: membersWithDetails }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Org Members] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}

// POST - Create new org member (invite)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    log.debug("[Org Members POST] Auth check:", { userId: user?.id, authError })

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body: OrgMemberFormData = await request.json()
    log.debug("[Org Members POST] Body received:", { org_id: body.org_id, role: body.role, email: body.email })

    // Check if user has permission: system admin OR org owner/admin
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    log.debug("[Org Members POST] Profile check:", { profile, profileError })

    const isSystemAdmin = profile?.role === "admin"

    // Check if user is owner/admin of the target organization
    let isOrgAdmin = false
    if (body.org_id) {
      const { data: orgMember, error: orgMemberError } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", body.org_id)
        .eq("profile_id", user.id)
        .single()

      log.debug("[Org Members POST] OrgMember check:", { orgMember, orgMemberError, org_id: body.org_id, profile_id: user.id })

      isOrgAdmin = orgMember?.role === "owner" || orgMember?.role === "manager"
    }

    log.debug("[Org Members POST] Permission result:", { isSystemAdmin, isOrgAdmin })

    if (!isSystemAdmin && !isOrgAdmin) {
      log.debug("[Org Members POST] ACCESS DENIED - User has no permission")
      return NextResponse.json({ error: "Acesso negado" }, { status: 403, headers: corsHeaders(request.headers.get("origin")) })
    }

    if (!body.org_id || !body.role) {
      return NextResponse.json(
        { error: "Campos obrigatórios: org_id, role" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // If profile_id is provided, use it; otherwise, we need email and name to create a new user
    let profileId = body.profile_id
    let tempPasswordForResponse: string | null = null

    if (!profileId) {
      if (!body.email || !body.name) {
        return NextResponse.json(
          { error: "Se profile_id não for informado, email e name são obrigatórios" },
          { status: 400, headers: corsHeaders(request.headers.get("origin")) }
        )
      }

      // Check if email already exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", body.email.toLowerCase())
        .single()

      if (existingProfile) {
        profileId = existingProfile.id
      } else {
        // Create new auth user and profile
        const adminClient = createAdminClient()

        // First check if auth user already exists (might be orphan from failed attempt)
        const { data: existingUsers } = await adminClient.auth.admin.listUsers()
        const existingAuthUser = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === body.email?.toLowerCase()
        )

        let authUserId: string

        if (existingAuthUser) {
          // User exists in auth, use their ID
          log.debug("[Org Members] Found existing auth user:", existingAuthUser.id)
          authUserId = existingAuthUser.id
        } else {
          // Create user with temporary password
          const tempPassword = generateTempPassword()
          tempPasswordForResponse = tempPassword // Save for response to admin

          const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
            email: body.email.toLowerCase(),
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              name: body.name,
              is_agent: true,
              must_change_password: true, // Flag to force password change on first login
            },
          })

          if (createError) {
            log.error("[Org Members] Create user error:", createError)
            return NextResponse.json(
              { error: "Erro ao criar usuário: " + createError.message },
              { status: 500, headers: corsHeaders(request.headers.get("origin")) }
            )
          }

          log.debug("[Org Members] User created successfully:", authUser.user.id)
          authUserId = authUser.user.id
        }

        // Check if profile already exists for this auth user
        const { data: existingProfileById } = await adminClient
          .from("profiles")
          .select("id")
          .eq("id", authUserId)
          .single()

        if (existingProfileById) {
          // Profile exists, use it
          profileId = existingProfileById.id
        } else {
          // Create profile
          log.debug("[Org Members] Creating profile with:", {
            id: authUserId,
            email: body.email.toLowerCase(),
            name: body.name,
          })

          const { data: newProfile, error: profileError } = await adminClient
            .from("profiles")
            .insert({
              id: authUserId,
              email: body.email.toLowerCase(),
              name: body.name,
              // role uses default from database
            })
            .select()
            .single()

          if (profileError) {
            log.error("[Org Members] Profile error:", profileError.message)
            return NextResponse.json(
              { error: "Erro ao criar perfil: " + profileError.message },
              { status: 500, headers: corsHeaders(request.headers.get("origin")) }
            )
          }

          profileId = newProfile.id
        }
      }
    }

    // Check if member already exists in this org (use adminClient to bypass RLS)
    const adminClientForCheck = createAdminClient()
    const { data: existingMember } = await adminClientForCheck
      .from("org_members")
      .select("id")
      .eq("org_id", body.org_id)
      .eq("profile_id", profileId)
      .single()

    if (existingMember) {
      return NextResponse.json(
        { error: "Este usuário já é membro desta organização" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // Create org member
    const { data: member, error: insertError } = await adminClientForCheck
      .from("org_members")
      .insert({
        org_id: body.org_id,
        profile_id: profileId,
        role: body.role,
        job_title: body.job_title || null,
        invited_by: user.id,
        invite_accepted_at: new Date().toISOString(),
      })
      .select(`
        *,
        organization:organizations(id, name, slug),
        profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
      `)
      .single()

    if (insertError) {
      log.error("[Org Members] Insert error:", insertError)
      return NextResponse.json(
        { error: "Erro ao criar membro: " + insertError.message },
        { status: 500, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    // If features are provided, assign them
    if (body.features && body.features.length > 0) {
      const featureInserts = body.features.map((featureKey) => ({
        org_member_id: member.id,
        feature_key: featureKey,
        enabled: true,
        granted_by: user.id,
      }))

      await adminClientForCheck
        .from("org_member_features")
        .insert(featureInserts)
    }

    // If store_ids are provided, assign access
    if (body.store_ids && body.store_ids.length > 0) {
      const accessInserts = body.store_ids.map((storeId) => ({
        org_member_id: member.id,
        store_id: storeId,
        can_view: true,
        assigned_by: user.id,
      }))

      await adminClientForCheck
        .from("agent_store_access")
        .insert(accessInserts)
    }

    // Log activity
    await supabase.from("activities").insert({
      user_id: user.id,
      type: "client_created", // Using existing type
      description: `Membro "${member.profile?.name}" adicionado à organização`,
      metadata: { member_id: member.id, role: body.role },
    })

    // Build response with temp password if new user was created
    const response: {
      member: typeof member
      message: string
      temp_password?: string
    } = {
      member,
      message: tempPasswordForResponse
        ? "Membro criado com sucesso. Senha provisória gerada."
        : "Membro criado com sucesso",
    }

    if (tempPasswordForResponse) {
      response.temp_password = tempPasswordForResponse
    }

    return NextResponse.json(response, { status: 201, headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Org Members] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
