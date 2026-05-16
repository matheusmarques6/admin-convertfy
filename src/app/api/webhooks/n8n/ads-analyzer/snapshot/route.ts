/**
 * POST /api/webhooks/n8n/ads-analyzer/snapshot
 *
 * Callback do workflow n8n "Analisador de ADS".
 * Persiste o §Snapshot extraído do markdown do AI Agent
 * em client_stores.brand_thesis.
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
  snapshot_text: z.string().trim().min(1).max(10_000),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-secret")
    const { store_id, snapshot_text } = await parseAndValidate(request, schema)

    const admin = createAdminClient()
    const { error } = await admin
      .from("client_stores")
      .update({ brand_thesis: snapshot_text })
      .eq("id", store_id)

    if (error) throw error

    return successResponse(request, { store_id, updated: "brand_thesis" })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/snapshot")
  }
}
