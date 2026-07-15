import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  getConnectionStatus,
  disconnectGoogle,
} from "@/lib/services/google-auth.service"
import { errorResponse } from "@/lib/api/errors"

/**
 * Conta Google compartilhada da organizacao ("convertfy").
 * Token vive em user_google_tokens com user_type='org' e user_id=org_id.
 *
 * GET  → status de conexao da conta central
 * DELETE → desconecta a conta central (revoga no Google + remove o registro)
 *
 * Ambos exigem papel de gestao (admin/dev/coo/owner).
 */

const ORG_MANAGE_ROLES = ["admin", "dev", "coo", "owner"]

async function resolveOrgAndRole(userId: string) {
  const supabase = await createClient()
  const { data: member } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle()
  return { orgId: member?.org_id as string | undefined, role: member?.role as string | undefined }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { orgId, role } = await resolveOrgAndRole(user.id)
    if (!orgId) return NextResponse.json({ error: "Sem organizacao" }, { status: 400 })
    if (!role || !ORG_MANAGE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
    }

    const status = await getConnectionStatus(orgId, "org")
    return NextResponse.json(status)
  } catch (error) {
    return errorResponse(request, error, "OrgGoogleCalendarStatus")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { orgId, role } = await resolveOrgAndRole(user.id)
    if (!orgId) return NextResponse.json({ error: "Sem organizacao" }, { status: 400 })
    if (!role || !ORG_MANAGE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
    }

    await disconnectGoogle(orgId, "org")
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(request, error, "OrgGoogleCalendarDisconnect")
  }
}
