import { NextRequest, NextResponse } from "next/server"
import { errorResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getAccessibleStoreIds } from "@/lib/api/require-store-access"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { decrypt } from "@/lib/crypto"
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

    // Store-level access: restrict non-admin/non-owner to their granted stores
    const { storeIds: accessibleIds, isSystemAdmin } = await getAccessibleStoreIds(user.id, orgId, { detailed: true })

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")
    const activeOnly = searchParams.get("active") === "true"

    let query = supabase
      .from("client_stores")
      .select(`*, client:clients(id, name, company, email)`)
      .order("store_name")

    // For system admins viewing a specific client, skip org_id filter
    // (the client may belong to a different org than the admin's primary org).
    // RLS is_admin() already allows full access; .eq("client_id") scopes correctly.
    // For non-admins or general listing (no client_id), keep org_id filter.
    if (!(isSystemAdmin && clientId)) {
      query = query.eq("org_id", orgId)
    }

    // Apply store-level filtering for non-admin/non-owner members
    if (accessibleIds !== null) {
      if (accessibleIds.length === 0) {
        // No stores accessible — return empty
        return NextResponse.json(
          { stores: [] },
          { headers: corsHeaders(request.headers.get("origin")) }
        )
      }
      query = query.in("id", accessibleIds)
    }

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: stores, error } = await query

    if (error) {
      log.error("[Stores] Error fetching stores:", { message: error.message, details: error.details, hint: error.hint })
      throw new AppError(`Erro ao buscar lojas: ${error.message}`, 500)
    }

    // Sanitize: remove encrypted credentials, compute boolean flags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitizedStores = (stores || []).map((store: any) => {
      const has_shopify_credentials = !!store.shopify_access_token
      const has_klaviyo_credentials = !!(store.klaviyo_private_key || store.klaviyo_api_key)
      const has_ga4_credentials = !!store.ga4_credentials

      // Remove encrypted credential values — never expose enc:v1:... to browser
      const {
        shopify_access_token: _s,
        shopify_api_key: _sk,
        shopify_api_secret: _ss,
        klaviyo_private_key: _kp,
        klaviyo_api_key: _ka,
        klaviyo_public_key: _kpub,
        ga4_credentials: _g,
        meta_access_token: _m,
        google_ads_credentials: _ga,
        google_calendar_credentials: _gc,
        ...rest
      } = store

      // Decrypt public key (Site ID) — it's not a secret, safe to show in UI
      let klaviyo_public_key: string | null = null
      if (_kpub && typeof _kpub === "string") {
        try {
          klaviyo_public_key = decrypt(_kpub)
        } catch {
          klaviyo_public_key = _kpub // fallback if not encrypted (legacy)
        }
      }

      return {
        ...rest,
        klaviyo_public_key,
        has_shopify_credentials,
        has_klaviyo_credentials,
        has_ga4_credentials,
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
