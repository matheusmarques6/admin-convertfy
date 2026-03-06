import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { createClient } from "@/lib/supabase/server"
import { createWiseService } from "@/lib/integrations/wise"
import { decryptCredentialsJson } from "@/lib/crypto"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const endDate = searchParams.get("end_date") || new Date().toISOString()
    const startDate =
      searchParams.get("start_date") ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "wise")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    if (integrationError || !integration) {
      throw new AppError("Wise integration not configured", 400)
    }

    const wise = createWiseService(decryptCredentialsJson(integration.credentials))
    const payments = await wise.getReceivedPayments({
      intervalStart: startDate,
      intervalEnd: endDate,
    })

    // Get all clients to help with matching
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, email, company")

    return successResponse(request, {
      payments,
      clients: clients || [],
      period: { start: startDate, end: endDate },
    })
  } catch (error) {
    return errorResponse(request, error, "IntegrationsWiseTransactions")
  }
}
