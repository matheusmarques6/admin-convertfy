import { NextRequest } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { inviteOrgMember } from "@/lib/services/org-member-invite.service"
import { ROLES_CAN_CREATE_ACCOUNTS } from "@/lib/permissions/role-access"
import type { OrgRole } from "@/types"

const log = logger.child("TeamInvite")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

const ORG_ROLE_VALUES = ["admin", "dev", "coo", "suporte", "designer", "implementacao"] as const

const inviteSchema = z.object({
  email: z.string().email("Email inválido"),
  roles: z.array(z.enum(ORG_ROLE_VALUES)).min(1, "Selecione ao menos uma função"),
})

/** "rickmusic70@gmail.com" → "Rickmusic70" (o modal não coleta nome). */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || email
  return local.charAt(0).toUpperCase() + local.slice(1)
}

// POST - Convite simplificado de membro (email + roles[]) na org do convidante
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const { email, roles } = inviteSchema.parse(await request.json())

    // Gate: system admin OU conta com função autorizada a criar contas
    // (admin/dev/coo) em pelo menos uma org.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isSystemAdmin = profile?.role === "admin"

    const { data: ownerships } = await supabase
      .from("org_members")
      .select("id, org_id, role")
      .eq("profile_id", user.id)

    const memberIds = (ownerships ?? []).map((m) => m.id)

    let inviterRoles: OrgRole[] = []
    if (memberIds.length > 0) {
      const { data: roleRows } = await supabase
        .from("org_member_roles")
        .select("role")
        .in("org_member_id", memberIds)
      inviterRoles = (roleRows ?? []).map((r) => r.role as OrgRole)
    }

    const canCreate = inviterRoles.some((r) => ROLES_CAN_CREATE_ACCOUNTS.includes(r))

    if (!isSystemAdmin && !canCreate) {
      throw new AppError("Acesso negado", 403)
    }

    let orgId = ownerships?.[0]?.org_id as string | undefined

    if (!orgId) {
      const admin = createAdminClient()
      const { data: defaultOrg } = await admin
        .from("organizations")
        .select("id")
        .limit(1)
        .single()
      orgId = defaultOrg?.id
    }

    if (!orgId) {
      throw new AppError("Nenhuma organização encontrada para o convite", 400)
    }

    const { member, tempPassword } = await inviteOrgMember({
      orgId,
      roles: roles as OrgRole[],
      email,
      name: nameFromEmail(email),
      invitedBy: user.id,
    })

    log.info("Convite simplificado criado", { email, roles, orgId })

    const response: {
      member: typeof member
      message: string
      temp_password?: string
    } = {
      member,
      message: tempPassword
        ? "Convite enviado. Senha provisória gerada."
        : "Convite enviado.",
    }

    if (tempPassword) {
      response.temp_password = tempPassword
    }

    return successResponse(request, response, { status: 201 })
  } catch (error) {
    log.error("Team invite error:", error)
    return errorResponse(request, error, "team-invite")
  }
}
