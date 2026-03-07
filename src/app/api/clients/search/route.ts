import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { sanitizeSearch } from "@/lib/utils/sanitize-search"
import { logger } from "@/lib/logger"

const log = logger.child("ClientsSearch")

async function resolveOrgId(adminClient: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  // Use admin client to bypass RLS on org_members
  const { data: orgMember, error } = await adminClient
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  log.info("resolveOrgId", { userId, orgMember, error: error?.message })

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
    const clientId = searchParams.get("id") || ""

    const adminClient = createAdminClient()
    const orgId = await resolveOrgId(adminClient, user.id)

    // Fetch by ID — used for pre-selecting a client (e.g. defaultClientId in QuickStoreForm)
    if (clientId) {
      log.info("Fetching client by ID", { clientId, orgId })
      const { data: clients, error } = await adminClient
        .from("clients")
        .select("id, name, email, company")
        .eq("org_id", orgId)
        .eq("id", clientId)
        .limit(1)

      if (error) {
        log.error("Error fetching client by ID", { error: error.message })
        throw new AppError("Erro ao buscar cliente", 500)
      }

      return successResponse(request, { clients: clients || [] })
    }

    if (query.length < 2) {
      return successResponse(request, { clients: [] })
    }

    log.info("Searching clients", { query, orgId, userId: user.id })

    // Sanitize search input (escapes ILIKE wildcards + PostgREST filter syntax)
    const escapedQuery = sanitizeSearch(query)

    // Search clients by name, email, or company using ilike
    const { data: clients, error } = await adminClient
      .from("clients")
      .select("id, name, email, company")
      .eq("org_id", orgId)
      .or(`name.ilike.%${escapedQuery}%,email.ilike.%${escapedQuery}%,company.ilike.%${escapedQuery}%`)
      .order("name")
      .limit(20)

    if (error) {
      log.error("Error searching clients", { error: error.message, code: error.code })
      throw new AppError("Erro ao buscar clientes", 500)
    }

    log.info("Search results", { query, orgId, count: clients?.length || 0 })

    return successResponse(request, { clients: clients || [] })
  } catch (error) {
    return errorResponse(request, error, "ClientsSearch")
  }
}
