import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { buildPortalInvoices } from "@/lib/services/portal-invoices.service"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - Get invoices for portal user
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
      throw new AppError("Não autorizado", 401)
    }

    // Check permission
    const permissions = portalUser.permissions as { view_invoices?: boolean }
    if (!permissions?.view_invoices) {
      throw new AppError("Sem permissão", 403)
    }

    // Use admin client for data queries (RLS bypass policies will be removed in 18.1.2)
    const adminClient = createAdminClient()

    const searchParams = request.nextUrl.searchParams

    const payload = await buildPortalInvoices({
      clientId: portalUser.client_id,
      portalUserId: portalUser.id,
      status: searchParams.get("status"),
      year: searchParams.get("year"),
      adminClient,
    })

    return NextResponse.json(payload, {
      headers: corsHeaders(request.headers.get("origin")),
    })
  } catch (error) {
    return errorResponse(request, error, "PortalInvoices")
  }
}
