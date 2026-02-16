import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("Stores")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// CORS headers




// GET - List all stores with client info
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError("Não autorizado", 401)
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")
    const activeOnly = searchParams.get("active") === "true"

    let query = supabase
      .from("client_stores")
      .select(`
        id,
        store_name,
        platform,
        store_url,
        is_active,
        created_at,
        client_id,
        language,
        feedback_frequency,
        last_feedback_date,
        next_feedback_date,
        last_feedback_by,
        feedback_notes,
        shopify_store_domain,
        client:clients(id, name, company, email)
      `)
      .order("store_name")

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: stores, error } = await query

    if (error) {
      log.error("[Stores] Error fetching stores:", error)
      throw new AppError("Erro ao buscar lojas", 500)
    }

    return NextResponse.json(
      { stores: stores || [] },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "Stores")
  }
}
