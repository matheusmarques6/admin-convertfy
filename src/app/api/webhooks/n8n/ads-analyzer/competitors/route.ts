/**
 * POST /api/webhooks/n8n/ads-analyzer/competitors
 *
 * Callback do n8n com concorrentes vindos da busca TrendTrack /v1/shops.
 * UPSERT preservando concorrentes manuais (source != 'n8n').
 *
 * Idempotência: por (store_id, lower(url)) quando source='n8n'.
 *
 * Auth: header x-secret == N8N_WEBHOOK_SECRET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, parseAndValidate, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const competitor = z.object({
  name: z.string().trim().min(1).max(160),
  url: z.string().trim().min(1).max(2_000).optional().nullable(),
  posicionamento: z.enum(["popular", "similar", "premium"]).optional().nullable(),
  notas: z.string().trim().max(2_000).optional().nullable(),
})

const schema = z.object({
  store_id: z.string().uuid(),
  competitors: z.array(competitor).max(20),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-secret")
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", body.store_id)
      .single()
    if (storeErr || !store) throw new AppError("Loja não encontrada", 404)

    // Carrega concorrentes do n8n existentes para fazer UPSERT manual
    // (Postgres não suporta ON CONFLICT em índice parcial sem extensão)
    const { data: existing } = await admin
      .from("client_competitors")
      .select("id, url")
      .eq("store_id", body.store_id)
      .eq("source", "n8n")

    const existingByUrl = new Map<string, string>()
    for (const row of existing ?? []) {
      const r = row as { id: string; url: string | null }
      if (r.url) existingByUrl.set(r.url.toLowerCase(), r.id)
    }

    let inserted = 0
    let updated = 0

    for (const c of body.competitors) {
      const urlKey = c.url?.toLowerCase()
      const existingId = urlKey ? existingByUrl.get(urlKey) : undefined

      const payload = {
        name: c.name,
        url: c.url ?? null,
        posicionamento: c.posicionamento ?? null,
        notas: c.notas ?? null,
        source: "n8n",
      }

      if (existingId) {
        const { error } = await admin
          .from("client_competitors")
          .update(payload)
          .eq("id", existingId)
        if (error) throw error
        updated++
      } else {
        const { error } = await admin
          .from("client_competitors")
          .insert({ store_id: body.store_id, ...payload })
        if (error) throw error
        inserted++
      }
    }

    return successResponse(request, {
      store_id: body.store_id,
      inserted,
      updated,
      manual_preserved: true,
    })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/competitors")
  }
}
