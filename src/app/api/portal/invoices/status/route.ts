import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getPortalInvoicesStatus } from "@/lib/services/portal-invoices.service"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - Lightweight invoice status for the portal banner
// Returns pending/overdue counts + revenue from cache (no Asaas/Klaviyo calls)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, client_id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Nao autorizado", 401)
    }

    // Check permission
    const permissions = portalUser.permissions as { view_invoices?: boolean }
    if (!permissions?.view_invoices) {
      throw new AppError("Sem permissao", 403)
    }

    const adminClient = createAdminClient()

    const payload = await getPortalInvoicesStatus({
      clientId: portalUser.client_id,
      adminClient,
    })

    return NextResponse.json(payload, {
      headers: corsHeaders(request.headers.get("origin")),
    })
  } catch (error) {
    return errorResponse(request, error, "PortalInvoiceStatus")
  }
}
