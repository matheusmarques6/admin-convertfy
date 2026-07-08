/**
 * POST /api/webhooks/n8n/competitors
 *
 * Callback do n8n que sincroniza concorrentes (origem: TrendTrack
 * `/v1/shops` ou similar) em `client_competitors`.
 *
 * Idempotência: preserva concorrentes com source='manual' (criados
 * pela UI). Substitui apenas os com source='trendtrack' — faz
 * DELETE + INSERT dos automáticos para refletir o estado atual.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { assertStoreUrlMatches } from "@/lib/api/n8n-store-guard"
import {
  errorResponse,
  successResponse,
  parseAndValidate,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const competitorSchema = z.object({
  name: z.string().min(1).max(160),
  url: z.string().nullable().optional(),
  posicionamento: z
    .enum(["popular", "similar", "premium"])
    .nullable()
    .optional(),
  notas: z.string().max(2000).nullable().optional(),
})

const schema = z.object({
  store_id: z.string().uuid(),
  // Echo opcional do n8n — liga o guard anti-contaminação de loja.
  store_url: z.string().optional().nullable(),
  competitors: z.array(competitorSchema).min(0).max(20),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    await assertStoreUrlMatches(body.store_id, body.store_url, "n8n:competitors")
    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", body.store_id)
      .single()
    if (storeErr || !store) throw new NotFoundError("Loja")

    // Substitui apenas concorrentes do n8n; preserva manuais
    const { error: delErr } = await admin
      .from("client_competitors")
      .delete()
      .eq("store_id", body.store_id)
      .eq("source", "trendtrack")
    if (delErr) throw delErr

    let inserted = 0
    if (body.competitors.length > 0) {
      const rows = body.competitors.map((c) => ({
        store_id: body.store_id,
        name: c.name,
        url: c.url ?? null,
        posicionamento: c.posicionamento ?? null,
        notas: c.notas ?? null,
        source: "trendtrack",
      }))

      const { error: insErr } = await admin
        .from("client_competitors")
        .insert(rows)
      if (insErr) throw insErr
      inserted = rows.length
    }

    logger.info("[n8n:competitors] persisted", {
      store_id: body.store_id,
      inserted,
    })

    return successResponse(request, {
      data: { store_id: body.store_id, inserted },
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:competitors")
  }
}
