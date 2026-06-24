import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { OrgMemberFormData } from "@/types"
import { inviteOrgMember } from "@/lib/services/org-member-invite.service"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { ROLES_CAN_CREATE_ACCOUNTS } from "@/lib/permissions/role-access"
import type { OrgRole } from "@/types"

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

    // Batch: fetch all features and store access in 2 queries instead of 2*N
    const memberIds = (members || []).map((m) => m.id)

    if (memberIds.length === 0) {
      return successResponse(request, { members: [] })
    }

    const [rolesRes, accessRes] = await Promise.all([
      supabase
        .from("org_member_roles")
        .select("org_member_id, role")
        .in("org_member_id", memberIds),
      supabase
        .from("agent_store_access")
        .select("org_member_id, id")
        .in("org_member_id", memberIds)
        .eq("can_view", true),
    ])

    const rolesByMember = new Map<string, OrgRole[]>()
    rolesRes.data?.forEach((r) => {
      const list = rolesByMember.get(r.org_member_id) || []
      list.push(r.role as OrgRole)
      rolesByMember.set(r.org_member_id, list)
    })

    const accessCountByMember = new Map<string, number>()
    accessRes.data?.forEach((a) => {
      accessCountByMember.set(a.org_member_id, (accessCountByMember.get(a.org_member_id) || 0) + 1)
    })

    const membersWithDetails = (members || []).map((member) => ({
      ...member,
      roles: rolesByMember.get(member.id) || [member.role as OrgRole],
      store_access_count: accessCountByMember.get(member.id) || 0,
    }))

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

    // Validate required fields (multi-função: roles[] obrigatório).
    if (!body.org_id || !body.roles || body.roles.length === 0) {
      throw new AppError("Campos obrigatórios: org_id, roles[]", 400)
    }

    // Gate: system admin OU conta com função autorizada a criar contas
    // (admin/dev/coo) na org alvo.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isSystemAdmin = profile?.role === "admin"

    let canCreate = false
    if (body.org_id) {
      const { data: orgMember } = await supabase
        .from("org_members")
        .select("id")
        .eq("org_id", body.org_id)
        .eq("profile_id", user.id)
        .single()

      if (orgMember) {
        const { data: roleRows } = await supabase
          .from("org_member_roles")
          .select("role")
          .eq("org_member_id", orgMember.id)
        const inviterRoles = (roleRows ?? []).map((r) => r.role as OrgRole)
        canCreate = inviterRoles.some((r) => ROLES_CAN_CREATE_ACCOUNTS.includes(r))
      }
    }

    if (!isSystemAdmin && !canCreate) {
      throw new AppError("Acesso negado", 403)
    }

    // Núcleo de criação compartilhado com /api/team/invite
    const { member, tempPassword } = await inviteOrgMember({
      orgId: body.org_id,
      roles: body.roles,
      profileId: body.profile_id,
      email: body.email,
      name: body.name,
      jobTitle: body.job_title,
      storeIds: body.store_ids,
      invitedBy: user.id,
    })

    // Build response with temp password if new user was created
    const response: {
      member: typeof member
      message: string
      temp_password?: string
    } = {
      member,
      message: tempPassword
        ? "Membro criado com sucesso. Senha provisória gerada."
        : "Membro criado com sucesso",
    }

    if (tempPassword) {
      response.temp_password = tempPassword
    }

    return successResponse(request, response, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "AdminOrgMembers")
  }
}
