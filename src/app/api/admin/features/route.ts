import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminFeatures")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List all available features from catalog
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get("category")
    const activeOnly = searchParams.get("active_only") !== "false"

    let query = supabase
      .from("features_catalog")
      .select("*")
      .order("sort_order", { ascending: true })

    if (category) {
      query = query.eq("category", category)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: features, error } = await query

    if (error) {
      log.error("[Features] Error fetching:", error)
      throw new AppError("Erro ao buscar features", 500)
    }

    // Group features by category
    const grouped = (features || []).reduce((acc, feature) => {
      if (!acc[feature.category]) {
        acc[feature.category] = []
      }
      acc[feature.category].push(feature)
      return acc
    }, {} as Record<string, typeof features>)

    return successResponse(request, {
      features: features || [],
      grouped,
    })
  } catch (error) {
    return errorResponse(request, error, "AdminFeatures")
  }
}
