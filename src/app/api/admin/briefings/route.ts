import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/briefings
 * Returns the list of stores that have a current briefing, ordered by name.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const adminClient = createAdminClient()

    // Distinct store_ids that have a current briefing
    const { data: briefings, error: briefingsError } = await adminClient
      .from("store_briefings")
      .select("store_id")
      .eq("status", "current")

    if (briefingsError) {
      throw new AppError("Erro ao buscar briefings", 500)
    }

    const storeIds = Array.from(
      new Set((briefings || []).map((b) => b.store_id as string).filter(Boolean))
    )

    if (storeIds.length === 0) {
      return successResponse(request, { stores: [] })
    }

    const { data: stores, error: storesError } = await adminClient
      .from("client_stores")
      .select("id, store_name")
      .in("id", storeIds)
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
