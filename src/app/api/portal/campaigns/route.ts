import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolvePortalClient } from "@/lib/api/portal-auth"
import { getPortalCampaigns } from "@/lib/services/portal-campaigns.service"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List campaigns for the client's stores (portal view)
// Unified: campaigns (Klaviyo sync + manual) + campaign_batches — all via single RPC
// IMPORTANT: Does NOT return instructions_doc_url, notes, or preview_text (internal fields)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const user = await requireAuth(supabase)

    // Resolve portal client context (auth + stores)
    const ctx = await resolvePortalClient(adminClient, user.id)

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const limitRaw = parseInt(searchParams.get("limit") || "500", 10)
    const offsetRaw = parseInt(searchParams.get("offset") || "0", 10)

    const result = await getPortalCampaigns({
      ctx,
      startDate: searchParams.get("start_date"),
      endDate: searchParams.get("end_date"),
      status: searchParams.get("status"),
      storeId: searchParams.get("store_id"),
      channel: searchParams.get("channel"),
      limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 500,
      offset: Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0,
      adminClient,
    })

    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error, "PortalCampaigns")
  }
}
