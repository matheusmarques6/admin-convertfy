/**
 * POST /api/webhooks/n8n/tone
 *
 * Callback do n8n que popula a área "04 Tom de Comunicação" da Pesquisa.
 * Persiste em `client_stores`:
 *   - description  → tone_description (text — parágrafos)
 *   - do_phrases   → tone_do (text[] — frases-exemplo positivas)
 *   - dont_phrases → tone_dont (text[] — frases que NÃO devem aparecer)
 *   - use_words    → tone_use_words (text[] — glossário positivo)
 *   - avoid_words  → tone_avoid_words (text[] — glossário negativo)
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
  description: z.string().min(60).max(2000),
  do_phrases: z.array(z.string().min(3).max(240)).min(2).max(12),
  dont_phrases: z.array(z.string().min(3).max(240)).min(2).max(12),
  use_words: z.array(z.string().min(2).max(60)).min(2).max(40),
  avoid_words: z.array(z.string().min(2).max(60)).min(2).max(40),
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

    logger.info("[n8n:tone] persisted", { store_id: body.store_id })
    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:tone")
  }
}
