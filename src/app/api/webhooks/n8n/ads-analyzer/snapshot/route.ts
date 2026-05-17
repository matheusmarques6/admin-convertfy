/**
 * POST /api/webhooks/n8n/ads-analyzer/snapshot
 *
 * Callback do workflow n8n "Analisador de ADS".
 * Persiste a tese de marca (snapshot) gerada pelo AI Agent
 * em client_stores.brand_thesis.
 *
 * Auth: header x-webhook-secret == N8N_WEBHOOK_SECRET
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
  snapshot_text: z.string().min(50).max(4000),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update({ brand_thesis: body.snapshot_text })
      .eq("id", body.store_id)
      .select("id")
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError("Loja")

    logger.info("[n8n:ads-analyzer/snapshot] persisted", {
      store_id: body.store_id,
    })

    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:ads-analyzer/snapshot")
  }
}
