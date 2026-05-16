/**
 * POST /api/webhooks/n8n/ads-analyzer/products
 *
 * Callback do n8n com Top Produtos da loja (TrendTrack /v1/shops/:id/products).
 * Idempotente por loja: DELETE all → INSERT new (atômico via service role).
 *
 * Auth: header x-secret == N8N_WEBHOOK_SECRET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, parseAndValidate, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const product = z.object({
  rank: z.number().int().min(1).max(50),
  title: z.string().trim().min(1).max(500),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().trim().max(8).optional().nullable(),
  handle: z.string().trim().max(300).optional().nullable(),
  image_url: z.string().trim().max(2_000).optional().nullable(),
  external_id: z.string().trim().max(200).optional().nullable(),
})

const schema = z.object({
  store_id: z.string().uuid(),
  captured_at: z.string().datetime().optional().nullable(),
  products: z.array(product).max(50),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-secret")
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()

    // Confirma que store existe (evita inserir lixo)
    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", body.store_id)
      .single()
    if (storeErr || !store) throw new AppError("Loja não encontrada", 404)

    // Idempotente: limpa o lote anterior antes de inserir o novo
    const { error: delErr } = await admin
      .from("store_top_products")
      .delete()
      .eq("store_id", body.store_id)
    if (delErr) throw delErr

    if (body.products.length === 0) {
      return successResponse(request, { store_id: body.store_id, inserted: 0 })
    }

    const capturedAt = body.captured_at ?? new Date().toISOString()
    const rows = body.products.map((p) => ({
      store_id: body.store_id,
      rank: p.rank,
      title: p.title,
      price: p.price ?? null,
      currency: p.currency ?? null,
      handle: p.handle ?? null,
      image_url: p.image_url ?? null,
      external_id: p.external_id ?? null,
      source: "trendtrack",
      captured_at: capturedAt,
    }))

    const { error: insErr } = await admin
      .from("store_top_products")
      .insert(rows)
    if (insErr) throw insErr

    return successResponse(request, { store_id: body.store_id, inserted: rows.length })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/products")
  }
}
