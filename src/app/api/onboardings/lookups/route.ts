/**
 * GET /api/onboardings/lookups
 * Retorna { clients, stores } para preencher pickers da UI de criar
 * onboarding manual. Stores incluem client_id pra UI filtrar.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const [clientsRes, storesRes] = await Promise.all([
      admin
        .from("clients")
        .select("id, name, company, email")
        .eq("org_id", orgId)
        .order("name", { ascending: true }),
      admin
        .from("client_stores")
        .select("id, client_id, store_name, store_url, platform")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("store_name", { ascending: true }),
    ])

    return successResponse(request, {
      clients: clientsRes.data ?? [],
      stores: storesRes.data ?? [],
    })
  } catch (error) {
    return errorResponse(request, error, "onboardings-lookups")
  }
}
