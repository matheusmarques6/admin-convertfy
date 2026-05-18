/**
 * POST /api/webhooks/n8n/top-products
 *
 * Callback do n8n que popula a seção "Top 5 produtos" dentro de
 * "Operação & catálogo" na aba Contexto. Substitui atomicamente
 * (DELETE + INSERT via service role) os produtos da loja em
 * `store_top_products`.
 *
 * UI: src/components/stores/v2/tab-contexto.tsx (seção "Operação")
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import {
  errorResponse,
  successResponse,
  parseAndValidate,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const productSchema = z.object({
  rank: z.number().int().min(1).max(50),
  title: z.string().min(1).max(500),
  price: z.number().nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  handle: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  external_id: z.string().nullable().optional(),
})

const schema = z.object({
  store_id: z.string().uuid(),
  captured_at: z.string().datetime().optional(),
  products: z.array(productSchema).min(1).max(50),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    const admin = createAdminClient()

    // Confirma que a loja existe
    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", body.store_id)
      .single()
    if (storeErr || !store) throw new NotFoundError("Loja")

    const capturedAt = body.captured_at ?? new Date().toISOString()

    // Replace atomic: delete all + insert new
    const { error: delErr } = await admin
      .from("store_top_products")
      .delete()
      .eq("store_id", body.store_id)
    if (delErr) throw delErr

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

    logger.info("[n8n:top-products] persisted", {
      store_id: body.store_id,
      inserted: rows.length,
    })

    return successResponse(request, {
      data: { store_id: body.store_id, inserted: rows.length },
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:top-products")
  }
}
