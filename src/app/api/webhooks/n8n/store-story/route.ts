/**
 * POST /api/webhooks/n8n/store-story
 *
 * Callback do n8n que popula a área "02 Sobre a loja" da Pesquisa.
 * Persiste em `client_stores`:
 *   - story       → store_story (text — 3 parágrafos)
 *   - milestones  → store_milestones (jsonb — Array<{year, event, ...}>)
 *
 * Schema alinhado com PesquisaData (pesquisa-section.tsx:64-66 +
 * interface Milestone:46-51).
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

const milestoneSchema = z.object({
  year: z.string().min(1).max(20),
  event: z.string().min(1).max(300),
  highlight: z.boolean().optional(),
  muted: z.boolean().optional(),
})

const schema = z.object({
  store_id: z.string().uuid(),
  // Echo opcional do n8n — liga o guard anti-contaminação de loja.
  store_url: z.string().optional().nullable(),
  story: z.string().min(80).max(6000),
  milestones: z.array(milestoneSchema).min(1).max(20),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    await assertStoreUrlMatches(body.store_id, body.store_url, "n8n:store-story")

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update({
        store_story: body.story,
        store_milestones: body.milestones,
      })
      .eq("id", body.store_id)
      .select("id")
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError("Loja")

    logger.info("[n8n:store-story] persisted", {
      store_id: body.store_id,
      milestones: body.milestones.length,
    })
    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:store-story")
  }
}
