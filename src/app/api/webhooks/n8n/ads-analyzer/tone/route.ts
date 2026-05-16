/**
 * POST /api/webhooks/n8n/ads-analyzer/tone
 *
 * Callback do n8n com inferência de tom de comunicação baseada em copies
 * de advertiserTopAds. Persiste em client_stores.tone_*.
 *
 * Auth: header x-secret == N8N_WEBHOOK_SECRET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, parseAndValidate } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const schema = z.object({
  store_id: z.string().uuid(),
  description: z.string().trim().min(1).optional().nullable(),
  do_phrases: z.array(z.string().trim().min(1)).max(30).optional().nullable(),
  dont_phrases: z.array(z.string().trim().min(1)).max(30).optional().nullable(),
  use_words: z.array(z.string().trim().min(1)).max(50).optional().nullable(),
  avoid_words: z.array(z.string().trim().min(1)).max(50).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-secret")
    const body = await parseAndValidate(request, schema)

    const update: Record<string, unknown> = {}
    if (body.description !== undefined && body.description !== null) update.tone_description = body.description
    if (body.do_phrases) update.tone_do = body.do_phrases
    if (body.dont_phrases) update.tone_dont = body.dont_phrases
    if (body.use_words) update.tone_use_words = body.use_words
    if (body.avoid_words) update.tone_avoid_words = body.avoid_words

    if (Object.keys(update).length === 0) {
      return successResponse(request, { store_id: body.store_id, updated: [] })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from("client_stores")
      .update(update)
      .eq("id", body.store_id)

    if (error) throw error

    return successResponse(request, { store_id: body.store_id, updated: Object.keys(update) })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/tone")
  }
}
