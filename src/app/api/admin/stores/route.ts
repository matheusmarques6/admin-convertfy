import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("AdminStores")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List all stores with client info for campaign targeting
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const language = searchParams.get("language")
    const clientId = searchParams.get("client_id")
    const activeOnly = searchParams.get("active_only") !== "false" // Default true

    // Build query - select stores with client info
    let query = supabase
      .from("client_stores")
      .select(`
        id,
        store_name,
        platform,
        store_url,
        is_active,
        language,
        client_id,
        client:clients(
          id,
          name,
          company,
          email
        )
      `)
      .order("store_name")

    // Apply filters
    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    if (language) {
      query = query.eq("language", language)
    }

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    const { data: stores, error } = await query

    if (error) {
      log.error("[Admin Stores] Error fetching:", error)
      throw new AppError("Erro ao buscar lojas", 500)
    }

    // Get unique languages for quick filters
    const { data: languages } = await supabase
      .from("client_stores")
      .select("language")
      .eq("is_active", true)
      .not("language", "is", null)

    const uniqueLanguages = Array.from(new Set(languages?.map(l => l.language).filter(Boolean)))

    // Count stores by language
    const languageCounts: Record<string, number> = {}
    stores?.forEach(store => {
      const lang = store.language || "pt-BR"
      languageCounts[lang] = (languageCounts[lang] || 0) + 1
    })

    return successResponse(request, {
      stores: stores || [],
      totalCount: stores?.length || 0,
      languages: uniqueLanguages,
      languageCounts,
    })
  } catch (error) {
    return errorResponse(request, error, "AdminStores")
  }
}
