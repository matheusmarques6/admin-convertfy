import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientsSearch")

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado: usuário sem organização", 403)
  }
  return orgMember.org_id
}

// GET - Search clients by name/email/company within the user's org
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("q") || ""

    if (query.length < 2) {
      return successResponse(request, { clients: [] })
    }

    const orgId = await resolveOrgId(supabase, user.id)
    const adminClient = createAdminClient()

    // Search clients by name, email, or company using ilike
    const { data: clients, error } = await adminClient
      .from("clients")
      .select("id, name, email, company")
      .eq("org_id", orgId)
      .or(`name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%`)
      .order("name")
      .limit(20)

    if (error) {
      log.error("Error searching clients", { error })
      throw new AppError("Erro ao buscar clientes", 500)
    }

    return successResponse(request, { clients: clients || [] })
  } catch (error) {
    return errorResponse(request, error, "ClientsSearch")
  }
}
