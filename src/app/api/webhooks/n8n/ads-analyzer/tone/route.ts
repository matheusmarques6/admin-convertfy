/**
 * POST /api/webhooks/n8n/ads-analyzer/tone
 *
 * Callback do workflow n8n. Persiste tom de comunicação inferido
 * pelo AI Agent a partir das copies de ads.
 *
 * Disparado apenas no branch `Tem Advertiser`.
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

const schema = z.object({
  store_id: z.string().uuid(),
  description: z.string().min(60).max(1500),
  do_phrases: z.array(z.string().min(3)).min(2).max(15),
  dont_phrases: z.array(z.string().min(3)).min(2).max(15),
  use_words: z.array(z.string().min(2)).min(2).max(30),
  avoid_words: z.array(z.string().min(2)).min(2).max(30),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update({
        tone_description: body.description,
        tone_do: body.do_phrases,
        tone_dont: body.dont_phrases,
        tone_use_words: body.use_words,
        tone_avoid_words: body.avoid_words,
      })
      .eq("id", body.store_id)
      .select("id")
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError("Loja")

    logger.info("[n8n:ads-analyzer/tone] persisted", {
      store_id: body.store_id,
    })

    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:ads-analyzer/tone")
  }
}
