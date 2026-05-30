import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/briefings
 * Returns the list of all active stores, ordered by name. The page lets the
 * user pick any store and shows whether it has a briefing (an empty state is
 * rendered for stores without one), so the selector must not be limited to
 * stores that already have a current briefing.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const adminClient = createAdminClient()

    const { data: stores, error: storesError } = await adminClient
      .from("client_stores")
      .select("id, store_name")
      .eq("is_active", true)
      .order("store_name", { ascending: true })

    if (storesError) {
      throw new AppError("Erro ao buscar lojas", 500)
    }

    const result = (stores || []).map((s) => ({
      store_id: s.id as string,
      store_name: (s.store_name as string) || "—",
    }))

    return successResponse(request, { stores: result })
  } catch (error) {
    return errorResponse(request, error, "AdminBriefings")
  }
}
