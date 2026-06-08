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
import type { OrgRole } from "@/types"

const log = logger.child("TeamInvite")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// O modal "Convidar membro" (settings/team) só coleta email + role com rótulos
// simplificados. Mapeamos para o enum real `org_role`.
const SIMPLE_ROLE_TO_ORG_ROLE: Record<string, OrgRole> = {
  admin: "owner",
  manager: "manager",
  member: "support",
}

const inviteSchema = z.object({
  email: z.string().email("Email inválido"),
  role: z.enum(["admin", "manager", "member"]),
})

/** "rickmusic70@gmail.com" → "Rickmusic70" (o modal não coleta nome). */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || email
  return local.charAt(0).toUpperCase() + local.slice(1)
}

// POST - Convite simplificado de membro (email + role) na org do convidante
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const { email, role } = inviteSchema.parse(await request.json())

    // Gate: system admin OU owner/manager de alguma org
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isSystemAdmin = profile?.role === "admin"

    // Org do convidante (onde ele é owner/manager). Fallback: primeira org.
    const { data: ownerships } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("profile_id", user.id)
      .in("role", ["owner", "manager"])

    const isOrgAdmin = (ownerships?.length ?? 0) > 0

    if (!isSystemAdmin && !isOrgAdmin) {
      throw new AppError("Acesso negado", 403)
    }

    let orgId = ownerships?.[0]?.org_id as string | undefined

    if (!orgId) {
      // System admin sem org própria: usar a primeira organização (default)
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
      role: SIMPLE_ROLE_TO_ORG_ROLE[role],
      email,
      name: nameFromEmail(email),
      invitedBy: user.id,
    })

    log.info("Convite simplificado criado", { email, role, orgId })

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
