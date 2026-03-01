import { NextRequest, NextResponse } from "next/server"
import { errorResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
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

    // Defense-in-depth: filter by org_id (RLS already protects, but explicit is safer)
    const orgId = await resolveOrgId(user.id)

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
        currency,
        language,
        feedback_frequency,
        last_feedback_date,
        next_feedback_date,
        last_feedback_by,
        feedback_notes,
        shopify_store_domain,
        shopify_access_token,
        klaviyo_public_key,
        klaviyo_private_key,
        klaviyo_api_key,
        klaviyo_list_id,
        ga4_property_id,
        ga4_credentials,
        client:clients(id, name, company, email)
      `)
      .eq("org_id", orgId)
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

    // Sanitize: remove encrypted credentials, compute boolean flags
    const sanitizedStores = (stores || []).map((store) => {
      const {
        shopify_access_token,
        klaviyo_private_key,
        klaviyo_api_key,
        ga4_credentials,
        ...rest
      } = store
      return {
        ...rest,
        has_shopify_credentials: !!shopify_access_token,
        has_klaviyo_credentials: !!(klaviyo_private_key || klaviyo_api_key),
        has_ga4_credentials: !!ga4_credentials,
      }
    })

    return NextResponse.json(
      { stores: sanitizedStores },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "Stores")
  }
}
