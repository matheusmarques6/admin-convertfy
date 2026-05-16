/**
 * GET /api/admin/stores/[id]/top-products
 *
 * Lista os top produtos da loja (preenchidos via callback do n8n).
 * Auth: sessão autenticada (mesmo padrão das rotas /admin/stores/*).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("store_top_products")
      .select("id, rank, title, price, currency, handle, image_url, external_id, captured_at")
      .eq("store_id", storeId)
      .order("rank", { ascending: true })

    if (error) throw error

    return successResponse(_request, { products: data ?? [] })
  } catch (error) {
    return errorResponse(_request, error, "admin/stores/top-products")
  }
}
