import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { getCache, setCache } from "@/lib/cache"
import { generateShopifyReport } from "@/lib/integrations/shopify/report"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Main GET handler
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Validate user has access to this store (multi-tenant isolation)
    await requireStoreAccess(storeId, user.id)

    // Check cache first (skip if force_refresh)
    const forceRefresh = searchParams.get("force_refresh") === "true"
    if (!forceRefresh) {
      const cached = await getCache(supabase, storeId, "shopify", period)
      if (cached) {
        return NextResponse.json({ ...cached.data, _cached: true, _cachedAt: cached.cachedAt })
      }
    }

    // Generate full report via extracted business logic
    const reportData = await generateShopifyReport(storeId, {
      period,
      customStartDate,
      customEndDate,
    })

    // Save to cache for future requests
    await setCache(supabase, storeId, "shopify", period, reportData as unknown as Record<string, unknown>)

    return NextResponse.json(reportData)
  } catch (error) {
    return errorResponse(request, error, "IntegrationsShopifyReport")
  }
}
