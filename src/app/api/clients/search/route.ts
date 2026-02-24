import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("ClientsSearch")

// GET - Search clients by name/email/company within an org
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("q") || ""
    const orgId = searchParams.get("org_id")

    if (!orgId) {
      throw new AppError("org_id is required", 400)
    }

    if (query.length < 2) {
      return successResponse(request, { clients: [] })
    }

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
