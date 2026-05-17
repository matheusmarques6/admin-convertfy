/**
 * GET /api/admin/stores/[id]/top-products
 *
 * Lista os top produtos de uma loja (lê store_top_products).
 * Usado pela seção "Operação & catálogo" na aba Contexto.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const url = new URL(request.url)
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "5", 10), 1),
      50,
    )

    const { data, error } = await admin
      .from("store_top_products")
      .select(
        "rank, title, price, currency, handle, image_url, external_id, source, captured_at",
      )
      .eq("store_id", storeId)
      .order("rank", { ascending: true })
      .limit(limit)

    if (error) throw error

    const products = data ?? []
    const capturedAt = products.length > 0 ? products[0].captured_at : null

    return successResponse(request, {
      store_id: storeId,
      captured_at: capturedAt,
      products,
    })
  } catch (error) {
    return errorResponse(request, error, "store-top-products-list")
  }
}
