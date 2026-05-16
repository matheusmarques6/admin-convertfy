/**
 * POST /api/webhooks/n8n/ads-analyzer/briefing-markdown
 *
 * Callback do n8n com o briefing completo em markdown gerado pelo AI Agent.
 * Arquiva a versão atual e insere a nova como current em store_briefings.
 *
 * Auth: header x-secret == N8N_WEBHOOK_SECRET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, parseAndValidate, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const schema = z.object({
  store_id: z.string().uuid(),
  raw_text: z.string().trim().min(1).max(200_000),
  mode: z.string().trim().max(50).optional().nullable(),
  generated_at: z.string().datetime().optional().nullable(),
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

    // Pega versão atual para arquivar e calcular próxima
    const { data: current } = await admin
      .from("store_briefings")
      .select("id, version")
      .eq("store_id", body.store_id)
      .eq("status", "current")
      .maybeSingle()

    const nextVersion = current ? ((current as { version: number }).version ?? 1) + 1 : 1

    if (current) {
      const { error: archErr } = await admin
        .from("store_briefings")
        .update({ status: "archived" })
        .eq("id", (current as { id: string }).id)
      if (archErr) throw archErr
    }

    const generatedAt = body.generated_at ?? new Date().toISOString()
    // Salva como `raw_text` para alinhar com BriefingData["raw_text"] que
    // StoreBriefingView já sabe renderizar.
    const { data: inserted, error: insErr } = await admin
      .from("store_briefings")
      .insert({
        store_id: body.store_id,
        briefing_data: {
          raw_text: body.raw_text,
          mode: body.mode ?? null,
          source: "n8n:ads-analyzer",
        },
        version: nextVersion,
        generated_at: generatedAt,
        generated_by: "n8n:ads-analyzer",
        status: "current",
      })
      .select("id, version")
      .single()
    if (insErr) throw insErr

    return successResponse(request, {
      store_id: body.store_id,
      briefing_id: (inserted as { id: string }).id,
      version: (inserted as { version: number }).version,
    })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/briefing-markdown")
  }
}
