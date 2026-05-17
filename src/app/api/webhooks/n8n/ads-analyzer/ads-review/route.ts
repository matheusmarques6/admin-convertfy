/**
 * POST /api/webhooks/n8n/ads-analyzer/ads-review
 *
 * Callback do workflow n8n. Persiste score + análise dos anúncios
 * em client_stores.ads_*.
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
  score: z.number().min(0).max(100),
  summary: z.string().min(50).max(2500),
  sub_scores: z
    .object({
      hook: z.number().min(0).max(100),
      clarity: z.number().min(0).max(100),
      proof: z.number().min(0).max(100),
      cta: z.number().min(0).max(100),
      creative: z.number().min(0).max(100),
    })
    .passthrough(),
  strengths: z.array(z.string().min(3)).min(1).max(10),
  opportunities: z.array(z.string().min(3)).min(1).max(10),
  risks: z.array(z.string().min(3)).min(0).max(10),
  sample_ads_analyzed: z.number().int().min(0).optional(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update({
        ads_score: body.score,
        ads_summary: body.summary,
        ads_sub_scores: body.sub_scores,
        ads_strengths: body.strengths,
        ads_opportunities: body.opportunities,
        ads_risks: body.risks,
      })
      .eq("id", body.store_id)
      .select("id")
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError("Loja")

    logger.info("[n8n:ads-analyzer/ads-review] persisted", {
      store_id: body.store_id,
      score: body.score,
    })

    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:ads-analyzer/ads-review")
  }
}
