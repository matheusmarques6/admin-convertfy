import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { OrgMemberFormData } from "@/types"
import { generateTempPassword } from "@/lib/utils/generate-password"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminOrgMembers")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List org members
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

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
      throw new AppError("Acesso negado", 403)
    }

    const searchParams = request.nextUrl.searchParams
    const orgId = searchParams.get("org_id")
    const role = searchParams.get("role")
    const isActive = searchParams.get("is_active")

    // If filtering by org_id, check permission for that specific org (any member can read)
    if (orgId && !isSystemAdmin && !memberOrgIds.includes(orgId)) {
      throw new AppError("Acesso negado", 403)
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
      throw new AppError("Erro ao buscar membros", 500)
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

    return successResponse(request, { members: membersWithDetails })
  } catch (error) {
    return errorResponse(request, error, "AdminOrgMembers")
  }
}

// POST - Create new org member (invite)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body: OrgMemberFormData = await request.json()

    // Validate required fields first (Fix 3.6)
    if (!body.org_id || !body.role) {
      throw new AppError("Campos obrigatórios: org_id, role", 400)
    }

    // Check if user has permission: system admin OR org owner/admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

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

      isOrgAdmin = orgMember?.role === "owner" || orgMember?.role === "manager"
    }

    if (!isSystemAdmin && !isOrgAdmin) {
      throw new AppError("Acesso negado", 403)
    }

    // If profile_id is provided, use it; otherwise, we need email and name to create a new user
    let profileId = body.profile_id
    let tempPasswordForResponse: string | null = null

    if (!profileId) {
      if (!body.email || !body.name) {
        throw new AppError("Se profile_id não for informado, email e name são obrigatórios", 400)
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

        // Try to create the auth user directly; handle "already exists" for orphan cases
        let authUserId: string
        const tempPassword = generateTempPassword()

        const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
          email: body.email.toLowerCase(),
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            name: body.name,
            is_agent: true,
            must_change_password: true,
          },
        })

        if (createError) {
          const isDuplicate =
            createError.message?.toLowerCase().includes("already") ||
            (createError as { status?: number }).status === 422

          if (isDuplicate) {
            log.debug("[Org Members] Auth user already exists, searching by email")

            // Paginate through auth users to find the orphan
            let page = 1
            let foundUserId: string | null = null

            while (!foundUserId) {
              const { data: usersPage } = await adminClient.auth.admin.listUsers({ page, perPage: 50 })
              const users = usersPage?.users || []
              const match = users.find(
                (u) => u.email?.toLowerCase() === body.email?.toLowerCase()
              )
              if (match) {
                foundUserId = match.id
                log.debug("[Org Members] Found orphan auth user:", match.id)
              } else if (users.length < 50) {
                break
              } else {
                page++
                if (page > 20) break // Safety cap
              }
            }

            if (!foundUserId) {
              log.error("[Org Members] Auth reports duplicate but user not found:", createError)
              throw new AppError("Erro ao criar usuário: " + createError.message, 500)
            }

            authUserId = foundUserId
          } else {
            log.error("[Org Members] Create user error:", createError)
            throw new AppError("Erro ao criar usuário: " + createError.message, 500)
          }
        } else {
          log.debug("[Org Members] User created successfully:", authUser.user.id)
          authUserId = authUser.user.id
          tempPasswordForResponse = tempPassword
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
            throw new AppError("Erro ao criar perfil: " + profileError.message, 500)
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
      throw new AppError("Este usuário já é membro desta organização", 400)
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
      throw new AppError("Erro ao criar membro: " + insertError.message, 500)
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

    return successResponse(request, response, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "AdminOrgMembers")
  }
}
